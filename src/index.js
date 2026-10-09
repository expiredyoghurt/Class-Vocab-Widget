// ================= SETTINGS =================
const MW_FEED_URL = "https://www.merriam-webster.com/wotd/feed/rss2";
const WORDSMITH_FEED_URL = "https://wordsmith.org/awad/rss1.xml";
const TFD_FEED_URL = "http://www.thefreedictionary.com/_/WoD/rss.aspx";
const NYT_FEED_URL =
  "https://www.nytimes.com/svc/collections/v1/publish/https://www.nytimes.com/column/learning-word-of-the-day/rss.xml";
const NYT_PAGE_URL = "https://www.nytimes.com/column/learning-word-of-the-day";
const MAX_STALE_DAYS = 3; // if a source keeps failing, hide its old word after this many days
// ============================================

const KV_KEY = "latest";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ---------- helpers ----------
async function get(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ClassVocabWidget/2.0)",
      "Accept-Language": "en",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}
function clean(s) {
  return decode(decode(s)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function rawTag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
}
function tag(xml, name) { return clean(rawTag(xml, name)); }
function firstItem(xml) {
  const m = xml.match(/<item[ >]([\s\S]*?)<\/item>/i);
  if (!m) throw new Error("Feed has no items");
  return m[1];
}
function meta(html, prop) {
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i"));
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i"));
  return clean((a || b || [])[1] || "");
}
function shorten(text, max = 240) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return (stop > 80 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, "") + "…");
}
function safeDate(s) {
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}
function stripPrefix(title) {
  return title.replace(/^word of the day\s*[:\-–—]\s*/i, "").trim();
}

// ---------- source 1: Merriam-Webster ----------
async function getMW() {
  const item = firstItem(await get(MW_FEED_URL));
  const desc = rawTag(item, "description");
  const word = tag(item, "title");
  const definition = tag(item, "merriam:shortdef");
  if (!word || !definition) throw new Error("word/definition missing");
  return {
    source: "Merriam-Webster",
    word,
    definition,
    pronunciation: (desc.match(/\\([^\\<]{2,40})\\/) || [])[1] || "",
    partOfSpeech: (desc.match(/<em>(noun phrase|verb phrase|noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection)<\/em>/i) || [])[1] || "",
    url: tag(item, "link") || "https://www.merriam-webster.com/word-of-the-day",
    date: safeDate(tag(item, "pubDate")),
  };
}

// ---------- source 2: Wordsmith A.Word.A.Day ----------
async function getWordsmith() {
  const item = firstItem(await get(WORDSMITH_FEED_URL));
  const word = tag(item, "title");
  const desc = tag(item, "description"); // e.g. "adjective: Producing only..."
  const m = desc.match(/^([a-z ,\/]{2,30}):\s*([\s\S]+)$/i);
  if (!word || !desc) throw new Error("word/definition missing");
  return {
    source: "A.Word.A.Day",
    word,
    definition: shorten(m ? m[2] : desc),
    pronunciation: "",
    partOfSpeech: m ? m[1].trim() : "",
    url: tag(item, "link") || "https://wordsmith.org/words/today.html",
    date: safeDate(tag(item, "pubDate")),
  };
}

// ---------- source 3: The Free Dictionary ----------
async function getTFD() {
  const item = firstItem(await get(TFD_FEED_URL));
  const word = stripPrefix(tag(item, "title"));
  let definition = tag(item, "description");
  // Remove a repeated word at the very start, e.g. "ephemeral - lasting a short time"
  definition = definition.replace(new RegExp(`^${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:\\-–—]?\\s*`, "i"), "");
  if (!word || !definition) throw new Error("word/definition missing");
  return {
    source: "The Free Dictionary",
    word,
    definition: shorten(definition),
    pronunciation: "",
    partOfSpeech: "",
    url: tag(item, "link") || "https://www.thefreedictionary.com/",
    date: safeDate(tag(item, "pubDate")),
  };
}

// ---------- source 4: New York Times (best effort) ----------
async function getNYT() {
  // Attempt A: the column's RSS feed
  try {
    const item = firstItem(await get(NYT_FEED_URL));
    const word = stripPrefix(tag(item, "title"));
    const definition = tag(item, "description");
    if (word && definition) {
      return {
        source: "The New York Times",
        word,
        definition: shorten(definition),
        pronunciation: "",
        partOfSpeech: "",
        url: tag(item, "link") || NYT_PAGE_URL,
        date: safeDate(tag(item, "pubDate")),
      };
    }
  } catch (e) { /* fall through to attempt B */ }

  // Attempt B: find the newest article link on the column page
  const page = await get(NYT_PAGE_URL);
  const link = (page.match(/href=["'](https:\/\/www\.nytimes\.com\/\d{4}\/\d{2}\/\d{2}\/learning\/[^"']+|\/\d{4}\/\d{2}\/\d{2}\/learning\/[^"']+)["']/i) || [])[1];
  if (!link) throw new Error("Could not find an article link (NYT may be blocking this request)");
  const articleUrl = link.startsWith("http") ? link : "https://www.nytimes.com" + link;
  const html = await get(articleUrl);
  const word = stripPrefix(meta(html, "og:title").replace(/\s*[|–-]\s*The New York Times.*$/i, ""));
  const definition = meta(html, "og:description") || meta(html, "description");
  if (!word || !definition) throw new Error("word/definition missing on article page");
  return {
    source: "The New York Times",
    word,
    definition: shorten(definition),
    pronunciation: "",
    partOfSpeech: "",
    url: articleUrl,
    date: safeDate(meta(html, "article:published_time")),
  };
}

// ---------- gather everything and save ----------
// To remove a source from the widget, delete its line here.
const SOURCES = [
  { id: "mw", run: getMW },
  { id: "wordsmith", run: getWordsmith },
  { id: "tfd", run: getTFD },
  { id: "nyt", run: getNYT },
];

async function harvest(env) {
  const previous = JSON.parse((await env.VOCAB_STORE.get(KV_KEY)) || "{}");
  const prevById = Object.fromEntries((previous.words || []).map((w) => [w.id, w]));
  const now = new Date();
  const results = await Promise.allSettled(SOURCES.map((s) => s.run()));

  const words = [];
  const errors = {};
  results.forEach((r, i) => {
    const id = SOURCES[i].id;
    if (r.status === "fulfilled") {
      words.push({ id, ...r.value, fetchedAt: now.toISOString() });
    } else {
      errors[id] = r.reason.message;
      console.log(`Source ${id} failed:`, r.reason.message);
      const old = prevById[id];
      const ageDays = old ? (now - new Date(old.fetchedAt)) / 86400000 : Infinity;
      if (old && ageDays <= MAX_STALE_DAYS) words.push(old); // keep recent value
    }
  });

  const data = { updatedAt: now.toISOString(), words };
  if (words.length) await env.VOCAB_STORE.put(KV_KEY, JSON.stringify(data));
  return { data, errors };
}

// ---------- the Worker ----------
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(harvest(env));
  },

  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);

    // Test/debug link: /refresh?key=YOUR_SECRET  (shows which sources worked)
    if (url.pathname === "/refresh") {
      if (!env.REFRESH_KEY || url.searchParams.get("key") !== env.REFRESH_KEY) {
        return new Response(JSON.stringify({ error: "Not allowed" }), {
          status: 403, headers: { "Content-Type": "application/json", ...CORS },
        });
      }
      const { data, errors } = await harvest(env);
      return new Response(JSON.stringify({ errors, ...data }, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS },
      });
    }

    let stored = await env.VOCAB_STORE.get(KV_KEY);
    if (!stored) stored = JSON.stringify((await harvest(env)).data); // very first visit
    return new Response(stored, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        ...CORS,
      },
    });
  },
};

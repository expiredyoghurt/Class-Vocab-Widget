# Class Words of the Day — Cloudflare Worker + Google Sites Widget

Every day (Monday–Sunday) a Cloudflare Worker collects the Word of the Day from up to four sources, saves them, and serves them to a pretty widget on your Google Site. The widget has **◀ Previous day / Next day ▶** buttons and a **↩ Back to today** button, so students can look back at earlier words (the last 14 days are kept).

| Source | How it's read |
|---|---|
| Merriam-Webster | RSS feed (tested, reliable) |
| A.Word.A.Day (Wordsmith) | RSS feed (tested, reliable) |
| The Free Dictionary | RSS feed (**untested** – their site blocks my testing tools) |
| The New York Times | RSS, then page fallback (**best effort** – NYT often blocks automated requests and its terms restrict scraping; it may not work) |

If one source fails, the others still show. You will find out exactly which one failed in Step 6.

**You do not need to install anything.** Everything below is done in your web browser (GitHub + Cloudflare dashboard).

---

## What's in this folder

| File | What it is |
|---|---|
| `src/index.js` | The Worker code (collects + serves the words) |
| `wrangler.jsonc` | Settings: the daily schedule and the storage connection |
| `package.json`, `.gitignore` | Housekeeping files Cloudflare/GitHub expect |
| `google-sites-widget.html` | The code you paste into Google Sites |
| `README.md` | This guide |

---

## Step 1 — Put the files on GitHub

1. Sign in at **github.com** (create a free account if needed).
2. Click **+** (top right) → **New repository**.
3. Name it `class-vocab-widget`. Choose **Private** (recommended). Leave every other option empty/unticked (no README, no .gitignore). Click **Create repository**.
4. On the new empty repo page, click **uploading an existing file**.
5. Unzip this download on your computer. Drag in **everything inside the folder**: the `src` folder (with `index.js` inside), `wrangler.jsonc`, `package.json`, `.gitignore`, `google-sites-widget.html`, and `README.md`.
   - Tip: drag the `src` **folder itself** so GitHub keeps `src/index.js` in the right place. Check the file list shows `src/index.js` before continuing.
   - `.gitignore` may be hidden on your computer. If you can't see it, skip it; it isn't required.
6. Scroll down and click **Commit changes**.

## Step 2 — Create the storage (KV) in Cloudflare

1. Sign in at **dash.cloudflare.com** (free account is fine).
2. In the left menu go to **Storage & Databases → KV** (labels may differ slightly).
3. Click **Create** (or **Create a namespace**). Name it `VOCAB_STORE`. Click **Add/Create**.
4. In the list of namespaces, find `VOCAB_STORE` and **copy its ID** (a long string of letters and numbers).

## Step 3 — Paste the KV ID into the config (on GitHub)

1. On GitHub, open your repo and click the file **`wrangler.jsonc`**.
2. Click the **pencil icon** (Edit).
3. Replace `PASTE_YOUR_KV_NAMESPACE_ID_HERE` with the ID you copied. Keep the quotation marks.
4. Click **Commit changes…** → **Commit changes**.

## Step 4 — Connect the repo to Cloudflare

1. In the Cloudflare dashboard go to **Workers & Pages** → **Create** (or **Create application**).
2. Choose **Import a repository** (sometimes shown as "Connect to Git").
3. Click **GitHub**, sign in, and allow Cloudflare to access **only** the `class-vocab-widget` repository.
4. Select the repo and click **Next**.
5. **Project name:** `class-vocab-widget` — it **must match** the `"name"` in `wrangler.jsonc`. (If you want a different name, change the name in `wrangler.jsonc` on GitHub first.)
6. Leave the other settings as they are (build command empty; deploy command `npx wrangler deploy`).
7. Click **Save and Deploy**. Wait for the build to finish (about a minute).
8. When it succeeds, Cloudflare shows your Worker's address, like:
   `https://class-vocab-widget.YOUR-SUBDOMAIN.workers.dev`
   **Copy it** — you need it in Steps 6 and 7.

From now on, every time you edit a file on GitHub, Cloudflare redeploys automatically.

## Step 5 — Add a private test password

1. In Cloudflare open **Workers & Pages → class-vocab-widget → Settings**.
2. Find **Variables and Secrets** → **Add**.
3. Type: **Secret**. Name: `REFRESH_KEY`. Value: any password you invent (letters and numbers, no spaces).
4. Click **Deploy/Save**.

## Step 6 — Test it right now (don't wait for tomorrow)

Open this in your browser (swap in your address and password):

```
https://class-vocab-widget.YOUR-SUBDOMAIN.workers.dev/refresh?key=YOUR_PASSWORD
```

You'll see a block of text (JSON).

- Look at the top for `"errors"`.
  - `"errors": {}` → all sources worked. 🎉
  - `"errors": { "nyt": "HTTP 403" }` → NYT blocked the request (common). The others still work.
  - `"errors": { "tfd": "..." }` → The Free Dictionary didn't parse. Send the message to your helper/Claude and ask for a fix.
- Below that you'll see each word under `"words"`.

Then open the plain address (without `/refresh…`). That's what the widget reads.

**Don't share the `/refresh` link.** Treat it as your private "update now" button.

## Step 7 — Add the widget to Google Sites

1. Open `google-sites-widget.html` (on GitHub or on your computer, in any text editor).
2. Find this line and put your Worker address in the quotes:
   `const WORKER_URL = "https://class-vocab-widget.YOUR-SUBDOMAIN.workers.dev";`
3. Select and copy **the whole file**.
4. In Google Sites: **Insert → Embed → Embed code** tab → paste → **Next → Insert**.
5. Drag the box to roughly **680 px tall**.
6. **Publish** your site.

---

## Previous days: how it works

- Each daily run saves that day's words alongside the earlier days.
- History **starts building from your first run**, so at first the Previous day button is greyed out. It fills up over the following days. Past days can't be backfilled.
- Running the Step 6 test link again on the same day **replaces** today's entry; it doesn't create an extra day.

## Updating an older version of this project

If you already deployed the first version of this package:
1. On GitHub, open `src/index.js` → pencil icon → replace everything with the new file's contents → Commit. Cloudflare redeploys by itself.
2. Open `google-sites-widget.html`, set your `WORKER_URL`, copy it all, and paste it into your Google Sites embed (replacing the old code).
3. Run the Step 6 test link once. Your earlier single-day data isn't carried over; history starts fresh.

## Customising

**Change the time.** Edit `"crons"` in `wrangler.jsonc` on GitHub. Cron uses **UTC**.
Format: `minute hour day-of-month month day-of-week`.

| Want | Use |
|---|---|
| Every day 07:30 UTC (current) | `"30 7 * * *"` |
| Weekdays only, 07:30 UTC | `"30 7 * * 1-5"` |
| 7:30 AM at UTC+8, every day | `"30 23 * * *"` |

To convert: local time minus your UTC offset = UTC hour. If that falls on the previous day, it's fine, since every-day schedules don't care.

**Remove a source** (e.g. NYT): in `src/index.js`, delete its line in the `SOURCES` list (near the bottom of the helper section). The widget adapts automatically.

**How many past days to keep:** change `HISTORY_DAYS` at the top of `src/index.js` (default 14).

**Which day counts as "today":** change `TIMEZONE` at the top of `src/index.js` (default `"UTC"`). Use your own, e.g. `"Asia/Singapore"` or `"America/New_York"`, so the day labels on the buttons match your calendar.

**How long an old word stays when a source is down:** change `MAX_STALE_DAYS` at the top of `src/index.js`.

## Troubleshooting

- **Build fails with a name mismatch:** the Worker name in Cloudflare must equal `"name"` in `wrangler.jsonc`.
- **Build fails mentioning KV / `id`:** you haven't pasted the namespace ID (Step 3), or there's a typo/missing quote.
- **Widget says "aren't available right now":** open the Worker address directly in a browser. If that shows JSON, re-check that `WORKER_URL` in the embed has no typo or trailing slash. If it shows an error, run Step 6.
- **Widget shows nothing new next day:** in Cloudflare open the Worker → **Settings → Trigger Events** (cron) and confirm the schedule is listed; also check **Logs** for failures.
- **The Previous day button is greyed out:** only one day has been saved so far. Check again after tomorrow's run.
- **A card shows a date from days ago:** that source hasn't published or is failing; its last good word is kept for up to 3 days, then hidden.

## A note on fair use

The widget shows each site's short definition and links back to the original. Please keep it that way, and check each site's terms before changing it to show more of their content.

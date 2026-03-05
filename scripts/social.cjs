// scripts/social.cjs
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "shots");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const KEYWORDS = [
  "polymarket", "kalshi", "opinion", "myriad", "predict.fun", "predictfun",
  "forecastEx", "ibkr", "Trump", "election", "airdrop", "hack", "exploit"
];

// You can add/remove accounts here.
// Without Twitter API: try Nitter RSS (public instances may be flaky).
const NITTER_HOSTS = [
  "https://nitter.net",
  "https://nitter.privacydev.net",
  "https://nitter.fdn.fr",
];

const ACCOUNTS = [
  { source: "Polymarket (X)", type: "nitter", handle: "Polymarket" },
  { source: "Kalshi (X)", type: "nitter", handle: "Kalshi" },
  { source: "Opinion (X)", type: "nitter", handle: "OpinionTrade" },
  { source: "Myriad (X)", type: "nitter", handle: "MyriadMarkets" },
];

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "vizo-monitor/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Minimal RSS parser (good enough for titles/links/dates)
function parseRSS(xml, sourceName) {
  const items = [];
  const itemBlocks = xml.split("<item>").slice(1);
  for (const blk of itemBlocks.slice(0, 20)) {
    const title = (blk.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || blk.match(/<title>(.*?)<\/title>/))?.[1];
    const link = (blk.match(/<link>(.*?)<\/link>/) || [])[1];
    const pubDate = (blk.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1];
    if (!title || !link) continue;
    items.push({
      source: sourceName,
      title: title.replace(/\s+/g, " ").trim(),
      url: link.trim(),
      publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
    });
  }
  return items;
}

function scoreItem(title) {
  const t = title.toLowerCase();
  let s = 0;
  for (const k of KEYWORDS) {
    if (t.includes(k.toLowerCase())) s += 2;
  }
  if (t.includes("breaking")) s += 3;
  if (t.includes("exploit") || t.includes("hack")) s += 5;
  if (t.includes("trump") || t.includes("election")) s += 3;
  return s;
}

(async () => {
  const now = new Date().toISOString();
  const out = { generatedAt: now, items: [], errors: [] };

  for (const acc of ACCOUNTS) {
    if (acc.type !== "nitter") continue;

    let ok = false;
    for (const host of NITTER_HOSTS) {
      const rssUrl = `${host}/${acc.handle}/rss`;
      try {
        const xml = await fetchText(rssUrl);
        const items = parseRSS(xml, acc.source);
        items.forEach((it) => {
          const s = scoreItem(it.title);
          out.items.push({
            ...it,
            score: s,
            hot: s >= 6,
          });
        });
        ok = true;
        break;
      } catch (e) {
        out.errors.push({ source: acc.source, rssUrl, error: String(e?.message || e) });
      }
    }
    if (!ok) {
      // keep going
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, "social.json"), JSON.stringify(out, null, 2));
  console.log("Wrote shots/social.json");
})();

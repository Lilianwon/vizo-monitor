#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const OUT = path.join("shots", "social.json");

const KEYWORDS = [
  "Polymarket",
  "Kalshi",
  "Opinion prediction market",
  "Myriad prediction market",
  "Predict.fun prediction market",
  "ForecastEx IBKR forecastex",
  "Overtime prediction market",
  "Trump Polymarket market",
  "VIZO prediction market",
];

function nowISO(){ return new Date().toISOString(); }
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function spikeScore(last24h, baseline7d){
  const base = Math.max(1, baseline7d);
  return clamp(last24h / base, 0, 99);
}

async function fetchText(url){
  const r = await fetch(url, { headers: { "user-agent": "vizo-monitor/1.0" }});
  if(!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

function parseRSSItems(xml){
  const items = [];
  const blocks = xml.split("<item>").slice(1);
  for(const b of blocks){
    const part = b.split("</item>")[0] || "";
    const title = (part.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i)?.[1]
                || part.match(/<title>(.*?)<\/title>/i)?.[1]
                || "").trim();
    const link = (part.match(/<link>(.*?)<\/link>/i)?.[1] || "").trim();
    const pub = (part.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1] || "").trim();
    if(link) items.push({ title, url: link, source: "GoogleNews", publishedAt: pub });
  }
  return items;
}

async function googleNewsRSS(q){
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await fetchText(url);
  return parseRSSItems(xml);
}

async function redditSearch(q){
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&t=day&limit=10`;
  const r = await fetch(url, { headers: { "user-agent": "vizo-monitor/1.0" }});
  if(!r.ok) return [];
  const j = await r.json();
  return (j?.data?.children || []).map(c => {
    const d = c.data || {};
    return {
      title: d.title,
      url: `https://www.reddit.com${d.permalink}`,
      source: "Reddit",
      publishedAt: new Date((d.created_utc||0)*1000).toUTCString()
    };
  });
}

(async function main(){
  const topics = [];

  for(const kw of KEYWORDS){
    const news = await googleNewsRSS(kw).catch(()=>[]);
    const reddit = await redditSearch(kw).catch(()=>[]);
    const items = [...news, ...reddit].slice(0, 12);

    const last24h = items.length;
    const baseline7d = Math.max(1, Math.round(last24h * 0.6)); // 保守基线，先跑通再做历史均值

    topics.push({
      keyword: kw,
      last24h,
      baseline7d,
      spikeScore: spikeScore(last24h, baseline7d),
      items
    });
  }

  fs.mkdirSync("shots", { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: nowISO(), topics }, null, 2));
  console.log("Wrote", OUT);
})();

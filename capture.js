// capture.js
// Fetch numeric metrics from Dune queries and write to shots/metrics.json

const fs = require("fs");
const path = require("path");

const DUNE_API_KEY = process.env.DUNE_API_KEY;

// 你只需要改这里：每个市场填 1 个 queryId + 1 个 Dune 链接
// 要求：该 query 的结果第一行要包含下面三个字段（字段名可以改，在 fieldMap 里改）：
// daily_volume, weekly_volume, monthly_volume
const MARKETS = [
  {
    key: "polymarket",
    name: "Polymarket",
    queryId: 5756284, // 你现在给我的这个先放这；如果它不是“日/周/月”那你就换成对应的 queryId
    duneUrl: "https://dune.com/datadashboards/polymarket-overview",
    fieldMap: {
      daily: "daily_volume",
      weekly: "weekly_volume",
      monthly: "monthly_volume",
    },
  },
  {
    key: "kalshi",
    name: "Kalshi",
    queryId: 0, // TODO: 换成你的
    duneUrl: "https://dune.com/xxx/kalshi",
    fieldMap: { daily: "daily_volume", weekly: "weekly_volume", monthly: "monthly_volume" },
  },
  {
    key: "opinion",
    name: "Opinion",
    queryId: 0, // TODO
    duneUrl: "https://dune.com/xxx/opinion",
    fieldMap: { daily: "daily_volume", weekly: "weekly_volume", monthly: "monthly_volume" },
  },
  {
    key: "myriad",
    name: "Myriad",
    queryId: 0, // TODO
    duneUrl: "https://dune.com/xxx/myriad",
    fieldMap: { daily: "daily_volume", weekly: "weekly_volume", monthly: "monthly_volume" },
  },
];

function fmtNumber(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  // 你可以按需改格式：这里是 K/M/B
  const abs = Math.abs(x);
  if (abs >= 1e9) return (x / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (x / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (x / 1e3).toFixed(2) + "K";
  return x.toFixed(2);
}

async function fetchDuneResults(queryId) {
  const url = `https://api.dune.com/api/v1/query/${queryId}/results?limit=1000`;
  const res = await fetch(url, {
    headers: { "x-dune-api-key": DUNE_API_KEY },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dune API error ${res.status} for query ${queryId}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
  if (!DUNE_API_KEY) {
    throw new Error("Missing DUNE_API_KEY (GitHub secret).");
  }

  const outDir = path.join(__dirname, "shots");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const results = [];

  for (const m of MARKETS) {
    if (!m.queryId || m.queryId === 0) {
      results.push({
        key: m.key,
        name: m.name,
        duneUrl: m.duneUrl,
        error: "queryId not set",
      });
      continue;
    }

    try {
      const data = await fetchDuneResults(m.queryId);

      const rows = data?.result?.rows || [];
      const row0 = rows[0] || {};

      const dailyRaw = row0[m.fieldMap.daily];
      const weeklyRaw = row0[m.fieldMap.weekly];
      const monthlyRaw = row0[m.fieldMap.monthly];

      results.push({
        key: m.key,
        name: m.name,
        duneUrl: m.duneUrl,
        queryId: m.queryId,
        daily: fmtNumber(dailyRaw),
        weekly: fmtNumber(weeklyRaw),
        monthly: fmtNumber(monthlyRaw),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      results.push({
        key: m.key,
        name: m.name,
        duneUrl: m.duneUrl,
        queryId: m.queryId,
        error: String(e?.message || e),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    markets: results,
  };

  fs.writeFileSync(path.join(outDir, "metrics.json"), JSON.stringify(payload, null, 2), "utf-8");

  console.log("Wrote shots/metrics.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

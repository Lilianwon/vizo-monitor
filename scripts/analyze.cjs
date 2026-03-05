// scripts/analyze.cjs
// Generate shots/metrics.json from Dune query results (daily/weekly/monthly volume)

const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "shots");
const OUT_FILE = path.join(OUT_DIR, "metrics.json");

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} (GitHub secret).`);
  return v;
}

function toNumber(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "string") {
    const n = Number(x.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickFromRow(row, patterns) {
  if (!row || typeof row !== "object") return null;

  // exact / fuzzy key match
  const keys = Object.keys(row);
  for (const p of patterns) {
    // exact
    for (const k of keys) {
      if (k.toLowerCase() === p) {
        const n = toNumber(row[k]);
        if (n !== null) return n;
      }
    }
    // includes
    for (const k of keys) {
      if (k.toLowerCase().includes(p)) {
        const n = toNumber(row[k]);
        if (n !== null) return n;
      }
    }
  }
  return null;
}

function extractPeriods(rows) {
  // Support multiple Dune result shapes.
  // We try:
  // 1) one-row with daily/weekly/monthly columns
  // 2) multiple rows with "period" / "value" (or similar)
  if (!Array.isArray(rows) || rows.length === 0) {
    return { daily: null, weekly: null, monthly: null, _note: "no rows" };
  }

  // case 1: one row summary columns
  const r0 = rows[0];

  const daily =
    pickFromRow(r0, ["daily", "day", "24h", "volume_24h", "vol_24h", "daily_volume", "day_volume"]) ??
    null;

  const weekly =
    pickFromRow(r0, ["weekly", "week", "7d", "volume_7d", "vol_7d", "weekly_volume", "week_volume"]) ??
    null;

  const monthly =
    pickFromRow(r0, ["monthly", "month", "30d", "volume_30d", "vol_30d", "monthly_volume", "month_volume"]) ??
    null;

  if (daily !== null || weekly !== null || monthly !== null) {
    return { daily, weekly, monthly, _note: "from summary columns" };
  }

  // case 2: period/value style rows
  // Try to find fields like period / timeframe / window and value / volume / amount
  const periodKey =
    ["period", "timeframe", "window", "bucket"].find((k) => k in r0) ||
    Object.keys(r0).find((k) => k.toLowerCase().includes("period") || k.toLowerCase().includes("time")) ||
    null;

  const valueKey =
    ["value", "volume", "vol", "amount", "usd", "total"].find((k) => k in r0) ||
    Object.keys(r0).find((k) => k.toLowerCase().includes("vol") || k.toLowerCase().includes("value")) ||
    null;

  if (!periodKey || !valueKey) {
    return { daily: null, weekly: null, monthly: null, _note: "unknown schema" };
  }

  let d = null,
    w = null,
    m = null;

  for (const row of rows) {
    const p = String(row[periodKey] ?? "").toLowerCase();
    const v = toNumber(row[valueKey]);

    if (v === null) continue;

    if (d === null && (p.includes("day") || p.includes("daily") || p.includes("24"))) d = v;
    if (w === null && (p.includes("week") || p.includes("weekly") || p.includes("7"))) w = v;
    if (m === null && (p.includes("month") || p.includes("monthly") || p.includes("30"))) m = v;
  }

  return { daily: d, weekly: w, monthly: m, _note: "from period/value rows" };
}

async function duneQueryResults(apiKey, queryId, limit = 1000) {
  const url = `https://api.dune.com/api/v1/query/${queryId}/results?limit=${limit}`;
  const res = await fetch(url, {
    headers: { "x-dune-api-key": apiKey },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dune API ${res.status} for query ${queryId}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();

  // Dune response: { result: { rows: [...] }, execution_id, ... }
  const rows = json?.result?.rows;
  if (!Array.isArray(rows)) return [];
  return rows;
}

async function main() {
  const DUNE_API_KEY = mustGetEnv("DUNE_API_KEY");

  const markets = [
    {
      key: "polymarket",
      name: "Polymarket",
      duneUrl: "https://dune.com/datadashboards/polymarket-overview",
      queryId: 5802915,
    },
    {
      key: "kalshi",
      name: "Kalshi",
      duneUrl: "https://dune.com/datadashboards/kalshi-overview",
      queryId: 5802836,
    },
    {
      key: "opinion",
      name: "Opinion",
      duneUrl: "https://dune.com/datadashboards/opinion",
      queryId: 6047958,
    },
    {
      key: "myriad",
      name: "Myriad",
      duneUrl: "https://dune.com/datadashboards/myriad",
      queryId: 5756303,
    },
    {
      key: "predict",
      name: "Predict (predict.fun)",
      duneUrl: "https://dune.com/datadashboards/predict-prediction-market-predictfun",
      queryId: 6365667,
    },
    {
      key: "ibkr",
      name: "IBKR ForecastEx",
      duneUrl: "https://dune.com/datadashboards/ibkr-forecastex",
      queryId: 6536996,
    },
  ];

  const out = {
    generatedAt: new Date().toISOString(),
    markets: [],
  };

  for (const m of markets) {
    const item = {
      key: m.key,
      name: m.name,
      duneUrl: m.duneUrl,
      queryId: m.queryId,
      daily: null,
      weekly: null,
      monthly: null,
      updatedAt: null,
    };

    try {
      const rows = await duneQueryResults(DUNE_API_KEY, m.queryId, 1000);
      const periods = extractPeriods(rows);
      item.daily = periods.daily;
      item.weekly = periods.weekly;
      item.monthly = periods.monthly;
      item.updatedAt = new Date().toISOString();

      // Optional debug in output (kept small)
      if (item.daily === null && item.weekly === null && item.monthly === null) {
        item.note = periods._note || "no matching fields";
      }
    } catch (e) {
      item.error = String(e?.message || e);
    }

    out.markets.push(item);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

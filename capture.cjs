// capture.cjs
// Fetch Dune query results (no overtime) -> shots/metrics.json
// Designed to be robust across different column naming styles.

const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "shots");
const OUT_FILE = path.join(OUT_DIR, "metrics.json");

const DUNE_API_KEY = process.env.DUNE_API_KEY;
if (!DUNE_API_KEY) {
  console.error("Error: Missing DUNE_API_KEY (GitHub secret).");
  process.exit(1);
}

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
    name: "Predict.fun",
    duneUrl: "https://dune.com/datadashboards/predict-prediction-market-predictfun",
    queryId: 6365667,
  },
  {
    key: "ibkr",
    name: "IBKR / ForecastEx",
    duneUrl: "https://dune.com/datadashboards/ibkr-forecastex",
    queryId: 6536996,
  },
];

// ---------- helpers ----------
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function isNumberLike(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "number" && Number.isFinite(v)) return true;
  if (typeof v === "string") {
    const s = v.trim().replace(/,/g, "");
    if (s === "") return false;
    const n = Number(s);
    return Number.isFinite(n);
  }
  return false;
}

function toNumber(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v.trim().replace(/,/g, ""));
  return null;
}

function pickFirstRow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

function findKeyInsensitive(obj, candidates) {
  if (!obj) return null;
  const keys = Object.keys(obj);
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit !== undefined) return hit;
  }
  return null;
}

function extractFromSingleRow(row) {
  // Try common shapes:
  // daily / weekly / monthly
  // daily_volume / weekly_volume / monthly_volume
  // volume_1d / volume_7d / volume_30d
  // notional_1d / notional_7d / notional_30d
  const dailyKey = findKeyInsensitive(row, [
    "daily",
    "daily_volume",
    "volume_daily",
    "notional_daily",
    "volume_1d",
    "notional_1d",
    "day_volume",
    "volume24h",
    "volume_24h",
  ]);
  const weeklyKey = findKeyInsensitive(row, [
    "weekly",
    "weekly_volume",
    "volume_weekly",
    "notional_weekly",
    "volume_7d",
    "notional_7d",
    "week_volume",
  ]);
  const monthlyKey = findKeyInsensitive(row, [
    "monthly",
    "monthly_volume",
    "volume_monthly",
    "notional_monthly",
    "volume_30d",
    "notional_30d",
    "month_volume",
  ]);

  const daily = dailyKey && isNumberLike(row[dailyKey]) ? toNumber(row[dailyKey]) : null;
  const weekly = weeklyKey && isNumberLike(row[weeklyKey]) ? toNumber(row[weeklyKey]) : null;
  const monthly = monthlyKey && isNumberLike(row[monthlyKey]) ? toNumber(row[monthlyKey]) : null;

  return { daily, weekly, monthly };
}

function extractFromPeriodRows(rows) {
  // Handle rows like:
  // { period: 'daily', value: 123 } / { timeframe: '1d', volume: 123 } etc
  const out = { daily: null, weekly: null, monthly: null };

  for (const r of rows) {
    if (!r || typeof r !== "object") continue;

    const periodKey = findKeyInsensitive(r, ["period", "timeframe", "window", "bucket", "interval", "range"]);
    const valueKey = findKeyInsensitive(r, [
      "value",
      "volume",
      "notional",
      "notional_volume",
      "trade_volume",
      "sum",
      "total",
      "amount",
      "usd_volume",
    ]);

    if (!periodKey || !valueKey) continue;
    const pRaw = String(r[periodKey] ?? "").toLowerCase();
    const val = isNumberLike(r[valueKey]) ? toNumber(r[valueKey]) : null;
    if (val === null) continue;

    const isDaily = /(^d$|day|daily|1d|24h)/.test(pRaw);
    const isWeekly = /(week|weekly|7d)/.test(pRaw);
    const isMonthly = /(month|monthly|30d|28d|31d)/.test(pRaw);

    if (isDaily && out.daily === null) out.daily = val;
    if (isWeekly && out.weekly === null) out.weekly = val;
    if (isMonthly && out.monthly === null) out.monthly = val;
  }

  return out;
}

function extractVolumes(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { daily: null, weekly: null, monthly: null };

  // First try single-row style
  const first = pickFirstRow(rows);
  const a = extractFromSingleRow(first);
  if (a.daily !== null || a.weekly !== null || a.monthly !== null) return a;

  // Then try period rows style
  const b = extractFromPeriodRows(rows);
  if (b.daily !== null || b.weekly !== null || b.monthly !== null) return b;

  // Otherwise give up (nulls)
  return { daily: null, weekly: null, monthly: null };
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "x-dune-api-key": DUNE_API_KEY },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function main() {
  ensureDir(OUT_DIR);

  const output = {
    generatedAt: new Date().toISOString(),
    markets: [],
  };

  for (const m of markets) {
    const base = {
      key: m.key,
      name: m.name,
      duneUrl: m.duneUrl,
      queryId: m.queryId,
      daily: null,
      weekly: null,
      monthly: null,
      updatedAt: new Date().toISOString(),
    };

    try {
      const url = `https://api.dune.com/api/v1/query/${m.queryId}/results?limit=1000`;
      const data = await fetchJson(url);

      const rows = data?.result?.rows || [];
      const { daily, weekly, monthly } = extractVolumes(rows);

      output.markets.push({
        ...base,
        daily,
        weekly,
        monthly,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      output.markets.push({
        ...base,
        error: String(e?.message || e),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), "utf8");
  console.log(`Wrote: ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

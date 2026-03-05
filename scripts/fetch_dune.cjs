// scripts/fetch_dune.cjs
// Fetch volumes from Dune query results and write to shots/metrics.json
// No overtime included.

const fs = require("fs");
const path = require("path");

const DUNE_API_KEY = process.env.DUNE_API_KEY;

if (!DUNE_API_KEY) {
  console.error("Missing DUNE_API_KEY. Add it in repo Settings -> Secrets and variables -> Actions.");
  process.exit(1);
}

const OUT_DIR = path.join(process.cwd(), "shots");
const OUT_FILE = path.join(OUT_DIR, "metrics.json");

function pickNumber(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") {
      const n = Number(obj[k]);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

// Try to infer daily/weekly/monthly from common column names across Dune queries.
function inferVolumesFromRow(row) {
  if (!row || typeof row !== "object") return { daily: null, weekly: null, monthly: null };

  const daily = pickNumber(row, [
    "daily", "daily_volume", "volume_1d", "vol_1d", "vol1d", "volume_day", "day_volume",
    "volume_usd_1d", "daily_volume_usd", "volume_24h", "vol_24h", "v_24h",
  ]);

  const weekly = pickNumber(row, [
    "weekly", "weekly_volume", "volume_7d", "vol_7d", "vol7d", "volume_week", "week_volume",
    "volume_usd_7d", "weekly_volume_usd",
  ]);

  const monthly = pickNumber(row, [
    "monthly", "monthly_volume", "volume_30d", "vol_30d", "vol30d", "volume_month", "month_volume",
    "volume_usd_30d", "monthly_volume_usd",
  ]);

  return { daily, weekly, monthly };
}

async function duneQueryResults(queryId) {
  const url = `https://api.dune.com/api/v1/query/${queryId}/results?limit=1000`;
  const res = await fetch(url, { headers: { "x-dune-api-key": DUNE_API_KEY } });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Dune API error ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

function normalizeNumber(n) {
  if (n == null) return null;
  // Keep it numeric; UI can format.
  return n;
}

/**
 * IMPORTANT:
 * - key: used by UI
 * - name: display name
 * - duneUrl: your dashboard url (clickable)
 * - queryId: Dune query id (API)
 */
const MARKETS = [
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

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const generatedAt = new Date().toISOString();
  const markets = [];

  for (const m of MARKETS) {
    const item = {
      key: m.key,
      name: m.name,
      duneUrl: m.duneUrl,
      queryId: m.queryId,
      daily: null,
      weekly: null,
      monthly: null,
      updatedAt: generatedAt,
    };

    try {
      const json = await duneQueryResults(m.queryId);

      // Dune format: { result: { rows: [...] } }
      const rows = json?.result?.rows || [];
      if (!rows.length) throw new Error("No rows returned");

      // Many dashboards return a single summary row.
      // If multiple rows exist, prefer the first row; you can customize later.
      const row0 = rows[0];
      const vols = inferVolumesFromRow(row0);

      item.daily = normalizeNumber(vols.daily);
      item.weekly = normalizeNumber(vols.weekly);
      item.monthly = normalizeNumber(vols.monthly);

      // If still all null, expose keys to debug quickly.
      if (item.daily == null && item.weekly == null && item.monthly == null) {
        item.error = `Cannot infer volumes from row keys: ${Object.keys(row0).slice(0, 30).join(", ")}`;
      }
    } catch (e) {
      item.error = String(e?.message || e);
    }

    markets.push(item);
  }

  const out = { generatedAt, markets };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

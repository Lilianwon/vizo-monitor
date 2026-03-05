// capture.cjs
// Fetch Dune query results and write shots/metrics.json
// Required secret: DUNE_API_KEY

const fs = require("fs");
const path = require("path");

const DUNE_API_KEY = process.env.DUNE_API_KEY;
if (!DUNE_API_KEY) {
  console.error("Error: Missing DUNE_API_KEY (GitHub secret).");
  process.exit(1);
}

const OUT_DIR = path.join(__dirname, "shots");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

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
    name: "IBKR ForecastEx",
    duneUrl: "https://dune.com/datadashboards/ibkr-forecastex",
    queryId: 6536996,
  },
];

async function duneFetch(queryId) {
  const url = `https://api.dune.com/api/v1/query/${queryId}/results?limit=1000`;
  const res = await fetch(url, {
    headers: { "x-dune-api-key": DUNE_API_KEY },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dune HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function pickNumber(row, keys) {
  for (const k of keys) {
    if (row && row[k] != null && row[k] !== "") {
      const n = Number(row[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

// Try to infer daily/weekly/monthly from Dune rows.
// Works with many common naming styles.
function parseVolumes(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { daily: null, weekly: null, monthly: null };

  // Prefer the first row (many dashboards output a single row summary)
  const r0 = rows[0];

  const daily = pickNumber(r0, [
    "daily", "day", "d1", "daily_volume", "volume_daily", "daily_usd", "daily_volume_usd",
    "daily_total", "total_daily", "daily_notional", "notional_daily"
  ]);

  const weekly = pickNumber(r0, [
    "weekly", "week", "w1", "weekly_volume", "volume_weekly", "weekly_usd", "weekly_volume_usd",
    "weekly_total", "total_weekly", "weekly_notional", "notional_weekly"
  ]);

  const monthly = pickNumber(r0, [
    "monthly", "month", "m1", "monthly_volume", "volume_monthly", "monthly_usd", "monthly_volume_usd",
    "monthly_total", "total_monthly", "monthly_notional", "notional_monthly"
  ]);

  // Fallback: sometimes rows contain {period: 'daily', value: ...}
  if (daily == null || weekly == null || monthly == null) {
    let d = daily, w = weekly, m = monthly;
    for (const row of rows.slice(0, 50)) {
      const p = (row.period || row.Period || row.window || row.timeframe || "").toString().toLowerCase();
      const v =
        pickNumber(row, ["value", "Value", "volume", "Volume", "usd", "USD", "notional", "Notional"]) ??
        null;

      if (!Number.isFinite(v)) continue;
      if (d == null && (p.includes("day") || p === "daily" || p === "1d")) d = v;
      if (w == null && (p.includes("week") || p === "weekly" || p === "7d")) w = v;
      if (m == null && (p.includes("month") || p === "monthly" || p === "30d")) m = v;
    }
    return { daily: d, weekly: w, monthly: m };
  }

  return { daily, weekly, monthly };
}

function toPretty(n) {
  if (n == null) return null;
  const abs = Math.abs(n);
  if (abs >= 1e12) return +(n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return +(n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return +(n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return +(n / 1e3).toFixed(2) + "K";
  return +n.toFixed(2);
}

(async () => {
  const now = new Date().toISOString();
  const out = { generatedAt: now, markets: [] };

  for (const m of markets) {
    const item = { key: m.key, name: m.name, duneUrl: m.duneUrl, queryId: m.queryId, updatedAt: now };
    try {
      const data = await duneFetch(m.queryId);
      const rows = data?.result?.rows ?? [];
      const vols = parseVolumes(rows);

      item.daily = vols.daily;
      item.weekly = vols.weekly;
      item.monthly = vols.monthly;

      item.dailyPretty = toPretty(vols.daily);
      item.weeklyPretty = toPretty(vols.weekly);
      item.monthlyPretty = toPretty(vols.monthly);

      if (item.daily == null && item.weekly == null && item.monthly == null) {
        item.warning = "No recognizable daily/weekly/monthly fields in Dune rows. Update parseVolumes() mapping.";
        item.sampleRowKeys = rows[0] ? Object.keys(rows[0]) : [];
      }
    } catch (e) {
      item.error = e?.message || String(e);
    }
    out.markets.push(item);
  }

  fs.writeFileSync(path.join(OUT_DIR, "metrics.json"), JSON.stringify(out, null, 2));
  console.log("Wrote shots/metrics.json");
})();

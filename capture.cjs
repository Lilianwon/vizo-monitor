/**
 * capture.cjs
 * Fetch daily/weekly/monthly volumes from Dune query result endpoints
 * and write to shots/metrics.json
 *
 * Required env:
 *   DUNE_API_KEY (GitHub secret)
 */

const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "shots");
const OUT_FILE = path.join(OUT_DIR, "metrics.json");

// ====== CONFIG (NO OVERTIME) ======
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

// ====== Helpers ======
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function isNumberLike(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "number" && Number.isFinite(v)) return true;
  if (typeof v === "string") {
    const s = v.trim().replace(/,/g, "");
    if (!s) return false;
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

/**
 * Try to extract a number from a row using preferred keys first,
 * otherwise fallback to "first numeric field".
 */
function pickNumberFromRow(row, preferredKeys = []) {
  if (!row || typeof row !== "object") return null;

  // preferred keys
  for (const k of preferredKeys) {
    if (k in row && isNumberLike(row[k])) return toNumber(row[k]);
  }

  // common keys (volume-ish)
  const common = [
    "value",
    "volume",
    "notional_volume",
    "notional",
    "daily",
    "weekly",
    "monthly",
    "daily_volume",
    "weekly_volume",
    "monthly_volume",
    "daily_notional",
    "weekly_notional",
    "monthly_notional",
    "trade_volume",
    "trading_volume",
  ];
  for (const k of common) {
    if (k in row && isNumberLike(row[k])) return toNumber(row[k]);
  }

  // fallback: first numeric field
  for (const [k, v] of Object.entries(row)) {
    if (isNumberLike(v)) return toNumber(v);
  }
  return null;
}

/**
 * Parse Dune rows into {daily, weekly, monthly}
 *
 * Supports these shapes:
 *  A) rows like: [{period:"daily", value:123}, {period:"weekly", value:...}, ...]
 *  B) single row like: {daily:123, weekly:..., monthly:...}
 *  C) single row like: {daily_volume:123, weekly_volume:..., monthly_volume:...}
 */
function parseVolumes(rows) {
  const out = { daily: null, weekly: null, monthly: null };

  if (!Array.isArray(rows) || rows.length === 0) return out;

  // Case B/C: single row contains all three
  if (rows.length === 1 && rows[0] && typeof rows[0] === "object") {
    const r = rows[0];
    // try direct keys
    out.daily =
      pickNumberFromRow(r, ["daily", "daily_volume", "daily_notional"]) ?? null;
    out.weekly =
      pickNumberFromRow(r, ["weekly", "weekly_volume", "weekly_notional"]) ??
      null;
    out.monthly =
      pickNumberFromRow(r, ["monthly", "monthly_volume", "monthly_notional"]) ??
      null;

    // if at least one found, accept
    if (out.daily !== null || out.weekly !== null || out.monthly !== null) {
      return out;
    }
  }

  // Case A: rows per period
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;

    const periodRaw =
      (r.period || r.Period || r.timeframe || r.Timeframe || r.bucket || "")
        .toString()
        .toLowerCase()
        .trim();

    const val = pickNumberFromRow(r, ["value", "volume", "notional_volume"]);
    if (val === null) continue;

    // normalize period
    if (periodRaw.includes("day") || periodRaw === "d" || periodRaw === "1d") {
      out.daily = val;
    } else if (
      periodRaw.includes("week") ||
      periodRaw === "w" ||
      periodRaw === "1w" ||
      periodRaw === "7d"
    ) {
      out.weekly = val;
    } else if (
      periodRaw.includes("month") ||
      periodRaw === "m" ||
      periodRaw === "1m" ||
      periodRaw === "30d"
    ) {
      out.monthly = val;
    } else {
      // sometimes period might be exactly: daily/weekly/monthly
      if (periodRaw === "daily") out.daily = val;
      if (periodRaw === "weekly") out.weekly = val;
      if (periodRaw === "monthly") out.monthly = val;
    }
  }

  return out;
}

async function fetchJson(url, headers, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} :: ${text.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function formatCompact(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  // keep raw number in json, but helpful if you later want strings
  return n;
}

// ====== Main ======
async function main() {
  const apiKey = process.env.DUNE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DUNE_API_KEY (GitHub secret).");
  }

  ensureDir(OUT_DIR);

  const headers = {
    "x-dune-api-key": apiKey,
    "content-type": "application/json",
  };

  const generatedAt = new Date().toISOString();

  const marketsOut = [];
  for (const m of MARKETS) {
    const base = {
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
      const url = `https://api.dune.com/api/v1/query/${m.queryId}/results?limit=1000`;
      const json = await fetchJson(url, headers);

      const rows =
        json &&
        json.result &&
        Array.isArray(json.result.rows) ? json.result.rows : [];

      const vols = parseVolumes(rows);

      base.daily = formatCompact(vols.daily);
      base.weekly = formatCompact(vols.weekly);
      base.monthly = formatCompact(vols.monthly);

      // Debug hints (kept small)
      base._rows = rows.length;
      if (
        base.daily === null &&
        base.weekly === null &&
        base.monthly === null
      ) {
        base._hint =
          "No daily/weekly/monthly detected. Adjust Dune query output to include period/value or daily/weekly/monthly columns.";
        base._sample = rows.slice(0, 2);
      }
    } catch (e) {
      base.error = String(e && e.message ? e.message : e);
    }

    marketsOut.push(base);
  }

  const out = {
    generatedAt,
    markets: marketsOut,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

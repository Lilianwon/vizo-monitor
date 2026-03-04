// capture.js
// Fetch Dune query results via API and render to PNG charts (no browser screenshot, bypass Cloudflare)

const fs = require("fs");
const path = require("path");

const DUNE_API_KEY = process.env.DUNE_API_KEY;
if (!DUNE_API_KEY) {
  console.error("Missing DUNE_API_KEY. Please set it in GitHub Secrets.");
  process.exit(1);
}

const OUT_DIR = path.join(__dirname, "shots");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

/**
 * Config: add more charts here later
 * Each item:
 * - name: output png filename
 * - queryId: Dune query id
 * - xKey: column name for x axis
 * - yKey: column name for y axis
 * - title: chart title
 */
const CHARTS = [
  {
    name: "polymarket.png",
    queryId: 5756284,
    xKey: "date",      // <-- 如果你的列名不是 date，后面我教你怎么改
    yKey: "volume",    // <-- 如果你的列名不是 volume，后面我教你怎么改
    title: "Polymarket (Query 5756284)"
  },
];

async function duneResults(queryId, limit = 1000) {
  const url = `https://api.dune.com/api/v1/query/${queryId}/results?limit=${limit}`;
  const res = await fetch(url, {
    headers: { "x-dune-api-key": DUNE_API_KEY },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dune API error ${res.status}: ${text}`);
  }
  return res.json();
}

function guessKeysFromFirstRow(rows) {
  const first = rows?.[0];
  if (!first) return [];
  return Object.keys(first);
}

/**
 * Build a QuickChart URL for a line chart
 * https://quickchart.io/documentation/
 */
function quickChartUrl({ labels, data, title }) {
  const chart = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: title,
          data,
          fill: false,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: true, text: title },
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true } },
      },
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(chart));
  // backgroundColor=white ensures clean export
  return `https://quickchart.io/chart?backgroundColor=white&width=1400&height=800&format=png&c=${encoded}`;
}

async function download(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

async function main() {
  for (const c of CHARTS) {
    console.log(`Fetching Dune results: query ${c.queryId}`);
    const json = await duneResults(c.queryId, 1000);

    const rows = json?.result?.rows || [];
    if (!rows.length) {
      console.warn(`No rows for query ${c.queryId}. Available keys:`, json?.result?.metadata?.column_names);
      continue;
    }

    // if xKey/yKey wrong, print columns to logs to help you fix in 10 seconds
    const keys = guessKeysFromFirstRow(rows);
    console.log(`Query ${c.queryId} columns:`, keys);

    if (!(c.xKey in rows[0]) || !(c.yKey in rows[0])) {
      console.error(
        `xKey/yKey not found for query ${c.queryId}. You set xKey=${c.xKey}, yKey=${c.yKey}. Actual columns=${keys.join(", ")}`
      );
      process.exit(1);
    }

    const labels = rows.map((r) => String(r[c.xKey]));
    const data = rows.map((r) => {
      const v = r[c.yKey];
      return typeof v === "number" ? v : Number(v);
    });

    const chartUrl = quickChartUrl({ labels, data, title: c.title });
    const outFile = path.join(OUT_DIR, c.name);

    console.log(`Rendering chart -> ${outFile}`);
    await download(chartUrl, outFile);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

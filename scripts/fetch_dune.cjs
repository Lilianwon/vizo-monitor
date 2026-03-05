#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const OUT = path.join("shots", "metrics.json");
const API_KEY = process.env.DUNE_API_KEY;

// 你给的 7 个链接都在这里：先让站点完整展示出来；没有 queryId 的会显示 "—" + error
const MARKETS = [
  { key:"polymarket", name:"Polymarket", duneUrl:"https://dune.com/datadashboards/polymarket-overview", queryId:5756284 },
  { key:"kalshi", name:"Kalshi", duneUrl:"https://dune.com/datadashboards/kalshi-overview", queryId:null },
  { key:"opinion", name:"Opinion", duneUrl:"https://dune.com/datadashboards/opinion", queryId:null },
  { key:"myriad", name:"Myriad", duneUrl:"https://dune.com/datadashboards/myriad", queryId:null },
  { key:"predictfun", name:"Predict.fun", duneUrl:"https://dune.com/datadashboards/predict-prediction-market-predictfun", queryId:null },
  { key:"ibkr", name:"IBKR ForecastEx", duneUrl:"https://dune.com/datadashboards/ibkr-forecastex", queryId:null },
  { key:"overtime", name:"Overtime", duneUrl:"https://dune.com/datadashboards/overtime", queryId:null },
];

function nowISO(){ return new Date().toISOString(); }

function pickNumber(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v === 0) return 0;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function extractVolumes(row0) {
  return {
    daily: pickNumber(row0, ["daily", "daily_volume", "daily_vol", "vol_1d", "volume_1d", "day_volume"]),
    weekly: pickNumber(row0, ["weekly", "weekly_volume", "weekly_vol", "vol_7d", "volume_7d"]),
    monthly: pickNumber(row0, ["monthly", "monthly_volume", "monthly_vol", "vol_30d", "volume_30d"]),
  };
}

async function fetchDune(queryId){
  const url = `https://api.dune.com/api/v1/query/${queryId}/results?limit=1000`;
  const r = await fetch(url, { headers: { "x-dune-api-key": API_KEY }});
  if(!r.ok) throw new Error(`Dune ${r.status} for query ${queryId}`);
  return r.json();
}

(async function main(){
  if(!API_KEY){
    console.error("Missing DUNE_API_KEY (GitHub secret).");
    process.exit(1);
  }

  const markets = [];
  for(const m of MARKETS){
    const out = { ...m, daily:null, weekly:null, monthly:null, updatedAt: nowISO() };

    if(!m.queryId){
      out.error = "queryId not set";
      markets.push(out);
      continue;
    }

    try{
      const j = await fetchDune(m.queryId);
      const rows = j?.result?.rows || [];
      const row0 = rows[0] || null;
      const vols = extractVolumes(row0);
      out.daily = vols.daily;
      out.weekly = vols.weekly;
      out.monthly = vols.monthly;
      out.updatedAt = nowISO();
    }catch(e){
      out.error = String(e?.message || e);
    }

    markets.push(out);
  }

  fs.mkdirSync("shots", { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: nowISO(), markets }, null, 2));
  console.log("Wrote", OUT);
})();

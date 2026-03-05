#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const METRICS = JSON.parse(fs.readFileSync(path.join("shots","metrics.json"),"utf-8"));
const SOCIAL = JSON.parse(fs.readFileSync(path.join("shots","social.json"),"utf-8"));

function topHotTopics(){
  return (SOCIAL.topics||[])
    .slice()
    .sort((a,b)=> (b.spikeScore||0)-(a.spikeScore||0))
    .slice(0,5);
}

(function main(){
  const hot = topHotTopics();

  const hotLines = hot.map(t=>{
    const badge = (t.spikeScore>=2.0) ? "🔥" : "•";
    return `${badge} ${t.keyword} (spike x${(t.spikeScore||0).toFixed(2)}, last24h=${t.last24h})`;
  }).join("<br/>");

  const volumeLines = (METRICS.markets||[]).map(x=>{
    const ok = (x.daily||x.weekly||x.monthly) ? "" : (x.error ? ` (error: ${x.error})` : "");
    return `• ${x.name}: D=${x.daily ?? "—"}, W=${x.weekly ?? "—"}, M=${x.monthly ?? "—"}${ok}`;
  }).join("<br/>");

  const summary = `
<b>Social pulse:</b><br/>${hotLines}<br/><br/>
<b>Volumes snapshot:</b><br/>${volumeLines}<br/><br/>
<b>Interpretation:</b><br/>
If social spike (🔥) is real, volume usually reacts within 6–24 hours. If spike persists but volume stays flat, it’s often “talk > trade” (good for awareness, weaker for monetization).
  `.trim();

  const vizo = `
<b>What to do today (VIZO):</b><br/>
1) Convert the top 1–2 trending topics into markets within <b>2 hours</b> (fresh attention converts best).<br/>
2) Use <b>YES/NO</b> for event outcomes, <b>UP/DOWN</b> for momentum, and <b>RANGE</b> when distribution matters (e.g., weekly volume bands).<br/><br/>
<b>Suggested templates:</b><br/>
• YES/NO: “Will <i>[event]</i> be confirmed by <i>[official source]</i> before <i>[date]</i>?”<br/>
• UP/DOWN: “Will <i>[platform]</i> 24h volume close UP or DOWN vs yesterday?”<br/>
• RANGE: “Where will <i>[platform]</i> weekly volume land? (A/B/C)”<br/><br/>
<b>Ops note:</b> Always define settlement source + time window clearly.
  `.trim();

  const out = { generatedAt: new Date().toISOString(), summary, vizo };
  fs.writeFileSync(path.join("shots","analysis.json"), JSON.stringify(out, null, 2));
  console.log("Wrote shots/analysis.json");
})();

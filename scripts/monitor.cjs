// scripts/monitor.cjs
// Run the monitor pipeline: metrics + (optional social) + analysis

const { execSync } = require("child_process");

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function main() {
  // 1) Update Dune metrics
  run("node scripts/analyze.cjs");

  // 2) (Optional) Social capture placeholder - keep file stable for UI
  // You can add scripts/social.cjs later. For now, ensure shots/social.json exists.
  run("node -e \"const fs=require('fs');fs.mkdirSync('shots',{recursive:true});if(!fs.existsSync('shots/social.json'))fs.writeFileSync('shots/social.json',JSON.stringify({generatedAt:new Date().toISOString(),items:[]},null,2));\"");

  // 3) Basic analysis placeholder - keep file stable for UI
  // You can replace with your real analysis later.
  run("node -e \"const fs=require('fs');const m=JSON.parse(fs.readFileSync('shots/metrics.json','utf8'));const out={generatedAt:new Date().toISOString(),summary:{markets:m.markets.length,errors:m.markets.filter(x=>x.error).length},insights:[]};fs.writeFileSync('shots/analysis.json',JSON.stringify(out,null,2));\"");
}

main();

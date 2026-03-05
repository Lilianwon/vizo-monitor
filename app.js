const fmt = (n) => {
  if (n === null || n === undefined) return "—";
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  if (x >= 1e9) return (x/1e9).toFixed(2) + "B";
  if (x >= 1e6) return (x/1e6).toFixed(2) + "M";
  if (x >= 1e3) return (x/1e3).toFixed(2) + "K";
  return String(x.toFixed(2));
};

async function loadJSON(path){
  const r = await fetch(path + `?t=${Date.now()}`);
  if(!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

function volumeCard(m){
  const title = m.name || m.key;
  const hot = (m.spikeScore && m.spikeScore >= 2.0) ? "hot" : "";
  const hotText = hot ? "🔥 Hot" : "Volume";
  const val = (v) => (v === null || v === undefined) ? "—" : fmt(v);

  return `
  <div class="card">
    <div class="card-head">
      <div style="font-weight:700;font-size:16px">${title}</div>
      <span class="badge ${hot}">${hotText}</span>
    </div>

    <table class="table">
      <tr><td>Daily</td><td>${val(m.daily)}</td></tr>
      <tr><td>Weekly</td><td>${val(m.weekly)}</td></tr>
      <tr><td>Monthly</td><td>${val(m.monthly)}</td></tr>
    </table>

    <div class="card-actions">
      <a class="btn" href="${m.duneUrl}" target="_blank" rel="noreferrer">Dune dashboard ↗</a>
    </div>
  </div>`;
}

function socialCard(topic){
  const hot = topic.spikeScore >= 2.0 ? "hot" : "";
  const label = topic.spikeScore >= 2.0 ? `🔥 Spike x${topic.spikeScore.toFixed(2)}` : `Mentions`;
  const items = (topic.items || []).slice(0,5).map(it => {
    const src = it.source || "source";
    const t = (it.title || "").replaceAll("<","&lt;");
    return `<tr><td>${src}</td><td><a class="btn" style="padding:6px 10px" href="${it.url}" target="_blank" rel="noreferrer">Open ↗</a> ${t}</td></tr>`;
  }).join("");

  return `
  <div class="card">
    <div class="card-head">
      <div style="font-weight:700;font-size:16px">${topic.keyword}</div>
      <span class="badge ${hot}">${label}</span>
    </div>
    <div class="kv">
      <span>last24h: ${topic.last24h}</span>
      <span>baseline: ${topic.baseline7d}</span>
    </div>
    <table class="table" style="margin-top:12px">${items || `<tr><td colspan="2">No items yet</td></tr>`}</table>
  </div>`;
}

(async function main(){
  const [metrics, social, analysis] = await Promise.all([
    loadJSON("./shots/metrics.json").catch(()=>null),
    loadJSON("./shots/social.json").catch(()=>null),
    loadJSON("./shots/analysis.json").catch(()=>null),
  ]);

  const updated = metrics?.generatedAt || social?.generatedAt || analysis?.generatedAt;
  document.getElementById("updatedChip").textContent = updated ? `updated: ${updated}` : "updated: —";

  const volumeGrid = document.getElementById("volumeGrid");
  if(metrics?.markets?.length){
    volumeGrid.innerHTML = metrics.markets.map(volumeCard).join("");
  }else{
    volumeGrid.innerHTML = `<div class="muted">No metrics yet.</div>`;
  }

  const socialGrid = document.getElementById("socialGrid");
  if(social?.topics?.length){
    socialGrid.innerHTML = social.topics.map(socialCard).join("");
  }else{
    socialGrid.innerHTML = `<div class="muted">No social yet.</div>`;
  }

  const analysisBox = document.getElementById("analysisBox");
  analysisBox.innerHTML = `<div>${(analysis?.summary || "No analysis yet.")}</div>`;

  const vizoBox = document.getElementById("vizoBox");
  vizoBox.innerHTML = `<div>${(analysis?.vizo || "No VIZO actions yet.")}</div>`;
})();

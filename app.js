// app.js
const $ = (sel) => document.querySelector(sel);

function fmt(v) {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}

async function loadJSON(path) {
  // cache-busting
  const url = `${path}?ts=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.json();
}

function renderMetrics(metrics) {
  $("#metricsUpdated").textContent = metrics?.generatedAt ? new Date(metrics.generatedAt).toLocaleString() : "—";

  const box = $("#metricsGrid");
  box.innerHTML = "";

  (metrics?.markets || []).forEach((m) => {
    const err = m.error || m.warning;
    const card = document.createElement("div");
    card.className = "card glass";

    card.innerHTML = `
      <div class="cardHead">
        <div class="titleRow">
          <div class="h3">${m.name}</div>
          <span class="pill">Volume</span>
        </div>
        <a class="btn" href="${m.duneUrl}" target="_blank" rel="noreferrer">Dune dashboard ↗</a>
      </div>

      <div class="table">
        <div class="tr th"><div>Period</div><div>Value</div></div>
        <div class="tr"><div>Daily</div><div>${fmt(m.daily)}</div></div>
        <div class="tr"><div>Weekly</div><div>${fmt(m.weekly)}</div></div>
        <div class="tr"><div>Monthly</div><div>${fmt(m.monthly)}</div></div>
      </div>

      ${err ? `<div class="warn">⚠ ${err}</div>` : ""}
    `;
    box.appendChild(card);
  });
}

function renderSocial(social) {
  $("#socialUpdated").textContent = social?.generatedAt ? new Date(social.generatedAt).toLocaleString() : "—";

  const list = $("#socialList");
  list.innerHTML = "";

  const items = social?.items || [];
  if (!items.length) {
    list.innerHTML = `<div class="muted">No social items yet. (Collector may be blocked or returned empty.)</div>`;
    return;
  }

  items
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 40)
    .forEach((it) => {
      const hot = it.hot ? `<span class="hot">🔥</span>` : "";
      const row = document.createElement("a");
      row.className = "socialRow glass";
      row.href = it.url || "#";
      row.target = "_blank";
      row.rel = "noreferrer";

      row.innerHTML = `
        <div class="socialLeft">
          <div class="socialTitle">${hot}${it.title || "(untitled)"}</div>
          <div class="socialMeta">
            <span class="tag">${it.source || "source"}</span>
            <span class="muted">${it.publishedAt ? new Date(it.publishedAt).toLocaleString() : ""}</span>
          </div>
        </div>
        <div class="socialRight">
          <div class="score">${it.score ?? "—"}</div>
          <div class="muted">trend</div>
        </div>
      `;
      list.appendChild(row);
    });
}

function renderAnalysis(analysis) {
  $("#analysisUpdated").textContent = analysis?.generatedAt ? new Date(analysis.generatedAt).toLocaleString() : "—";

  const box = $("#analysisBox");
  box.innerHTML = "";

  const blocks = analysis?.blocks || [];
  if (!blocks.length) {
    box.innerHTML = `<div class="muted">No analysis yet. (It will appear after monitor workflow runs.)</div>`;
    return;
  }

  blocks.forEach((b) => {
    const div = document.createElement("div");
    div.className = "card glass";
    div.innerHTML = `
      <div class="h3">${b.title}</div>
      <div class="muted">${b.subtitle || ""}</div>
      <ul class="ul">
        ${(b.items || []).map((x) => `<li>${x}</li>`).join("")}
      </ul>
    `;
    box.appendChild(div);
  });
}

async function main() {
  try {
    const [metrics, social, analysis] = await Promise.allSettled([
      loadJSON("shots/metrics.json"),
      loadJSON("shots/social.json"),
      loadJSON("shots/analysis.json"),
    ]);

    if (metrics.status === "fulfilled") renderMetrics(metrics.value);
    else $("#metricsErr").textContent = "metrics.json load failed: " + metrics.reason;

    if (social.status === "fulfilled") renderSocial(social.value);
    else $("#socialErr").textContent = "social.json load failed: " + social.reason;

    if (analysis.status === "fulfilled") renderAnalysis(analysis.value);
    else $("#analysisErr").textContent = "analysis.json load failed: " + analysis.reason;

    $("#hardRefresh").addEventListener("click", () => location.reload(true));
  } catch (e) {
    $("#fatal").textContent = String(e?.message || e);
  }
}

main();

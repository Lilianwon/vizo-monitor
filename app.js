// app.js
async function loadJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

function fmt(n) {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  // human format
  const abs = Math.abs(num);
  if (abs >= 1e12) return (num / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (num / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (num / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (num / 1e3).toFixed(2) + "K";
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function el(tag, cls) {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  return x;
}

function row(period, value) {
  const tr = el("tr");
  const td1 = el("td");
  td1.textContent = period;
  const td2 = el("td", "value");
  td2.textContent = value;
  if (value === "—") td2.classList.add("missing");
  tr.append(td1, td2);
  return tr;
}

function card(m) {
  const c = el("article", "card");

  const head = el("div", "card-head");
  const title = el("div", "card-title");
  title.textContent = m.name;

  const badge = el("span", "badge");
  badge.textContent = "Volume";
  title.appendChild(badge);

  const right = el("div");
  const a = el("a", "btn");
  a.href = m.duneUrl;
  a.target = "_blank";
  a.rel = "noreferrer";
  a.textContent = "Dune dashboard ↗";
  right.appendChild(a);

  head.append(title, right);

  const table = el("table", "table");
  const thead = el("thead");
  const trh = el("tr");
  const th1 = el("th"); th1.textContent = "Period";
  const th2 = el("th"); th2.textContent = "Value";
  trh.append(th1, th2);
  thead.appendChild(trh);

  const tbody = el("tbody");
  tbody.appendChild(row("Daily", fmt(m.daily)));
  tbody.appendChild(row("Weekly", fmt(m.weekly)));
  tbody.appendChild(row("Monthly", fmt(m.monthly)));

  table.append(thead, tbody);

  c.append(head, table);
  return c;
}

(async function main(){
  const statusLine = document.getElementById("statusLine");
  const grid = document.getElementById("grid");
  const updatedAt = document.getElementById("updatedAt");
  const openJson = document.getElementById("openJson");

  const jsonPath = "shots/metrics.json";
  openJson.href = jsonPath;

  try{
    const data = await loadJson(jsonPath);
    updatedAt.textContent = data.generatedAt || "—";

    const markets = Array.isArray(data.markets) ? data.markets : [];
    statusLine.textContent = `Loaded ${markets.length} markets.`;

    grid.innerHTML = "";
    for (const m of markets) grid.appendChild(card(m));
  }catch(e){
    statusLine.textContent = `Error: ${e.message}`;
  }
})();

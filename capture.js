import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const OUT_DIR = path.join(process.cwd(), "shots");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const TARGETS = [
  { key:"polymarket", name:"Polymarket", url:"https://dune.com/datadashboards/polymarket-overview" },
  { key:"kalshi", name:"Kalshi", url:"https://dune.com/datadashboards/kalshi-overview" },
  { key:"opinion", name:"Opinion", url:"https://dune.com/datadashboards/opinion" },
  { key:"myriad", name:"Myriad", url:"https://dune.com/datadashboards/myriad" },
  { key:"predict", name:"Predict", url:"https://dune.com/datadashboards/predict-prediction-market-predictfun" },
  { key:"ibkr", name:"IBKR ForecastEx", url:"https://dune.com/datadashboards/ibkr-forecastex" },
  { key:"overtime", name:"Overtime", url:"https://dune.com/datadashboards/overtime" }
];

// 视口截图：更像“数据面板画面”，不是整页
const VIEWPORT = { width: 1440, height: 900 };

async function shotOne(page, t) {
  await page.setViewportSize(VIEWPORT);
  await page.goto(t.url, { waitUntil: "domcontentloaded" });

  // Dune 动态加载：等待 + 触发懒加载
  await page.waitForTimeout(9000);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(1500);

  const out = path.join(OUT_DIR, `${t.key}.png`);
  await page.screenshot({ path: out, fullPage: false });
  console.log("✅", t.name, "->", out);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    for (const t of TARGETS) {
      try {
        await shotOne(page, t);
      } catch (e) {
        console.log("❌", t.name, e?.message || e);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

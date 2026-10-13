import { createRequire } from "module";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
import fs from "fs";
const out = "/home/user/ERP/docs/auditoria-visual/prints";
const routes = fs.readFileSync(process.argv[2], "utf8").split(/\s+/).filter(Boolean);
const sizes = { mobile: { width: 390, height: 844 }, desktop: { width: 1366, height: 768 } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const report = [];
for (const [name, vp] of Object.entries(sizes)) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: name === "mobile", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:3020/dev/login");
  await page.click('button[value="DIRETORIA"]');
  await page.waitForLoadState("networkidle");
  for (const r of routes) {
    const errs = [];
    const h = (m) => m.type() === "error" && errs.push(m.text().slice(0, 120));
    page.on("console", h);
    let status = "?";
    try {
      const resp = await page.goto("http://127.0.0.1:3020" + r, { waitUntil: "networkidle", timeout: 30000 });
      status = resp?.status();
      const m = await page.evaluate(() => ({
        hOver: document.documentElement.scrollWidth > innerWidth + 1,
        h: document.documentElement.scrollHeight,
        small: [...document.querySelectorAll("button,a,input,select")].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 40; }).length,
        url: location.pathname,
      }));
      await page.screenshot({ path: `${out}/${name}${r.replace(/\//g, "_") || "_root"}.png` });
      report.push({ name, r, status, ...m, errs: errs.length });
    } catch (e) { report.push({ name, r, status: "ERR " + e.message.slice(0, 80) }); }
    page.off("console", h);
  }
  await ctx.close();
}
await browser.close();
console.log(report.map(x => JSON.stringify(x)).join("\n"));

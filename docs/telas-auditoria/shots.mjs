import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import fs from "node:fs";
const base = "http://127.0.0.1:3020";
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const exe = execSync("ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1").toString().trim();
const browser = await chromium.launch({ executablePath: exe });
const sizes = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const ctx = await browser.newContext({ viewport: sizes.desktop });
const page = await ctx.newPage();
await page.goto(base + "/dev/login");
await page.screenshot({ path: `${out}/login.png` });
await page.click('button[value="DIRETORIA"]');
await page.waitForLoadState("networkidle");
// discover routes
const seen = new Set(["/dev/login"]);
const queue = ["/"];
const found = [];
while (queue.length && found.length < 80) {
  const p = queue.shift();
  if (seen.has(p)) continue; seen.add(p);
  const resp = await page.goto(base + p, { waitUntil: "networkidle" }).catch(() => null);
  const url = new URL(page.url()).pathname;
  found.push({ p, url, status: resp?.status() });
  const links = await page.$$eval("a[href^='/']", as => as.map(a => a.getAttribute("href").split("#")[0].split("?")[0]));
  for (const l of links) if (!seen.has(l) && !l.startsWith("/api") && !l.startsWith("/dev") && !l.includes("logout") && !l.includes("sair")) queue.push(l);
}
fs.writeFileSync(`${out}/routes.json`, JSON.stringify(found, null, 1));
for (const [name, vp] of Object.entries(sizes)) {
  await page.setViewportSize(vp);
  for (const r of found) {
    await page.goto(base + r.p, { waitUntil: "networkidle" }).catch(() => {});
    const file = (r.p === "/" ? "home" : r.p.slice(1).replace(/\//g, "_")) + `.${name}.png`;
    await page.screenshot({ path: `${out}/${file}` });
    // overflow check
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: innerHeight }));
    r[name] = ov;
  }
}
fs.writeFileSync(`${out}/routes.json`, JSON.stringify(found, null, 1));
await browser.close();

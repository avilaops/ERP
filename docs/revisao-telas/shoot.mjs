import { chromium } from 'playwright-core';
import fs from 'node:fs';
const OUT = process.argv[2];
const BASE = 'http://127.0.0.1:3020';
const sizes = { desk: { width: 1440, height: 900 }, mob: { width: 390, height: 844 } };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const report = [];
for (const [name, vp] of Object.entries(sizes)) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => m.type() === 'error' && errs.push(m.text().slice(0, 160)));
  await page.goto(BASE + '/dev/login');
  await page.click('button[value="DIRETORIA"]');
  await page.waitForLoadState('networkidle');
  const seen = new Set(), queue = name === 'mob' ? JSON.parse(fs.readFileSync(OUT + '/paths.json')) : ['/dashboard'];
  while (queue.length && seen.size < 70) {
    const p = queue.shift();
    if (seen.has(p)) continue; seen.add(p);
    errs.length = 0;
    const r = await page.goto(BASE + p, { waitUntil: 'networkidle' }).catch(e => null);
    const status = r?.status();
    const file = `${OUT}/${name}${p.replace(/\//g, '_')}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const m = await page.evaluate(() => ({
      title: document.title, h1: document.querySelector('h1')?.textContent?.trim(),
      hscroll: document.documentElement.scrollWidth > innerWidth + 1,
      docH: document.documentElement.scrollHeight,
      small: [...document.querySelectorAll('button,a,input,select')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.height && b.height < 40 && getComputedStyle(e).visibility !== 'hidden'; }).length,
      links: [...document.querySelectorAll('a[href^="/"]')].map(a => a.getAttribute('href').split('#')[0]).filter(h => !/^\/(api|oauth|dev|descadastro)/.test(h) && !/\/[0-9a-f-]{8,}|\/\d+$/.test(h)),
    }));
    report.push({ vp: name, path: p, status, url: page.url().replace(BASE, ''), ...m, links: undefined, errs: [...errs] });
    if (name === 'desk') for (const l of m.links) if (!seen.has(l)) queue.push(l);
    else if (name === 'mob') {}
  }
  if (name === 'desk') fs.writeFileSync(OUT + '/paths.json', JSON.stringify([...seen]));
  await ctx.close();
}
fs.writeFileSync(OUT + '/report.json', JSON.stringify(report, null, 1));
await browser.close();

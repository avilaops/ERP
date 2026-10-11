// Captura as telas do ERP (login local, perfil DIRETORIA) em 390x844 e 1440x900 e mede
// overflow horizontal, controles < 44 px, fonte < 12 px, erros de console e respostas >= 400.
// Uso: mkdir -p out/shots && CHROMIUM_PATH=/caminho/chrome node scripts/capturar-telas.mjs out "/dashboard /pedidos"
// Requer playwright-core (não é dependência do projeto) e ERP_LOCAL_LOGIN=1 no .env.local.
import { chromium } from 'playwright-core';
import fs from 'fs';
const S = process.argv[2]; // pasta de saída (precisa de shots/; grava report.json)
const routes = process.argv[3].split(' ').filter(Boolean);
const sizes = { mobile: [390, 844], desktop: [1440, 900] };
const base = 'http://127.0.0.1:3020';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const report = [];
for (const [name, [w, h]] of Object.entries(sizes)) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(base + '/dev/login');
  await page.click('button[name=role][value=DIRETORIA]');
  await page.waitForLoadState('networkidle');
  for (const r of routes) {
    const errs = [], bad = [];
    const onC = m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); };
    const onR = x => { if (x.status() >= 400) bad.push(x.status() + ' ' + x.url().replace(base, '')); };
    page.on('console', onC); page.on('response', onR);
    let status = 0;
    try {
      const resp = await page.goto(base + r, { waitUntil: 'networkidle', timeout: 60000 });
      status = resp?.status() ?? 0;
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const small = [...document.querySelectorAll('a,button,input,select,textarea,summary')]
          .filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 44 && getComputedStyle(e).visibility !== 'hidden'; }).length;
        const tiny = [...document.querySelectorAll('body *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).length;
        const noLabel = [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(e => !e.labels?.length && !e.getAttribute('aria-label')).length;
        return { title: document.title, h1: document.querySelector('h1')?.textContent?.trim() ?? null, scrollW: de.scrollWidth, clientW: de.clientWidth, scrollH: de.scrollHeight, small, tiny, noLabel, text: document.body.innerText.slice(0, 200) };
      });
      const file = `${name}_${r.replace(/\//g, '_').replace(/^_/, '') || 'home'}.png`;
      await page.screenshot({ path: `${S}/shots/${file}`, fullPage: false });
      report.push({ size: name, route: r, status, ...m, hOverflow: m.scrollW > m.clientW, errs: errs.slice(0, 3), bad: bad.slice(0, 3), file });
    } catch (e) { report.push({ size: name, route: r, status, error: String(e).slice(0, 150) }); }
    page.off('console', onC); page.off('response', onR);
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${S}/report.json`, JSON.stringify(report, null, 1));
for (const x of report) console.log(x.size, x.route, x.status, x.error ?? `ovf=${x.hOverflow} h=${x.scrollH} small=${x.small} tiny=${x.tiny} nolabel=${x.noLabel} errs=${x.errs.length} bad=${x.bad.join('|')}`);

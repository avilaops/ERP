// Revisão visual: entra como Diretoria pelo login local, descobre as rotas a partir do
// /dashboard e captura cada uma nos cinco tamanhos do docs/ux.md.
//
// Uso: npm run shots [-- <pasta de saída>]
// Requer o ERP em desenvolvimento com ERP_LOCAL_LOGIN=1 (npm run dev). Outro endereço:
// SHOTS_BASE=http://127.0.0.1:3020. Sai com código 1 se alguma rota falhar ou faltar.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { VIEWPORTS, MIN_CONTROLE, visitar, faltasDeCobertura, NavegacaoFalhou } from './medir.mjs';

const OUT = process.argv[2] ?? '.shots';
const BASE = process.env.SHOTS_BASE ?? 'http://127.0.0.1:3020';
const MAX_ROTAS = 200;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const report = [];
const falhas = [];
let rotas = null;

try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => m.type() === 'error' && errs.push(m.text().slice(0, 160)));
    page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
    page.on('response', resposta => {
      const tipo = resposta.request().resourceType();
      if (resposta.status() >= 400 && ['stylesheet', 'script', 'font'].includes(tipo)) {
        errs.push(`${resposta.status()} ${tipo} ${resposta.url()}`.slice(0, 160));
      }
    });
    page.on('requestfailed', pedido => {
      const tipo = pedido.resourceType();
      if (['stylesheet', 'script', 'font'].includes(tipo)) {
        errs.push(`${tipo} ${pedido.failure()?.errorText ?? 'falhou'} ${pedido.url()}`.slice(0, 160));
      }
    });

    await visitar(page, BASE + '/dev/login');
    await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/dev/login')), page.click('button[value="DIRETORIA"]')]);
    await page.waitForLoadState('networkidle');

    // O primeiro tamanho descobre as rotas; os demais visitam exatamente a mesma lista.
    const descobrir = rotas === null;
    const vistas = [];
    const fila = descobrir ? ['/dashboard'] : [...rotas];
    while (fila.length && vistas.length < MAX_ROTAS) {
      const p = fila.shift();
      if (vistas.includes(p)) continue;
      vistas.push(p);
      errs.length = 0;
      let resposta;
      try {
        resposta = await visitar(page, BASE + p);
      } catch (e) {
        if (!(e instanceof NavegacaoFalhou)) throw e;
        falhas.push(`${vp.nome} ${e.message}`);
        report.push({ vp: vp.nome, path: p, erro: e.message });
        continue;
      }
      await page.screenshot({ path: `${OUT}/${vp.nome}${p.replace(/\//g, '_')}.png`, fullPage: true });
      const m = await page.evaluate(min => {
        const baixos = [...document.querySelectorAll('button,a,input,select,textarea')].filter(e => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && b.height < min && getComputedStyle(e).visibility !== 'hidden';
        });
        return {
        title: document.title,
        h1: document.querySelector('h1')?.textContent?.trim(),
        hscroll: document.documentElement.scrollWidth > innerWidth + 1,
        docH: document.documentElement.scrollHeight,
        small: baixos.length,
        // Quantos dos controles baixos são da moldura (menu lateral, barra do topo e de baixo).
        smallMoldura: baixos.filter(e => e.closest('nav,aside,header')).length,
        links: [...document.querySelectorAll('a[href^="/"]')]
          .map(a => a.getAttribute('href').split('#')[0])
          .filter(h => !/^\/(api|oauth|dev|descadastro)/.test(h) && !/\/[0-9a-f-]{8,}|\/\d+$/.test(h)),
        };
      }, MIN_CONTROLE);
      const { links, ...medidas } = m;
      report.push({ vp: vp.nome, path: p, status: resposta.status(), url: page.url().replace(BASE, ''), ...medidas, errs: [...errs] });
      if (errs.length) falhas.push(`${vp.nome} ${p}: ${errs.join('; ')}`);
      if (descobrir) for (const l of links) if (!vistas.includes(l) && !fila.includes(l)) fila.push(l);
    }
    if (descobrir) {
      if (fila.length) falhas.push(`descoberta parou em ${MAX_ROTAS} rotas; ${fila.length} ficaram de fora`);
      rotas = vistas;
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1) + '\n');
const faltas = faltasDeCobertura(report.filter(r => !r.erro), rotas ?? []);
console.log(`${rotas?.length ?? 0} rotas × ${VIEWPORTS.length} tamanhos, ${report.length} registros em ${OUT}/report.json`);
for (const f of [...falhas, ...faltas]) console.error(`FALHOU ${f}`);
if (falhas.length || faltas.length) process.exit(1);

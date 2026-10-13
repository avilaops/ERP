// Tira print de todas as telas do ERP (desktop 1440x900 e celular 390x844) e gera report.json.
// Uso: com o ERP rodando em 127.0.0.1:3020 e ERP_LOCAL_LOGIN=1:
//   node scripts/capturar-telas.mjs [pasta-de-saida]
import { chromium } from "playwright";
import { readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.ERP_URL ?? "http://127.0.0.1:3020";
const OUT = process.argv[2] ?? "docs/auditoria-visual";
const ROLE = process.env.ERP_ROLE ?? "DIRETORIA";
const SIZES = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

// Descobre as rotas estáticas em src/app/(app); rotas com [param] ficam de fora.
function rotas(dir, prefix = "") {
  const found = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (!statSync(caminho).isDirectory() || nome.includes("[")) continue;
    if (readdirSync(caminho).includes("page.tsx")) found.push(`${prefix}/${nome}`);
    found.push(...rotas(caminho, `${prefix}/${nome}`));
  }
  return found.sort();
}

mkdirSync(OUT, { recursive: true });
const lista = rotas("src/app/(app)");
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
const relatorio = [];

for (const [view, viewport] of Object.entries(SIZES)) {
  const ctx = await browser.newContext({ viewport, isMobile: view === "mobile" });
  const page = await ctx.newPage();
  const erros = [];
  page.on("console", (m) => m.type() === "error" && erros.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => erros.push(e.message.slice(0, 200)));
  await page.goto(`${BASE}/dev/login`);
  await page.click(`button[value=${ROLE}]`);
  await page.waitForLoadState("networkidle");

  for (const rota of lista) {
    erros.length = 0;
    const resp = await page.goto(BASE + rota, { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
    const m = await page.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      altura: document.documentElement.scrollHeight,
      controlesBaixos: [...document.querySelectorAll("button,a,input,select")].filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && b.height < 40;
      }).length,
    }));
    await page.screenshot({ path: join(OUT, `${view}-${rota.replace(/\//g, "_")}.png`) });
    relatorio.push({ view, rota, status: resp?.status() ?? "erro", destino: page.url().replace(BASE, ""), ...m, erros: [...erros] });
  }
  await ctx.close();
}
await browser.close();
writeFileSync(join(OUT, "report.json"), JSON.stringify(relatorio, null, 1));
console.log(`${relatorio.length} capturas em ${OUT}`);

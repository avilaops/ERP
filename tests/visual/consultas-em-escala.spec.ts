import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const SIZES = [[360, 640], [390, 844], [430, 932], [956, 440], [1366, 768], [1440, 900]] as const;
const ROUTES = ["/clientes", "/pedidos", "/produtos", "/fornecedores", "/produtos/publicacao?linha=1"] as const;

async function signIn(page: Page) {
  await page.goto("/dev/login");
  const director = page.locator("button[value=DIRETORIA]");
  await expect(director, "O login visual precisa de ERP_LOCAL_LOGIN=1 e ERP_TENANTS configurado").toBeVisible();
  const response = await page.request.post("/dev/login/enter", { form: { role: "DIRETORIA" }, maxRedirects: 0 });
  expect(response.status()).toBe(303);
}

test("consultas com 3.000 registros: largura, paginação, volume renderizado e paisagem", async ({ page }, testInfo) => {
  await signIn(page);
  for (const route of ROUTES) {
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await page.goto(route, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        const main = document.querySelector<HTMLElement>("main");
        const results = document.querySelector<HTMLElement>(".list-results");
        if (main) main.scrollTop = 0;
        if (results) results.scrollTop = 0;
      });
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator("[data-list-pager]")).toBeVisible();

      const measure = await page.evaluate(() => {
        const visible = (element: Element) => element instanceof HTMLElement && element.getClientRects().length > 0;
        const visibleRows = [...document.querySelectorAll<HTMLElement>(".list-results li, .list-results tbody > tr")].filter(visible);
        const rows = visibleRows.length;
        const firstRow = visibleRows[0]?.getBoundingClientRect() ?? null;
        const results = document.querySelector<HTMLElement>(".list-results")?.getBoundingClientRect() ?? null;
        const pager = document.querySelector<HTMLElement>("[data-list-pager]")!.getBoundingClientRect();
        const tabbarElement = document.querySelector<HTMLElement>('nav[aria-label="Atalhos"]');
        const tabbar = tabbarElement && visible(tabbarElement) ? tabbarElement.getBoundingClientRect() : null;
        const visibleBottom = Math.min(results?.bottom ?? innerHeight, tabbar?.top ?? innerHeight, innerHeight);
        const rowVisibleHeight = firstRow && results ? Math.max(0, Math.min(firstRow.bottom, visibleBottom) - Math.max(firstRow.top, results.top, 0)) : 0;
        return {
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          rows,
          rowVisibleHeight,
          firstRow: firstRow ? { top: firstRow.top, bottom: firstRow.bottom } : null,
          results: results ? { top: results.top, bottom: results.bottom } : null,
          pagerCovered: tabbar ? pager.top < tabbar.bottom && pager.bottom > tabbar.top + 1 : false,
          pager: { top: pager.top, bottom: pager.bottom },
          tabbar: tabbar ? { top: tabbar.top, bottom: tabbar.bottom } : null,
        };
      });
      await page.screenshot({
        path: testInfo.outputPath(`${route.replace(/[^a-z0-9]/gi, "_") || "inicio"}-${width}x${height}.png`),
        fullPage: false,
      });
      expect(measure.overflowX, `${route} ${width}×${height}: rolagem lateral`).toBeLessThanOrEqual(0);
      expect(measure.rows, `${route} ${width}×${height}: registros no HTML visível`).toBeLessThanOrEqual(100);
      expect(measure.rowVisibleHeight, `${route} ${width}×${height}: nenhum registro utilizável na primeira área visível ${JSON.stringify(measure)}`).toBeGreaterThanOrEqual(44);
      expect(measure.pagerCovered, `${route} ${width}×${height}: paginação sob a barra inferior ${JSON.stringify(measure)}`).toBe(false);

      if (route === "/produtos" && width < 1536) {
        await expect(page.getByRole("link", { name: "Editar custos e cadastro" }).first()).toBeVisible();
      }
    }
  }
});

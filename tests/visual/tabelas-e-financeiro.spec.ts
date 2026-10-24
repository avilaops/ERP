import { expect, test, type Page } from "@playwright/test";

const SIZES = [[360, 640], [390, 844], [430, 932], [1366, 768], [1440, 900]] as const;

async function enter(page: Page) {
  await page.goto("/dev/login");
  await page.click("button[value=DIRETORIA]");
  await page.waitForURL((url) => !url.pathname.startsWith("/dev/login"));
}

test.beforeEach(async ({ page }) => enter(page));

for (const [width, height] of SIZES) {
  test(`tabelas, custos, compra e recebimentos em ${width}x${height}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    for (const [route, title] of [
      ["/clientes", "Clientes"],
      ["/produtos", "Produtos"],
      ["/custos", "Custos"],
      ["/recebimentos", "Recebimentos"],
      ["/compras", "Compras"],
      ["/compras?nova=1", "Nova compra"],
      ["/compras?nova=1&fornecedor=novo", "Novo fornecedor"],
    ] as const) {
      await page.goto(route, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        document.querySelector("main")?.scrollTo(0, 0);
      });
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath(`${title.toLowerCase().replaceAll(" ", "-")}-${width}x${height}.png`), fullPage: true, caret: "initial" });
    }
  });
}

test("tabelas persistem ordem e largura e a compra cadastra fornecedor na própria rota", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/clientes", { waitUntil: "networkidle" });
  const table = page.getByLabel("Tabela de clientes personalizável");
  await expect(table).toBeVisible();
  const separator = table.getByRole("separator", { name: "Ajustar largura de Cliente" });
  const before = await table.locator("col").first().evaluate((element) => getComputedStyle(element).width);
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  const after = await table.locator("col").first().evaluate((element) => getComputedStyle(element).width);
  expect(after).not.toBe(before);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByLabel("Tabela de clientes personalizável").locator("col").first()).toHaveCSS("width", after);

  await page.goto("/compras?nova=1", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Cadastrar fornecedor" }).click();
  await expect(page).toHaveURL(/\/compras\?nova=1&fornecedor=novo$/);
  await expect(page.getByRole("button", { name: "Cadastrar e usar" })).toBeVisible();
  await page.getByLabel("Tipo").selectOption("EX");
  await page.getByLabel("Nome ou razão social").fill("Fornecedor criado na compra");
  await page.getByLabel("País (só para exterior)").fill("China");
  await page.getByRole("button", { name: "Cadastrar e usar" }).click();
  await expect(page).toHaveURL(/\/compras\?nova=1&fornecedor=\d+$/);
  await expect(page.getByLabel("Fornecedor", { exact: true })).toHaveValue(/\d+/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/compras?nova=1", { waitUntil: "networkidle" });
  await page.locator("html").evaluate((element) => { element.style.fontSize = "200%"; });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  const datesStep = page.getByText("2. Referência e datas", { exact: false });
  await datesStep.focus();
  await page.keyboard.press("Enter");
  await expect(datesStep.locator("..")).toHaveAttribute("open", "");
});

test("Financeiro acessa Custos sem ganhar o cadastro técnico de Produtos", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/dev/login");
  await page.click("button[value=FINANCEIRO]");
  await page.waitForURL((url) => !url.pathname.startsWith("/dev/login"));
  await page.goto("/custos", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Custos", exact: true })).toBeVisible();
  await expect(page.locator("summary").filter({ hasText: "Editar custo" }).first()).toBeVisible();
  await page.goto("/produtos", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/sem-acesso$/);
});

import { expect, test } from "@playwright/test";

const SIZES = [[360, 640], [390, 844], [430, 932], [1366, 768], [1440, 900]] as const;
const SECTIONS = ["Natureza da operação", "CFOP", "ICMS e IPI", "PIS", "COFINS", "Classificação IBS/CBS", "Alíquotas IBS/CBS", "Condições da venda"];

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/login");
  await page.click("button[value=DIRETORIA]");
  await page.waitForURL((url) => !url.pathname.startsWith("/dev/login"));
});

for (const [width, height] of SIZES) {
  test(`regras fiscais completas em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto("/parametros/fiscal?ver=regras", { waitUntil: "networkidle" });

    for (const section of SECTIONS) {
      await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("textbox", { name: "Natureza da operação", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Informações complementares (texto fixo da nota)", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar regras fiscais", exact: true })).toBeVisible();
    await expect(page.getByText(/\d+ de 8 ·/)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

    await page.screenshot({ path: testInfo.outputPath(`regras-fiscais-${width}x${height}.png`), fullPage: true, caret: "initial" });
  });
}

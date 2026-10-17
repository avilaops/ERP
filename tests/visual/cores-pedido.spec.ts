import { expect, test } from "@playwright/test";

test("cores por equipamento: amostras, gravação e leitura nos cinco tamanhos", async ({ page }, testInfo) => {
  await page.goto("/dev/login");
  await page.click("button[value=DIRETORIA]");
  await page.waitForURL((url) => !url.pathname.startsWith("/dev/login"));
  await page.goto("/pedidos?busca=DM09");
  const href = await page.locator('a[href$="-DM09"]').first().getAttribute("href");
  expect(href, "pedido de demonstração com dois equipamentos").toBeTruthy();
  await page.goto(`${href}?ver=itens`);

  const forms = page.locator("form").filter({ has: page.locator('input[name="frameColor"]') }).filter({ visible: true });
  const first = forms.first();
  await first.locator("summary").filter({ hasText: "Cor da estrutura" }).click();
  await first.getByRole("radio", { name: "Performance Red", exact: true }).first().check();
  await first.locator("summary").filter({ hasText: "Cor do braço" }).click();
  await first.getByRole("radio", { name: "Apple Green", exact: true }).check();
  await first.getByRole("button", { name: "Gravar", exact: true }).click();
  await expect(first.locator("summary").filter({ hasText: "Cor da estrutura" })).toContainText("Performance Red", { timeout: 30_000 });
  await expect(first.locator("summary").filter({ hasText: "Cor do braço" })).toContainText("Apple Green");
  await expect(forms.nth(1).locator("summary").first()).toContainText("Escolher cor");

  for (const [width, height] of [[360, 640], [390, 844], [430, 932], [1366, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.reload();
    const form = forms.first();
    const summary = form.locator("summary").filter({ hasText: "Cor do braço" });
    await summary.click();
    const selected = form.getByRole("radio", { name: "Apple Green", exact: true });
    await expect(selected).toBeChecked();
    const label = selected.locator("..");
    expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath(`cores-${width}x${height}.png`), fullPage: true });
  }
});

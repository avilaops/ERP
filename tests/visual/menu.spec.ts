import { expect, test } from "@playwright/test";

test("menu: grupos, página atual, conta e teclado nos cinco tamanhos", async ({ page }, testInfo) => {
  await page.goto("/dev/login");
  await page.click("button[value=DIRETORIA]");
  await page.waitForURL((url) => !url.pathname.startsWith("/dev/login"));
  for (const [width, height] of [[360, 640], [390, 844], [430, 932], [1366, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/pedidos");
    if (width < 768) {
      const more = page.getByRole("button", { name: "Mais", exact: true });
      await more.focus();
      await more.click();
      const dialog = page.getByRole("dialog", { name: "Menu principal" });
      await expect(dialog).toBeVisible();
      await expect(page.locator("#conteudo")).toHaveAttribute("inert", "");
      const firstMenuControl = dialog.locator("a, button, summary").first();
      await expect(firstMenuControl).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(page.getByRole("button", { name: "Fechar", exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(firstMenuControl).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(more).toBeFocused();
      await expect(page.locator("#conteudo")).not.toHaveAttribute("inert", "");
      await more.click();
    }
    const menu = page.getByRole("navigation", { name: "Menu principal", exact: true });
    await expect(menu.locator(":scope > details")).toHaveCount(7);
    await expect(menu.getByRole("link", { name: "Pedidos", exact: true })).toHaveAttribute("aria-current", "page");
    await menu.getByText("Financeiro", { exact: true }).click();
    await expect(menu.getByRole("link", { name: "Contas a pagar", exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Pedidos", exact: true })).toBeVisible();
    const summary = menu.locator("summary").filter({ hasText: "Financeiro" });
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(menu.getByRole("link", { name: "Contas a pagar", exact: true })).toBeHidden();
    const fiscal = menu.locator("summary").filter({ hasText: "Fiscal" });
    await fiscal.click();
    await expect(menu.getByRole("link", { name: "Notas fiscais", exact: true })).toBeVisible();
    await fiscal.click();
    await expect(menu.getByRole("link", { name: "Notas fiscais", exact: true })).toBeHidden();
    const frame = page.locator("#menu-principal");
    expect(await frame.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    for (const item of await menu.locator("summary").all()) expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath(`menu-${width}x${height}.png`), caret: "initial" });
    await page.getByText("Minha conta", { exact: true }).click();
    await expect(page.getByRole("group", { name: "Aparência" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Conectar assistente (IA)" })).toBeVisible();
    await menu.getByText("Operação", { exact: true }).click();
    await expect(menu.getByRole("link", { name: "Fornecedores", exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "Aparência" })).toBeVisible();
    await menu.getByRole("link", { name: "Fornecedores", exact: true }).click();
    if (width < 768) await page.getByRole("button", { name: "Mais", exact: true }).click();
    await expect(menu.getByRole("link", { name: "Fornecedores", exact: true })).toHaveAttribute("aria-current", "page");
  }
  // At 200% text enlargement, groups remain reachable by keyboard and names wrap.
  const menu = page.getByRole("navigation", { name: "Menu principal", exact: true });
  await menu.evaluate((el) => { el.style.fontSize = "200%"; });
  const management = menu.locator("summary").filter({ hasText: "Gestão" });
  await management.focus();
  await page.keyboard.press("Enter");
  await expect(menu.getByRole("link", { name: "Parâmetros do sistema", exact: true })).toBeVisible();
  expect(await menu.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
});

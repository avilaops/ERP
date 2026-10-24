import { expect, test } from "@playwright/test";

const SIZES = [[360, 640], [390, 844], [430, 932], [1366, 768], [1440, 900]];

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/login");
  await page.click("button[value=DIRETORIA]");
  await page.waitForURL((url) => !url.pathname.startsWith("/dev/login"));
});

test("harmonização: pilotos, cinco tamanhos e ambos os temas", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`); });
  const routes = ["/parametros/cores", "/parametros/cores?ver=braco", "/contas-pagar", "/recebimentos", "/recebimentos?ver=recebidos", "/clientes/novo", "/pedidos"];
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    for (const route of routes) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator("h1")).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath(`${route.slice(1).replace(/[^a-z0-9]/gi, "_")}-${width}.png`), fullPage: true });
    }
  }
  await page.goto("/clientes/novo");
  for (const theme of ["light", "dark"]) {
    await page.locator("html").evaluate((element, value) => element.setAttribute("data-theme", value), theme);
    const colors = await page.getByRole("button", { name: "Continuar", exact: true }).evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.color, style.backgroundColor];
    });
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const [foreground, background] = colors.map(luminance);
    expect((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05), theme).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: testInfo.outputPath(`cadastro-${theme}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("html").evaluate((element) => { element.style.fontSize = "200%"; });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  const continueButton = page.getByRole("button", { name: "Continuar", exact: true });
  await continueButton.focus();
  await expect(continueButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Etapa do cadastro")).toHaveValue("1");
  await page.screenshot({ path: testInfo.outputPath("cadastro-texto-200.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("aprovações: cabeçalho e conteúdo seguem o contrato visual", async ({ page }) => {
  await page.goto("/aprovacoes", { waitUntil: "networkidle" });
  const header = page.locator(".page-header");
  await expect(header.getByRole("heading", { name: "Aprovações", exact: true })).toBeVisible();
  await expect(header).toContainText("Pedidos fora das regras comerciais aguardam sua decisão.");
  const empty = page.getByRole("status", { name: "Nenhuma aprovação pendente" });
  const pending = page.locator('section[aria-label^="Pedido "]');
  if (await empty.count()) {
    await expect(empty).toContainText("Quando um pedido precisar de decisão, ele aparecerá aqui.");
    await expect(empty.getByRole("link", { name: "Ver pedidos" })).toBeVisible();
  } else {
    await expect(pending.first()).toBeVisible();
  }
});

for (const [width, height] of SIZES) {
  test(`fluxos comerciais: cabeçalhos compartilham a mesma hierarquia em ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    for (const [route, title] of [
      ["/clientes", "Clientes"],
      ["/pedidos", "Pedidos"],
      ["/aprovacoes", "Aprovações"],
      ["/tabela-precos", "Tabela de preços"],
      ["/simulador", "Simulador"],
      ["/precos-metas", "Preços e metas"],
    ] as const) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator(".page-header").getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath(`${route.slice(1)}-${width}.png`), fullPage: true, caret: "initial" });
    }
  });
}

for (const [width, height] of SIZES) {
  test(`fluxos comerciais: buscas vazias orientam a próxima ação em ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height });
    for (const [route, title, action] of [
      ["/clientes?q=cliente-inexistente-harmonizacao", "Nenhum cliente encontrado", "Limpar busca e filtros"],
      ["/pedidos?q=pedido-inexistente-harmonizacao", "Nenhum pedido encontrado", "Limpar busca e filtros"],
      ["/tabela-precos?q=equipamento-inexistente-harmonizacao", "Nenhum equipamento encontrado", "Limpar busca"],
    ] as const) {
      await page.goto(route, { waitUntil: "networkidle" });
      const empty = page.getByRole("status", { name: title });
      await expect(empty).toBeVisible();
      await expect(empty.getByRole("link", { name: action, exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath(`vazio-${route.slice(1).split("?")[0]}-${width}.png`), fullPage: true, caret: "initial" });
    }
  });
}

for (const [width, height] of SIZES) {
  test(`operação e gestão: cabeçalhos mantêm a hierarquia em ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    for (const [route, title] of [
      ["/dashboard", "Painel"],
      ["/estoque", "Estoque"],
      ["/compras", "Nova compra"],
      ["/fornecedores", "Fornecedores"],
      ["/produtos", "Produtos e custos"],
      ["/recebimentos", "Recebimentos"],
      ["/contas-pagar", "Contas a pagar"],
      ["/comissoes", "Comissões"],
      ["/fiscal", "Fiscal"],
      ["/relatorios", "Relatórios"],
      ["/documentos", "Documentos"],
      ["/equipe", "Equipe e acessos"],
    ] as const) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator(".page-header").getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      if (["/dashboard", "/produtos", "/fiscal", "/equipe"].includes(route)) {
        await page.screenshot({ path: testInfo.outputPath(`${route.slice(1)}-${width}.png`), fullPage: true, caret: "initial" });
      }
    }
  });
}

for (const [width, height] of SIZES) {
  test(`parâmetros: índice e cadastros mantêm a hierarquia em ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    for (const [route, title] of [
      ["/parametros", "Parâmetros do sistema"],
      ["/parametros/categorias-de-contas", "Categorias de contas a pagar"],
      ["/parametros/despesas-fixas", "Despesas fixas"],
      ["/parametros/email", "E-mail das notas"],
      ["/parametros/formas-de-pagamento", "Formas de pagamento"],
      ["/parametros/linhas", "Linhas de produto"],
      ["/parametros/transportadoras", "Transportadoras"],
      ["/parametros/usuarios", "Usuários de Ludus Equipamentos"],
    ] as const) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator(".page-header").getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      if (["/parametros", "/parametros/email", "/parametros/transportadoras"].includes(route)) {
        await page.screenshot({ path: testInfo.outputPath(`${route.slice(1).replaceAll("/", "-")}-${width}.png`), fullPage: true, caret: "initial" });
      }
    }
  });
}

test("cadastro: etapas e erro de validação preservam o preenchimento", async ({ page }) => {
  await page.goto("/clientes/novo");
  const name = page.getByLabel("Razão social", { exact: false });
  await name.fill("Empresa de teste de navegação");
  await name.press("Enter");
  await expect(page.getByLabel("Etapa do cadastro")).toHaveValue("1");
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(name).toHaveValue("Empresa de teste de navegação");
  await page.getByRole("button", { name: "Salvar cliente", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(name).toHaveValue("Empresa de teste de navegação");
});

test("pedido: pagamento inteiro cabe em uma tela e salva junto", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/pedidos?busca=DM09");
  const href = await page.locator('a[href$="-DM09"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(`${href}/pagamento`);
  const note = page.getByLabel("Observações", { exact: true });
  await expect(page.getByLabel("Entrada (R$)", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Quando pagar o saldo", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Número de parcelas", { exact: true })).toBeVisible();
  await note.fill("Pagamento salvo em uma tela");
  await page.getByRole("button", { name: "Salvar e conferir", exact: true }).click();
  await expect(page).toHaveURL(/\?ver=pagamento$/);
  await expect(page.getByText("Pagamento salvo em uma tela", { exact: true })).toBeVisible();
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.goto(`${href}/pagamento`);
    await expect(page.getByLabel("Entrada (R$)", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Quando pagar o saldo", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Número de parcelas", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar e conferir", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `pagamento / ${width}`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath(`pagamento-unico-${width}x${height}.png`), fullPage: true });
  }
});

test("configurações: todas as etapas são alcançáveis nos cinco tamanhos", async ({ page }, testInfo) => {
  const routes = [
    ["/clientes/novo", "Etapa do cadastro"],
    ["/fornecedores?novo=1", "Etapa do fornecedor"],
    ["/funil/nova", "Etapa da oportunidade"],
    ["/equipe/nova", "Etapa da pessoa"],
    ["/parametros/contrato", "Etapa da configuração"],
    ["/parametros?ver=precos", "Parte da regra de preço"],
  ];
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    for (const [route, label] of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const chooser = page.getByRole("combobox", { name: label, exact: true });
      await expect(chooser).toBeVisible();
      const steps = await chooser.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value).filter((value) => value !== "-1"));
      for (const step of steps) {
        await chooser.selectOption(step);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${route} / ${step} / ${width}`).toBeLessThanOrEqual(0);
        if (route === "/parametros/contrato") {
          expect(await page.evaluate(() => document.documentElement.scrollHeight), `contrato / ${step} / ${width}`).toBeLessThanOrEqual(height);
        }
        await page.screenshot({ path: testInfo.outputPath(`${route.slice(1).replace(/[^a-z0-9]/gi, "_")}-etapa-${step}-${width}.png`), fullPage: true });
      }
    }
  }
  await page.goto("/fornecedores?novo=1");
  await page.getByRole("button", { name: "Salvar fornecedor", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Etapa do fornecedor", exact: true })).toHaveValue("-1");
  await expect(page.getByRole("textbox", { name: "Observações", exact: true })).toBeVisible();
});

test("regras fiscais: todos os grupos ficam visíveis nos cinco tamanhos", async ({ page }, testInfo) => {
  const sections = ["Natureza da operação", "CFOP", "ICMS e IPI", "PIS", "COFINS", "Classificação IBS/CBS", "Alíquotas IBS/CBS", "Condições da venda"];
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.goto("/parametros/fiscal?ver=regras", { waitUntil: "networkidle" });
    for (const section of sections) {
      await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Salvar regras fiscais", exact: true })).toBeVisible();
    await expect(page.getByText(/\d+ de 8 ·/)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath(`regras-fiscais-${width}x${height}.png`), fullPage: true, caret: "initial" });
  }
});

test("cores: erro preserva o nome e salvar confirma a alteração", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/parametros/cores");
  await page.locator("summary").filter({ hasText: "Adicionar cor" }).click();
  await page.getByLabel("Nome da cor", { exact: true }).fill("Piano Black");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("já está na lista", { timeout: 30_000 });
  await expect(page.getByLabel("Nome da cor", { exact: true })).toHaveValue("Piano Black");
  await page.getByRole("link", { name: "Editar Piano Black", exact: true }).click();
  await page.getByRole("button", { name: "Salvar cor", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Cor salva.");
});

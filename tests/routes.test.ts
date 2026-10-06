import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { MENU_ITEMS } from "@/lib/auth/permissions";

const APP_DIR = fileURLToPath(new URL("../src/app/(app)/", import.meta.url));

/** Every page.tsx under the protected group, as a route path. */
function pages(dir = APP_DIR, route = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return pages(`${dir}${entry.name}/`, `${route}/${entry.name}`);
    return entry.name === "page.tsx" ? [route] : [];
  });
}

const source = (route: string) => readFileSync(`${APP_DIR}${route.slice(1)}/page.tsx`, "utf8");

test("toda rota da matriz tem page.tsx que chama requirePermission com o próprio item", () => {
  for (const item of MENU_ITEMS) {
    assert.ok(existsSync(`${APP_DIR}${item.href.slice(1)}/page.tsx`), `falta a página de ${item.href}`);
    const code = source(item.href);
    assert.ok(
      code.includes(`await requirePermission("${item.key}")`),
      `${item.href} não chama requirePermission("${item.key}")`,
    );
  }
});

/** Every item of the menu is a real screen now: none is a placeholder. */
const PORTED = MENU_ITEMS.map((item) => item.key);

test("páginas portadas não são mais marcador; as outras continuam Em construção", () => {
  for (const item of MENU_ITEMS) {
    const code = source(item.href);
    if (PORTED.includes(item.key)) {
      assert.ok(!code.includes("PlaceholderPage") && !code.includes("Em construção"), `${item.href} ainda é marcador`);
    } else {
      assert.ok(code.includes("PlaceholderPage"), `${item.href} deveria estar Em construção`);
    }
  }
  assert.equal(MENU_ITEMS.filter((item) => !PORTED.includes(item.key)).length, 0);
});

/** Every source file under the protected group, relative to it. */
const appFiles = () =>
  readdirSync(APP_DIR, { recursive: true, encoding: "utf8" }).filter((file) => /\.tsx?$/.test(file));

test("toda ação de servidor confere a permissão antes de qualquer outra coisa", () => {
  const actions = appFiles().filter((file) => /^\s*["']use server["']/m.test(readFileSync(APP_DIR + file, "utf8")));
  assert.ok(actions.includes("parametros/actions.ts"));
  assert.ok(actions.includes("produtos/actions.ts"));
  assert.ok(actions.includes("clientes/actions.ts"));
  assert.ok(actions.includes("pedidos/actions.ts"));
  assert.ok(actions.includes("aprovacoes/actions.ts"));
  assert.ok(actions.includes("recebimentos/actions.ts"));
  assert.ok(actions.includes("comissoes/actions.ts"));
  assert.ok(actions.includes("contas-pagar/actions.ts"));
  assert.ok(actions.includes("fornecedores/actions.ts"));
  assert.ok(actions.includes("precos-metas/actions.ts"));
  for (const file of actions) {
    const code = readFileSync(APP_DIR + file, "utf8");
    // Each exported action opens with the check: nothing is read from the form or the database before it.
    const bodies = code.split(/export async function \w+\([^)]*\)[^{]*\{/).slice(1);
    assert.ok(bodies.length > 0, `${file} não exporta ação`);
    for (const body of bodies) {
      assert.match(body.trimStart(), /^(const \w+ = )?await requirePermission\(/, `${file}: ação sem requirePermission no início`);
    }
  }
});

test("a página lê o banco só depois de conferir a permissão", () => {
  const reads: [string, string, string[]][] = [
    ["/parametros", "parametros", ["loadParams(", "listProductCosts("]],
    ["/produtos", "produtos", ["loadParams(", "listProducts(", "latestVersion(", "loadPublishedSnapshot("]],
    ["/clientes", "clientes", ["listCustomers("]],
    ["/clientes/[id]", "clientes", ["getCustomer("]],
    ["/pedidos/novo", "pedidos", ["latestVersion(", "loadPublishedTable("]],
    ["/tabela-precos", "tabela-precos", ["latestVersion(", "loadPublishedTable(", "loadPublishedSnapshot("]],
  ];
  for (const [route, key, calls] of reads) {
    const code = source(route);
    const permission = code.indexOf(`await requirePermission("${key}"`);
    assert.ok(permission > 0, route);
    for (const read of calls) {
      assert.ok(code.includes(read), `${route} não chama ${read}`);
      assert.ok(code.indexOf(read) > permission, `${route}: ${read} antes do requirePermission`);
    }
  }
});

test("Tabela de preços: custo só é lido para quem pode ver, e nada da pasta vai para o navegador como código", () => {
  const files = appFiles().filter((file) => file.startsWith("tabela-precos/"));
  assert.ok(files.includes("tabela-precos/page.tsx"));
  for (const file of files) {
    // Sem componente de navegador nem ação: não existe prop para levar dado no payload.
    assert.doesNotMatch(readFileSync(APP_DIR + file, "utf8"), /["']use (client|server)["']/, file);
  }

  const code = source("/tabela-precos");
  // A página não lê o rascunho, não guarda resposta e não compara o perfil por conta própria.
  for (const forbidden of ["@/lib/db/products", "@/lib/db/params", "use cache", "unstable_cache", '"DIRETORIA"']) {
    assert.ok(!code.includes(forbidden), `tabela-precos/page.tsx contém ${forbidden}`);
  }
  assert.ok(code.includes('export const dynamic = "force-dynamic"'));
  assert.ok(code.includes('const session = await requirePermission("tabela-precos")'));

  const decides = code.indexOf("seesCosts(session.role)");
  assert.ok(decides > 0, "quem vê custo tem de sair de seesCosts(session.role)");
  assert.equal(code.split("loadPublishedSnapshot(").length - 1, 1, "loadPublishedSnapshot( tem de aparecer uma vez só");
  assert.ok(code.indexOf("loadPublishedSnapshot(") > decides);
  // O perfil e "ver custo" nunca vêm do endereço.
  assert.doesNotMatch(code, /seesCosts\((?!session\.role\))/);
});

test("Pedido: custo só é lido para quem pode ver, e nada dele vai para componente de navegador", () => {
  const code = source("/pedidos/[numero]");
  assert.ok(code.includes('export const dynamic = "force-dynamic"'));
  assert.ok(code.includes('const session = await requirePermission("pedidos"'));
  for (const forbidden of ['"DIRETORIA"', "use cache", "unstable_cache", "@/lib/db/products", "@/lib/db/params"]) {
    assert.ok(!code.includes(forbidden), `pedidos/[numero]/page.tsx contém ${forbidden}`);
  }

  // O escopo e "ver custo" saem da sessão; o pedido é lido antes de qualquer custo.
  assert.ok(code.includes("seesAllOrders(session.role) ? null : session.email"));
  const permission = code.indexOf("await requirePermission(");
  const decides = code.indexOf("seesCosts(session.role)");
  assert.ok(decides > permission && permission > 0);
  assert.doesNotMatch(code, /seesCosts\((?!session\.role\))/);
  assert.doesNotMatch(code, /seesAllOrders\((?!session\.role\))/);
  assert.equal(code.split("loadPublishedSnapshot(").length - 1, 1, "loadPublishedSnapshot( tem de aparecer uma vez só");
  assert.ok(code.indexOf("loadPublishedSnapshot(") > decides);
  for (const read of ["getOrder(", "loadPublishedTable(", "loadOrderStanding("]) {
    assert.ok(code.indexOf(read) > permission, `${read} antes do requirePermission`);
  }

  // Nenhum componente de navegador da pasta conhece o quadro do diretor.
  const files = appFiles().filter((file) => file.startsWith("pedidos/"));
  const client = files.filter((file) => /^\s*["']use client["']/m.test(readFileSync(APP_DIR + file, "utf8")));
  assert.ok(client.includes("pedidos/ActionForm.tsx"));
  for (const file of client) {
    assert.doesNotMatch(
      readFileSync(APP_DIR + file, "utf8"),
      /loadPublishedSnapshot|directorOf|DirectorBoard|OrderQuote|equipmentCost|netProfit|chinaPayment/,
      file,
    );
  }
  // E o quadro é componente de servidor.
  assert.doesNotMatch(readFileSync(`${APP_DIR}pedidos/DirectorBoard.tsx`, "utf8"), /["']use client["']/);
  // A fila de aprovações também não: quem decide e se pode aprovar prejuízo sai da sessão.
  const approvals = source("/aprovacoes");
  assert.doesNotMatch(approvals, /loadPublishedSnapshot|seesCosts|directorOf|DirectorBoard|"DIRETORIA"/);
  assert.ok(approvals.includes("approvesAtLoss(session.role)"));
  const deciding = readFileSync(`${APP_DIR}aprovacoes/actions.ts`, "utf8");
  assert.ok(deciding.includes("approvesAtLoss: approvesAtLoss(session.role)"));
  assert.doesNotMatch(deciding, /formData\.get\("(role|email|approvesAtLoss)"\)|text\("(role|email|approvesAtLoss)"\)/);
  // A lista de pedidos não lê custo nenhum, e o escopo dela sai da sessão.
  const list = source("/pedidos");
  assert.doesNotMatch(list, /loadPublishedSnapshot|loadOrderStanding|seesCosts|directorOf|DirectorBoard/);
  assert.ok(list.includes("seesAllOrders(session.role)"));
  assert.ok(list.includes("listOrders({ sellerEmail: everyone ? null : session.email }, conn)"));
});

test("multi-empresa: toda leitura e gravação usa o banco da empresa da sessão", () => {
  const sources = appFiles().map((file) => [file, readFileSync(APP_DIR + file, "utf8")] as const);
  let uses = 0;
  for (const [file, code] of sources) {
    // A empresa só sai da sessão: nunca de campo, parâmetro do endereço ou valor fixo.
    for (const [call] of code.matchAll(/tenantDb\([^)]*\)/g)) {
      assert.equal(call, "tenantDb(session.tenant.slug)", `${file}: ${call}`);
      uses += 1;
    }
    assert.doesNotMatch(code, /from "pg"|new pg\.|search_path|tenant_/, `${file} fala com o banco por fora da camada`);
  }
  assert.ok(uses >= 20, `só ${uses} usos de tenantDb`);
  // O menu e a rota da logo também: a logo é sempre a da empresa de quem está logado.
  for (const file of ["../src/components/Sidebar.tsx", "../src/app/empresa/logo/route.ts"]) {
    const code = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.deepEqual([...code.matchAll(/tenantDb\([^)]*\)/g)].map(([call]) => call), ["tenantDb(session.tenant.slug)"], file);
  }

  // Não existe conexão "do sistema": a camada de banco não tem conexão padrão.
  const dbDir = new URL("../src/lib/db/", import.meta.url);
  for (const file of readdirSync(dbDir).filter((name) => name.endsWith(".ts"))) {
    const code = readFileSync(new URL(file, dbDir), "utf8");
    assert.doesNotMatch(code, /conn: Queryable = /, `${file} tem conexão padrão`);
  }
  const pool = readFileSync(new URL("pool.ts", dbDir), "utf8");
  assert.doesNotMatch(pool, /export function db\(/);
  // Quem chama uma função de banco numa tela ou ação tem de ter a sessão antes.
  for (const [file, code] of sources) {
    if (!code.includes("tenantDb(")) continue;
    for (const body of code.split(/\n(?:export )?(?:default )?async function \w+\(/).slice(1)) {
      if (!body.includes("tenantDb(")) continue;
      assert.ok(body.indexOf("await requirePermission(") < body.indexOf("tenantDb("), `${file}: banco antes da permissão`);
      assert.ok(body.indexOf("await requirePermission(") >= 0, `${file}: banco sem permissão`);
    }
  }
});

test("usuários: só quem tem Parâmetros cadastra, e quem altera sai da sessão", () => {
  assert.ok(source("/parametros/usuarios").includes('await requirePermission("parametros")'));
  const actions = readFileSync(`${APP_DIR}parametros/usuarios/actions.ts`, "utf8");
  assert.equal(actions.split('await requirePermission("parametros")').length - 1, 2);
  assert.ok(actions.includes("createUser(parsed.user, session.email, conn)"));
  assert.ok(actions.includes("session.email, conn)"));
});

test("Dashboard, Preços e metas e Simulador: custo e lucro só para quem pode ver, decidido pela sessão", () => {
  for (const route of ["/dashboard", "/precos-metas", "/simulador"]) {
    const code = source(route);
    assert.ok(code.includes('export const dynamic = "force-dynamic"'), route);
    assert.doesNotMatch(code, /"DIRETORIA"|use cache|unstable_cache/, route);
    assert.doesNotMatch(code, /seesCosts\((?!session\.role\))/, route);
    const decides = code.indexOf("seesCosts(session.role)");
    assert.ok(decides > code.indexOf("await requirePermission("), route);
    // Tudo o que revela custo ou lucro vem depois da decisão, e só dentro dela.
    for (const costly of ["ordersProfit(", "loadPublishedSnapshot(", "loadParams(", "listProductCosts(", "listCommissionsDue("]) {
      const at = code.indexOf(costly);
      if (at !== -1 && route !== "/dashboard") assert.ok(at > decides, `${route}: ${costly} antes de seesCosts`);
    }
  }
  assert.ok(source("/dashboard").indexOf("ordersProfit(") > source("/dashboard").indexOf("seesCosts(session.role)"));
  // O vendedor tem o dashboard, mas só com os pedidos dele: o escopo sai da sessão.
  assert.ok(source("/dashboard").includes("listDashboardOrders({ sellerEmail: everyone ? null : session.email }, conn)"));
  assert.ok(source("/dashboard").includes("const everyone = seesAllOrders(session.role);"));
  // No simulador a equipe recebe só o nome da faixa.
  assert.ok(source("/simulador").includes("simulationBand(latest.version, simulation, conn)"));
  const goals = readFileSync(`${APP_DIR}precos-metas/actions.ts`, "utf8");
  assert.ok(goals.includes("if (!setsGoals(session.role)) return"));
  assert.ok(goals.indexOf("setsGoals(session.role)") < goals.indexOf("saveGoal("));
  assert.doesNotMatch(goals, /text\("month"\)/);
});

test("comissões e estorno: o escopo e quem decide saem da sessão", () => {
  const page = source("/comissoes");
  assert.ok(page.includes("const manages = managesCommissions(session.role);"));
  assert.ok(page.includes("const scope = manages ? null : session.email;"));
  // Toda leitura de comissão passa o escopo: nenhuma chamada com `null` fixo.
  assert.doesNotMatch(page, /list(Commissions|CommissionMonths|CarriedBalances)\([^)]*\bnull\b/);
  const paying = readFileSync(`${APP_DIR}comissoes/actions.ts`, "utf8");
  assert.ok(paying.includes("if (!managesCommissions(session.role)) return"));
  assert.ok(paying.indexOf("managesCommissions(session.role)") < paying.indexOf("payCommissions("));
  const refunds = readFileSync(`${APP_DIR}recebimentos/actions.ts`, "utf8");
  assert.ok(refunds.includes("if (!confirmsRefunds(session.role)) return"));
  assert.ok(refunds.indexOf("confirmsRefunds(session.role)") < refunds.indexOf("decideRefund("));
});

test("formas de pagamento: só quem tem Parâmetros altera", () => {
  assert.ok(source("/parametros/formas-de-pagamento").includes('await requirePermission("parametros")'));
  const actions = readFileSync(`${APP_DIR}parametros/formas-de-pagamento/actions.ts`, "utf8");
  assert.equal(actions.split('await requirePermission("parametros")').length - 1, 2);
});

test("/pedidos/novo é protegida pelo item Pedidos", () => {
  assert.ok(source("/pedidos/novo").includes(`await requirePermission("pedidos", "/pedidos/novo")`));
});

test("não existe página no grupo protegido sem requirePermission", () => {
  const all = pages();
  // The menu items, plus /pedidos/novo, one order, the record of one customer and of one supplier,
  // and the users, the forms of payment and the categories of bills of the company.
  assert.equal(all.length, MENU_ITEMS.length + 10);
  for (const route of all) {
    assert.match(source(route), /await requirePermission\(/, route);
  }
});

test("o perfil não é lido de dado enviado pelo navegador", () => {
  const layout = readFileSync(`${APP_DIR}layout.tsx`, "utf8");
  const sidebar = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
  assert.ok(layout.includes("await getSession()"));
  // The layout never swallows the page: the page is what redirects.
  assert.ok(layout.includes("if (!session) return children;"));
  assert.doesNotMatch(layout, /return null/);
  for (const code of [layout, sidebar]) {
    assert.doesNotMatch(code, /"use client"|searchParams|next\/headers/);
  }
  // No celular o menu abre e fecha: essa moldura é o único pedaço de navegador, e não recebe sessão nem perfil.
  const frame = readFileSync(new URL("../src/components/MobileMenu.tsx", import.meta.url), "utf8");
  assert.match(frame, /^"use client"/);
  assert.doesNotMatch(frame, /session|role|@\/lib\/(auth|db)/i);
});

const API_DIR = fileURLToPath(new URL("../src/app/api/", import.meta.url));

/** Routes that answer without a session, by name. Anything not listed here must open with the session. */
const PUBLIC_ROUTES = new Set(["health/route.ts"]);

test("toda rota de src/app/api confere a sessão, e a empresa só sai dela", () => {
  const routes = readdirSync(API_DIR, { recursive: true, encoding: "utf8" }).filter((file) => /(^|\/)route\.tsx?$/.test(file));
  assert.ok(routes.includes("produtos/[id]/foto/route.ts"));
  for (const file of PUBLIC_ROUTES) assert.ok(routes.includes(file), `${file} está na lista de rotas públicas e não existe`);
  for (const file of routes) {
    const code = readFileSync(API_DIR + file, "utf8");
    if (PUBLIC_ROUTES.has(file)) {
      // Pública de propósito: em troca, não conhece banco, sessão nem empresa, e não lê nada do pedido.
      for (const forbidden of ["@/lib/db", "tenantDb", "getSession", "cookies", "searchParams", "next/headers", "@/lib/auth"]) {
        assert.ok(!code.includes(forbidden), `${file} é pública e contém ${forbidden}`);
      }
      assert.doesNotMatch(code, /from "pg"|new pg\.|search_path|tenant_/, `${file} é pública e fala com o banco`);
      // Método sem parâmetro não tem pedido para ler: nem corpo, nem cabeçalho, nem endereço.
      const methods = [...code.matchAll(/export (?:async )?function (?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\(([^)]*)\)/g)];
      assert.ok(methods.length > 0, `${file} não exporta método`);
      for (const [, params] of methods) assert.equal(params.trim(), "", `${file} é pública e recebe o pedido`);
      assert.doesNotMatch(code, /\b(?:request|req)\b|formData\(|arrayBuffer\(|\.text\(|\.body\b|\.headers\b/i, `${file} é pública e lê o pedido`);
      continue;
    }
    assert.ok(code.includes("await getSession()"), `${file} não chama getSession()`);
    // Cada método exportado começa pela sessão: nada é lido do pedido nem do banco antes dela.
    const bodies = code.split(/export async function (?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\([^)]*\)[^{]*\{/).slice(1);
    assert.ok(bodies.length > 0, `${file} não exporta método`);
    for (const body of bodies) {
      assert.match(body.trimStart(), /^const session = (await getSession\(\)|editor\(await getSession\(\)\));/, `${file}: método sem sessão no início`);
    }
    for (const [call] of code.matchAll(/tenantDb\([^)]*\)/g)) {
      assert.equal(call, "tenantDb(session.tenant.slug)", `${file}: ${call}`);
    }
    assert.doesNotMatch(code, /from "pg"|new pg\.|search_path|tenant_|searchParams|formData\(/, `${file} foge da regra das rotas`);
  }
});

test("orçamento em PDF: sai da conta da equipe, nunca lê custo, e o escopo vem da sessão", () => {
  const route = readFileSync(`${API_DIR}pedidos/[numero]/orcamento/route.ts`, "utf8");
  for (const forbidden of ["loadPublishedSnapshot", "directorOf", "loadOrderStanding", "seesCosts", '"DIRETORIA"', "engineOrder", "quoteOrder"]) {
    assert.ok(!route.includes(forbidden), `a rota do orçamento contém ${forbidden}`);
  }
  assert.ok(route.includes('canAccess(session.role, "pedidos")'));
  assert.ok(route.includes("getOrder(numero, { sellerEmail: seesAllOrders(session.role) ? null : session.email }, conn)"));
  assert.doesNotMatch(route, /seesAllOrders\((?!session\.role\))|canAccess\((?!session\.role,)/);
  // Nada do pedido HTTP é lido: nem endereço, nem cabeçalho, nem corpo. E só existe o GET.
  assert.doesNotMatch(route, /\brequest\b|\.headers\b|\.url\b|\.json\(|arrayBuffer\(|cookies\(/);
  assert.deepEqual([...route.matchAll(/export (?:async )?function (\w+)/g)].map(([, name]) => name), ["GET"]);
  // A foto entra sempre reduzida, e o pedido é conferido antes de qualquer imagem ser lida.
  assert.ok(route.includes("await thumbnail(photo, PHOTO_SIDE)"));
  assert.ok(route.indexOf("getOrder(") < route.indexOf("loadQuoteProducts(") && route.indexOf("loadQuoteProducts(") < route.indexOf("thumbnail(photo"));

  // O conteúdo e o desenho não conhecem custo nem sessão.
  for (const file of ["document.ts", "pdf.ts"]) {
    const code = readFileSync(new URL(`../src/lib/quote/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(code, /loadPublishedSnapshot|directorOf|engineOrder|quoteOrder|realCost|advisoryCost|@\/lib\/auth|process\.env/, file);
  }

  // Na tela, o botão é um link comum para a rota, só com item, fora do bloco que trava em somente leitura.
  const page = source("/pedidos/[numero]");
  const link = page.indexOf("href={`/api/pedidos/${order.number}/orcamento`}");
  assert.ok(link > 0 && link < page.indexOf("<fieldset disabled={!editable}"));
  assert.ok(page.slice(link - 120, link).includes("order.items.length > 0"));
  assert.match(page.slice(link, link + 200), /target="_blank" rel="noopener"[^>]*>\s*Salvar PDF/);
});

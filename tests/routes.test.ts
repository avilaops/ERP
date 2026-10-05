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

/** Pages already ported from the prototype. The others still say "Em construção". */
const PORTED = ["parametros", "produtos", "tabela-precos", "clientes"];

test("páginas portadas não são mais marcador; as outras continuam Em construção", () => {
  for (const item of MENU_ITEMS) {
    const code = source(item.href);
    if (PORTED.includes(item.key)) {
      assert.ok(!code.includes("PlaceholderPage") && !code.includes("Em construção"), `${item.href} ainda é marcador`);
    } else {
      assert.ok(code.includes("PlaceholderPage"), `${item.href} deveria estar Em construção`);
    }
  }
  assert.equal(MENU_ITEMS.filter((item) => !PORTED.includes(item.key)).length, 10);
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
  // A lista de pedidos ainda é marcador: entra na parte seguinte.
  assert.ok(source("/pedidos").includes("PlaceholderPage"));
});

test("/pedidos/novo é protegida pelo item Pedidos", () => {
  assert.ok(source("/pedidos/novo").includes(`await requirePermission("pedidos", "/pedidos/novo")`));
});

test("não existe página no grupo protegido sem requirePermission", () => {
  const all = pages();
  // The menu items, plus /pedidos/novo, one order and the record of one customer.
  assert.equal(all.length, MENU_ITEMS.length + 3);
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
});

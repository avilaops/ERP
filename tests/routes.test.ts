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
    assert.ok(code.includes("Em construção") || code.includes("PlaceholderPage"), item.href);
  }
});

test("/pedidos/novo é protegida pelo item Pedidos", () => {
  assert.ok(source("/pedidos/novo").includes(`await requirePermission("pedidos", "/pedidos/novo")`));
});

test("não existe página no grupo protegido sem requirePermission", () => {
  const all = pages();
  assert.equal(all.length, MENU_ITEMS.length + 1);
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

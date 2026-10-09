import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULT_ROWS, MAX_ROWS, MIN_ROWS, pageOf, rowsPerPage } from "@/lib/rows";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (file: string) => readFileSync(ROOT + file, "utf8");
const APP = "src/app/(app)/";
const pages = () => readdirSync(ROOT + APP, { recursive: true, encoding: "utf8" }).filter((file) => /\.tsx$/.test(file));

test("diretrizes de UX: a regra está escrita e as instruções dos agentes apontam para ela", () => {
  const guide = read("docs/ux.md");
  for (const expected of ["uma tela, uma tarefa, uma decisão", "360×640", "1440×900", "overflow: hidden", "PageHeader", "FitRows", "--tabbar"]) assert.ok(guide.includes(expected), expected);
  for (const file of ["AGENTS.md", "CLAUDE.md"]) assert.ok(read(file).includes("docs/ux.md"), file);
});

test("fatia de lista: página pedida além do fim cai na última, e lixo no endereço cai na primeira", () => {
  const rows = Array.from({ length: 133 }, (_, index) => index + 1);
  assert.deepEqual(pageOf(rows, undefined, 8), { rows: [1, 2, 3, 4, 5, 6, 7, 8], page: 1, pages: 17, from: 1, to: 8, total: 133 });
  const last = pageOf(rows, "17", 8);
  assert.deepEqual([last.rows, last.from, last.to], [[129, 130, 131, 132, 133], 129, 133]);
  assert.equal(pageOf(rows, "999", 8).page, 17);
  for (const junk of ["0", "-2", "abc", "1.5", "2; drop", ""]) assert.equal(pageOf(rows, junk, 8).page, 1, junk);
  assert.deepEqual(pageOf([], "3", 8), { rows: [], page: 1, pages: 1, from: 0, to: 0, total: 0 });
});

test("linhas por tela: o que o navegador mediu fica entre o mínimo e o máximo; sem medida, o padrão", () => {
  assert.equal(rowsPerPage(undefined), DEFAULT_ROWS);
  assert.equal(rowsPerPage("12"), 12);
  assert.equal(rowsPerPage("1"), MIN_ROWS);
  assert.equal(rowsPerPage("99"), MAX_ROWS);
  for (const junk of ["", "abc", "-5", "1e3", "12; path=/"]) assert.equal(rowsPerPage(junk), DEFAULT_ROWS, junk);
});

test("moldura: o que gruda numa borda respeita as barras do celular", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /--topbar: 3\.25rem;/);
  assert.match(css, /--tabbar: calc\(3\.5rem \+ env\(safe-area-inset-bottom\)\);/);
  // Dentro das páginas, nada gruda no topo ou no pé da tela sem contar com as barras.
  for (const file of pages()) assert.doesNotMatch(read(APP + file), /sticky (top|bottom)-0\b/, file);
  assert.ok(read(`${APP}layout.tsx`).includes("pb-[calc(var(--tabbar)+1rem)]"));
  // No celular: até quatro destinos e "Mais"; no computador o menu tem a altura da janela e rolagem própria.
  const frame = read("src/components/MobileMenu.tsx");
  assert.ok(frame.includes('aria-label="Atalhos"') && frame.includes('{open ? "Fechar" : "Mais"}'));
  assert.ok(frame.includes("md:sticky md:top-0 md:h-dvh"));
  assert.ok(read("src/components/Sidebar.tsx").includes(".slice(0, 4)"));
});

test("tabela de preços: consulta paginada, sem rolagem lateral e sem cortar nome ou preço", () => {
  const page = read(`${APP}tabela-precos/page.tsx`);
  // O catálogo nunca é desenhado inteiro: só a fatia.
  assert.ok(page.includes("const slice = pageOf(view.rows, first(query.p), size);"));
  assert.ok(page.includes("slice.rows.map((row) =>") && !page.includes("view.rows.map("));
  assert.ok(page.includes("<Pager {...slice}") && page.includes('<FitRows listId="equipamentos" shown={size} />'));
  assert.doesNotMatch(page, /overflow-x-auto|overflow-hidden|truncate|<table/);
  // A paginação leva a busca e os filtros junto.
  assert.ok(page.includes("lineHref(ITEM.href, line.id, { ...kept, p: page > 1 ? String(page) : undefined })"));
  // O preço em destaque diz o que é.
  assert.ok(page.includes("preço em destaque: {view.mainLabel}"));
});

test("simulador: três etapas no celular, equipamento por busca e os dados seguem de uma etapa para a outra", () => {
  const page = read(`${APP}simulador/page.tsx`);
  assert.ok(page.includes('const STEPS = ["Equipamento", "Condições", "Resultado"] as const;'));
  // Busca no lugar da lista com o catálogo inteiro.
  assert.ok(page.includes("<EquipmentPicker") && !page.includes('<select id="equipamento"'));
  // Um formulário só: avançar, voltar e editar enviam tudo o que foi digitado.
  assert.equal(page.split("<form ").length - 1, 1);
  assert.equal(page.split('name="etapa"').length - 1, 3);
  assert.ok(page.includes('form={FORM} name="etapa" value="2"'));
  // O resultado destaca o total, diz que não foi salvo e deixa a composição a um toque.
  for (const expected of ["Simulação não salva", "Total da venda", "Entrada mínima", "Ver composição", "Criar pedido", "<Pill tone={BAND_TONES[band]}>"]) assert.ok(page.includes(expected), expected);
  assert.doesNotMatch(page, /overflow-x-auto|overflow-hidden|truncate/);
});

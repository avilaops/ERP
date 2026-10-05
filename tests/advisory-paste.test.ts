import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appliedText,
  ignoredText,
  parseAdvisoryPaste,
  PASTE_MAX_CHARS,
  PASTE_MAX_LINES,
  pasteSizeProblem,
  previewRows,
} from "@/lib/advisory-paste";
import type { Product } from "@/lib/db/products";

const KNOWN = new Set(["LD-B001", "LD-B002", "LD-B003", "LD-B004"]);
const parse = (text: string) => parseAdvisoryPaste(text, KNOWN);
/** Only what the database layer receives, without where the line came from. */
const costs = (text: string) =>
  parse(text).rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "line" && key !== "text")));
const reasons = (text: string) => parse(text).invalid.map(({ line, reason }) => [line, reason]);

test("colagem: as quatro linhas do print, copiadas de planilha (TAB), com o crédito em precisão cheia", () => {
  const text = [
    "LD-B001\t8.146,64\t28,11565",
    "LD-B002\t8.738,77\t27,35316",
    "LD-B003\t11.571,09\t27,66628",
    "LD-B004\t8.719,03\t27,37689",
  ].join("\n");
  const parsed = parse(text);
  assert.deepEqual(parsed.invalid, []);
  assert.equal(parsed.headerSkipped, false);
  assert.deepEqual(costs(text), [
    { code: "LD-B001", advisoryCost: 8146.64, taxCredit: 0.2811565 },
    { code: "LD-B002", advisoryCost: 8738.77, taxCredit: 0.2735316 },
    { code: "LD-B003", advisoryCost: 11571.09, taxCredit: 0.2766628 },
    { code: "LD-B004", advisoryCost: 8719.03, taxCredit: 0.2737689 },
  ]);
  assert.deepEqual(parsed.rows.map((row) => row.line), [1, 2, 3, 4]);
  assert.equal(parsed.rows[0].text, "LD-B001\t8.146,64\t28,11565");
});

test("colagem: ponto e vírgula quando a linha não tem TAB; R$ e % são aceitos", () => {
  assert.deepEqual(costs("LD-B001; R$ 8.146,64 ; 28,11565% ; 149,90\nLD-B002;8738,77;27,35316 %;0"), [
    { code: "LD-B001", advisoryCost: 8146.64, taxCredit: 0.2811565, packaging: 149.9 },
    { code: "LD-B002", advisoryCost: 8738.77, taxCredit: 0.2735316, packaging: 0 },
  ]);
  // Com TAB na linha, o ponto e vírgula não separa nada.
  assert.deepEqual(reasons("LD-B001;8.146,64\t10,00"), [[1, "código não cadastrado"]]);
});

test("colagem: coluna opcional vazia ou ausente mantém o valor atual do produto", () => {
  assert.deepEqual(costs("LD-B001\t8.146,64"), [{ code: "LD-B001", advisoryCost: 8146.64 }]);
  assert.deepEqual(costs("LD-B001\t8.146,64\t\t"), [{ code: "LD-B001", advisoryCost: 8146.64 }]);
  assert.deepEqual(costs("LD-B001\t8.146,64\t\t50,00"), [{ code: "LD-B001", advisoryCost: 8146.64, packaging: 50 }]);
  assert.deepEqual(costs("LD-B001;8.146,64;;;;"), [{ code: "LD-B001", advisoryCost: 8146.64 }]);
});

test("colagem: cabeçalho e linhas em branco são ignorados, e o número da linha é o do texto colado", () => {
  const text = "\r\n  \r\nCódigo\tCusto assessoria R$\tCrédito\r\n\r\nLD-B001\t8.146,64\r\nLD-B009\t1,00\r\n";
  const parsed = parse(text);
  assert.equal(parsed.headerSkipped, true);
  assert.deepEqual(parsed.rows.map((row) => [row.line, row.code]), [[5, "LD-B001"]]);
  assert.deepEqual(reasons(text), [[6, "código não cadastrado"]]);

  // Só a primeira linha não vazia pode ser cabeçalho; "R$ 8.146,64" tem letra mas é valor.
  assert.equal(parse("LD-B001\tR$ 8.146,64").headerSkipped, false);
  assert.deepEqual(reasons("LD-B001\t8.146,64\nLD-B002\tcusto"), [[2, "custo inválido"]]);
  assert.deepEqual(parse(""), { rows: [], invalid: [], headerSkipped: false });
  assert.deepEqual(parse(" \n\t\n"), { rows: [], invalid: [], headerSkipped: false });
});

test("colagem: cada motivo de linha inválida, sem impedir as outras", () => {
  const text = [
    "LD-B001\t8.146,64",
    "LD-B002",
    "LD-B002\t1,00\t2\t3,00\t4",
    "\t8.146,64",
    "LD-B999\t8.146,64",
    " ld-b003\t8.146,64",
    "LD-B003\t0",
    "LD-B003\t-5,00",
    "LD-B003\t8146.64",
    "LD-B003\t8.146,645",
    "LD-B003\t100,00\t100",
    "LD-B003\t100,00\t-1",
    "LD-B003\t100,00\t10\tabc",
    "LD-B004\t8.719,03\t0,28",
  ].join("\n");
  assert.deepEqual(reasons(text), [
    [2, "menos de duas colunas"],
    [3, "mais de quatro colunas"],
    [4, "código vazio"],
    [5, "código não cadastrado"],
    // A comparação do código é exata: sem trocar maiúsculas.
    [6, "código não cadastrado"],
    [7, "custo inválido"],
    [8, "custo inválido"],
    [9, "custo inválido"],
    [10, "custo inválido"],
    [11, "crédito inválido"],
    [12, "crédito inválido"],
    [13, "embalagem inválida"],
  ]);
  // Um crédito colado como fração é lido como 0,28%: é a conferência que mostra isso.
  assert.deepEqual(costs(text), [
    { code: "LD-B001", advisoryCost: 8146.64 },
    { code: "LD-B004", advisoryCost: 8719.03, taxCredit: 0.0028 },
  ]);
  assert.equal(parse(text).invalid[1].text, "LD-B002\t1,00\t2\t3,00\t4");
});

test("colagem: código repetido deixa todas as ocorrências de fora", () => {
  const text = "LD-B001\t100,00\nLD-B002\t200,00\nLD-B001\t300,00\nLD-B001\tabc";
  assert.deepEqual(reasons(text), [
    [1, "código repetido na colagem"],
    [3, "código repetido na colagem"],
    [4, "custo inválido"],
  ]);
  assert.deepEqual(costs(text), [{ code: "LD-B002", advisoryCost: 200 }]);
});

test("colagem: acima de 1.000 linhas ou de 100.000 caracteres o texto inteiro é recusado", () => {
  const line = "LD-B001\t8.146,64";
  assert.equal(pasteSizeProblem(Array(PASTE_MAX_LINES).fill(line).join("\n")), null);
  // Linha em branco não conta.
  assert.equal(pasteSizeProblem(Array(PASTE_MAX_LINES).fill(line).join("\n\n")), null);

  const tooManyLines = Array(PASTE_MAX_LINES + 1).fill(line).join("\n");
  assert.match(pasteSizeProblem(tooManyLines) ?? "", /passa de 1\.000 linhas/);
  assert.throws(() => parse(tooManyLines), /passa de 1\.000 linhas/);

  assert.equal(pasteSizeProblem("x".repeat(PASTE_MAX_CHARS)), null);
  const tooLong = "x".repeat(PASTE_MAX_CHARS + 1);
  assert.match(pasteSizeProblem(tooLong) ?? "", /passa de 100\.000 caracteres/);
  assert.throws(() => parse(tooLong), /passa de 100\.000 caracteres/);
});

const product = (change: Partial<Product>): Product => ({
  id: 1,
  name: "MESA FLEXORA",
  code: "LD-B001",
  supplierName: null,
  supplierModel: null,
  supplierPriceUsd: null,
  advisoryCost: 8146.64,
  taxCredit: 0.2811565,
  packaging: 0,
  active: true,
  ...change,
});

test("conferência: atual → novo para custo, crédito e embalagem; o que não veio fica como está", () => {
  const products = [
    product({}),
    product({ id: 2, name: "CADEIRA EXTENSORA", code: "LD-B002", advisoryCost: null, taxCredit: 0, active: false }),
    product({ id: 3, name: "Sem código", code: null }),
  ];
  const rows = [
    { code: "LD-B001", advisoryCost: 8500 },
    { code: "LD-B002", advisoryCost: 8738.77, taxCredit: 0.2735316, packaging: 50 },
    { code: "LD-B999", advisoryCost: 1 },
  ];
  assert.deepEqual(previewRows(rows, products), [
    {
      code: "LD-B001",
      name: "MESA FLEXORA",
      inactive: false,
      cost: { from: "8.146,64", to: "8.500,00", changed: true },
      credit: { from: "28,11565%", to: "28,11565%", changed: false },
      packaging: { from: "0,00", to: "0,00", changed: false },
    },
    {
      code: "LD-B002",
      name: "CADEIRA EXTENSORA",
      inactive: true,
      cost: { from: "sem custo", to: "8.738,77", changed: true },
      credit: { from: "0%", to: "27,35316%", changed: true },
      packaging: { from: "0,00", to: "50,00", changed: true },
    },
  ]);
});

test("resultado: singular e plural", () => {
  assert.equal(appliedText(1), "1 custo atualizado.");
  assert.equal(appliedText(4), "4 custos atualizados.");
  assert.equal(appliedText(0), "0 custos atualizados.");
  assert.equal(ignoredText(1), "1 linha ignorada");
  assert.equal(ignoredText(3), "3 linhas ignoradas");
});

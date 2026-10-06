import assert from "node:assert/strict";
import { test } from "node:test";
import { matchPhotos, parseProductsCsv, parseUsdPrice } from "@/lib/import/products-csv";

test("planilha com BOM, \\r\\n, aspas com ; e quebra de linha dentro", () => {
  const text =
    '﻿codigo;nome;descricao\r\n' +
    ' ld-b001 ;MESA FLEXORA;"Linha um; com ponto e vírgula\r\nlinha dois, com ""aspas"""\r\n' +
    "LD-B002;CADEIRA EXTENSORA;\r\n";
  const { rows, errors } = parseProductsCsv(text);
  assert.deepEqual(errors, []);
  assert.deepEqual(rows, [
    {
      line: 2,
      code: "LD-B001",
      name: "MESA FLEXORA",
      description: 'Linha um; com ponto e vírgula\nlinha dois, com "aspas"',
      supplierName: null,
      supplierModel: null,
      supplierPriceUsd: null,
    },
    { line: 4, code: "LD-B002", name: "CADEIRA EXTENSORA", description: null, supplierName: null, supplierModel: null, supplierPriceUsd: null },
  ]);
});

test("colunas fora de ordem, opcionais e preço nos dois formatos", () => {
  const text =
    "preco_usd;descricao;modelo;nome;fornecedor;codigo\n" +
    "1234.56;Com polia;XF-01;MESA;Fábrica A;LD_1\n" +
    '"1.234,56";;;BANCO;;ld.2\n' +
    "\n" +
    "0;;;SUPORTE;;LD-3";
  const { rows, errors } = parseProductsCsv(text);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    rows.map((row) => [row.line, row.code, row.name, row.description, row.supplierName, row.supplierModel, row.supplierPriceUsd]),
    [
      [2, "LD_1", "MESA", "Com polia", "Fábrica A", "XF-01", 1234.56],
      [3, "LD.2", "BANCO", null, null, null, 1234.56],
      [5, "LD-3", "SUPORTE", null, null, null, 0],
    ],
  );
});

test("preço em dólar: o que é aceito e o que não é", () => {
  assert.equal(parseUsdPrice("1234.56"), 1234.56);
  assert.equal(parseUsdPrice("1.234,56"), 1234.56);
  assert.equal(parseUsdPrice("1234,5"), 1234.5);
  assert.equal(parseUsdPrice("12"), 12);
  for (const refused of ["-1", "abc", "1,234.56", "1.234", "US$ 10", "1e3", "99999999999", ""]) {
    assert.equal(parseUsdPrice(refused), null, refused);
  }
});

test("cabeçalho: coluna obrigatória ausente, desconhecida ou repetida", () => {
  assert.deepEqual(parseProductsCsv("codigo;nome\nLD-1;MESA\n").errors, ['Linha 1: falta a coluna obrigatória "descricao".']);
  assert.deepEqual(parseProductsCsv("codigo;nome;descricao;custo\nLD-1;MESA;;10\n").errors, ['Linha 1: coluna desconhecida "custo".']);
  assert.deepEqual(parseProductsCsv("codigo;nome;descricao;nome\n").errors, ['Linha 1: coluna "nome" repetida.']);
  assert.deepEqual(parseProductsCsv("").errors, ["Planilha vazia: falta a linha de cabeçalho."]);
  // Cabeçalho em maiúsculas vale.
  assert.deepEqual(parseProductsCsv("CODIGO;Nome;Descricao\nLD-1;MESA;\n").errors, []);
});

test("cada erro de linha vem com o número da linha, e todos de uma vez", () => {
  const text = [
    "codigo;nome;descricao;preco_usd", // 1
    "LD-1;MESA;;", // 2 certa
    "LD-2;BANCO", // 3 campos a menos
    ";SEM CODIGO;;", // 4
    "LD 5;COM ESPAÇO;;", // 5
    "LD-6;;;", // 6 nome vazio
    "ld-1;REPETIDO;;", // 7
    "LD-8;PREÇO;;-3", // 8
    'LD-9;"DUAS', // 9 e 10: um registro só
    'LINHAS";;abc',
    "LD/11;;;x", // 11: três erros na mesma linha
  ].join("\n");
  const { rows, errors } = parseProductsCsv(text);
  assert.deepEqual(rows, []);
  assert.deepEqual(errors, [
    "Linha 3: 2 campos, e o cabeçalho tem 4.",
    "Linha 4: código vazio.",
    'Linha 5: código "LD 5" inválido (use só letras, números, "-", "_" e ".").',
    "Linha 6: nome vazio.",
    'Linha 7: código "LD-1" repetido (já está na linha 2).',
    'Linha 8: preco_usd "-3" não é um número, zero ou mais (ex.: 1234.56 ou 1.234,56).',
    'Linha 9: preco_usd "abc" não é um número, zero ou mais (ex.: 1234.56 ou 1.234,56).',
    'Linha 11: código "LD/11" inválido (use só letras, números, "-", "_" e ".").',
    "Linha 11: nome vazio.",
    'Linha 11: preco_usd "x" não é um número, zero ou mais (ex.: 1234.56 ou 1.234,56).',
  ]);
});

test("aspas que não fecham são erro, não uma planilha lida pela metade", () => {
  const { rows, errors } = parseProductsCsv('codigo;nome;descricao\nLD-1;MESA;"sem fim\nLD-2;BANCO;\n');
  assert.deepEqual(rows, []);
  assert.deepEqual(errors, ["Linha 2: aspas abertas e não fechadas."]);
});

test("fotos: casam com o código sem diferenciar maiúsculas", () => {
  const match = matchPhotos(["LD-B001", "LD-B002", "LD-B003"], ["ld-b001.JPG", "LD-B002.webp", "XX-999.jpeg", "Thumbs.db", "foto da mesa.png"]);
  assert.deepEqual(match.photos, [
    { code: "LD-B002", fileName: "LD-B002.webp" },
    { code: "XX-999", fileName: "XX-999.jpeg" },
    { code: "LD-B001", fileName: "ld-b001.JPG" },
  ]);
  assert.deepEqual(match.missing, ["LD-B003"]);
  assert.deepEqual(match.orphans, ["foto da mesa.png"]);
  assert.deepEqual(match.ignored, ["Thumbs.db"]);
  assert.deepEqual(match.errors, []);
});

test("fotos: duas para o mesmo código é erro", () => {
  const match = matchPhotos(["LD-B001"], ["LD-B001.jpg", "ld-b001.png"]);
  assert.deepEqual(match.errors, ["Código LD-B001: mais de uma foto (LD-B001.jpg, ld-b001.png)."]);
  assert.deepEqual(match.photos, []);
  assert.deepEqual(match.missing, []);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import type { QuoteDocument, QuoteItem } from "@/lib/quote/document";
import { renderQuotePdf } from "@/lib/quote/pdf";
import { pdfImages, pdfPieces, pdfText } from "./pdf-helpers.ts";

const item = (productId: number, patch: Partial<QuoteItem> = {}): QuoteItem => ({
  productId,
  code: `LD-B${String(productId).padStart(3, "0")}`,
  name: `Equipamento ${productId}`,
  description: null,
  quantity: 1,
  unitPrice: "R$ 10.000",
  unitDiscount: "R$ 500",
  unitIpi: "R$ 1.235",
  unitWithIpi: "R$ 10.735",
  totalWithIpi: "R$ 10.735",
  ...patch,
});

const DOCUMENT: QuoteDocument = {
  company: "Ludus Equipamentos",
  title: "Orçamento #261006-ABCD",
  issuedOn: "06/10/2026",
  validUntil: "12/10/2026",
  seller: { name: "Vera Vendedora", email: "vera@teste.local" },
  customer: {
    name: "Academia Força Total Ltda",
    tradeName: "Força Total",
    document: "48.240.052/0001-61",
    contactName: "Marina",
    phone: "(98) 99123-4567",
    email: "compras@forcatotal.example",
    cityUf: "São Luís/MA",
  },
  delivery: "Maranhão",
  production: "90 dias corridos, contados do pagamento da entrada",
  notes: "Entrega no térreo.",
  items: [item(1, { name: "Supino reto", description: "Estofado preto." }), item(2, { name: "Leg press 45°" })],
  hasDiscount: true,
  totals: [
    { label: "Total de tabela", value: "R$ 20.000", strong: false },
    { label: "Desconto (5,0%)", value: "– R$ 1.000", strong: false },
    { label: "Valor sem IPI", value: "R$ 19.000", strong: false },
    { label: "IPI (13%)", value: "R$ 2.470", strong: false },
    { label: "Total da nota", value: "R$ 21.470", strong: true },
  ],
  units: 2,
};

const NOTHING = { logo: null, photos: new Map<number, Uint8Array>() };

const jpeg = (width: number, height: number, background: string) =>
  sharp({ create: { width, height, channels: 3, background } }).jpeg().toBuffer();
const logo = () => sharp({ create: { width: 300, height: 90, channels: 3, background: "#111111" } }).png().toBuffer();

test("2 itens: PDF de uma página A4 com o que o cliente lê", async () => {
  const bytes = await renderQuotePdf(DOCUMENT, NOTHING);
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("latin1"), "%PDF-");

  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  const { width, height } = pdf.getPage(0).getSize();
  assert.deepEqual([Math.round(width), Math.round(height)], [595, 842]);

  const text = pdfText(bytes);
  for (const expected of [
    "Orçamento #261006-ABCD",
    "Emissão: 06/10/2026",
    "Validade: 12/10/2026",
    "Vera Vendedora",
    "Academia Força Total Ltda",
    "48.240.052/0001-61",
    "São Luís/MA",
    "LD-B001",
    "Supino reto",
    "Estofado preto.",
    "Leg press 45°",
    "DESCONTO",
    "Desconto (5,0%)",
    "Total da nota",
    "R$ 21.470",
    "Entrega: Maranhão",
    "Prazo de fabricação: 90 dias corridos, contados do pagamento da entrada",
    "Observações: Entrega no térreo.",
    "Valores válidos até 12/10/2026.",
    "Página 1 de 1",
  ]) {
    assert.ok(text.includes(expected), `falta "${expected}" no PDF`);
  }
  // Sem logo, o nome da empresa vai no lugar dela.
  assert.ok(text.split("\n").includes("Ludus Equipamentos"));
  // Nada do que a equipe não mostra ao cliente.
  assert.doesNotMatch(text, /custo|lucro|comiss|DIFAL|faixa/i);
});

test("sem cliente e sem desconto: 'Cliente: a informar', sem a coluna nem a linha do desconto", async () => {
  const bytes = await renderQuotePdf(
    {
      ...DOCUMENT,
      customer: null,
      delivery: null,
      production: null,
      notes: null,
      hasDiscount: false,
      items: DOCUMENT.items.map((entry) => ({ ...entry, unitDiscount: null })),
      totals: DOCUMENT.totals.filter((row) => !row.label.startsWith("Desconto")),
    },
    NOTHING,
  );
  const text = pdfText(bytes);
  assert.ok(text.includes("Cliente: a informar"));
  assert.doesNotMatch(text, /desconto|Entrega:|Prazo de fabricação|Observações/i);
});

test("60 itens: várias páginas, numeradas de 1 a N, com o cabeçalho da tabela em cada uma", async () => {
  const items = Array.from({ length: 60 }, (_, index) => item(index + 1));
  const bytes = await renderQuotePdf({ ...DOCUMENT, items, units: 60 }, NOTHING);
  const pages = (await PDFDocument.load(bytes)).getPageCount();
  assert.ok(pages > 1);

  const text = pdfText(bytes);
  for (let page = 1; page <= pages; page += 1) assert.ok(text.includes(`Página ${page} de ${pages}`), `página ${page}`);
  assert.ok(!text.includes(`Página ${pages + 1} de`));
  assert.equal(text.split("\n").filter((line) => line === "Valores válidos até 12/10/2026.").length, pages);
  // 60 linhas de 68 pt não cabem em menos páginas do que isto, e nenhuma se perde.
  for (const entry of items) assert.ok(text.split("\n").includes(entry.name), entry.name);
  const heads = text.split("\n").filter((line) => line === "EQUIPAMENTO").length;
  assert.ok(heads >= pages - 1 && heads <= pages, `${heads} cabeçalhos de tabela em ${pages} páginas`);
});

test("fotos e logo: 2 fotos + logo são 3 imagens; sem nenhuma, só o texto", async () => {
  const photos = new Map<number, Uint8Array>([
    [1, await jpeg(240, 160, "#336699")],
    [2, await jpeg(120, 240, "#993333")],
  ]);
  assert.equal(pdfImages(await renderQuotePdf(DOCUMENT, { logo: await logo(), photos })), 3);
  assert.equal(pdfImages(await renderQuotePdf(DOCUMENT, { logo: await logo(), photos: new Map() })), 1);
  assert.equal(pdfImages(await renderQuotePdf(DOCUMENT, { logo: null, photos })), 2);
  assert.equal(pdfImages(await renderQuotePdf(DOCUMENT, NOTHING)), 0);
  // Foto de equipamento que não está no orçamento não entra no arquivo.
  assert.equal(pdfImages(await renderQuotePdf(DOCUMENT, { logo: null, photos: new Map([[99, await jpeg(50, 50, "#000000")]]) })), 0);
});

test("caractere fora do WinAnsi vira '?', e quebra de linha vira espaço", async () => {
  const bytes = await renderQuotePdf(
    {
      ...DOCUMENT,
      items: [item(1, { name: "Esteira → nova 🏃 型", description: "Linha um\nlinha\tdois" })],
      notes: "Combinar\r\nentrega 🚚",
    },
    NOTHING,
  );
  const text = pdfText(bytes);
  assert.ok(text.includes("Esteira ? nova ? ?"));
  assert.ok(text.includes("Linha um linha dois"));
  assert.ok(text.includes("Observações: Combinar entrega ?"));
});

test("nome e descrição quebram na coluna; a descrição para em 3 linhas com reticências", async () => {
  const long = "Estrutura em aço carbono com pintura eletrostática e estofado de alta densidade. ".repeat(8);
  const bytes = await renderQuotePdf(
    { ...DOCUMENT, items: [item(1, { name: "Estação multifuncional com quatro torres de peso e polias ajustáveis", description: long })] },
    NOTHING,
  );
  const lines = pdfText(bytes).split("\n");
  const first = lines.findIndex((line) => line.startsWith("Estrutura em aço"));
  assert.ok(first > 0);
  // O nome ocupa mais de uma linha, entre o código e a descrição, sem perder palavra.
  const code = lines.indexOf("LD-B001");
  const name = lines.slice(code + 1, first);
  assert.ok(code > 0 && name.length > 1, `nome em ${name.length} linha(s)`);
  assert.equal(name.join(" "), "Estação multifuncional com quatro torres de peso e polias ajustáveis");
  assert.ok(lines[first + 2].endsWith("…"));
  assert.ok(!lines[first + 3].includes("aço") && !lines[first + 3].includes("estofado"));
});

test("nome sem fim: para em 4 linhas com reticências, e a linha do item cabe na página", async () => {
  const endless = "Estação multifuncional com torres de peso e polias ajustáveis ".repeat(120).trim();
  const bytes = await renderQuotePdf(
    { ...DOCUMENT, items: [item(1, { name: endless, description: "Estofado preto." }), item(2, { name: "X".repeat(4000) })] },
    NOTHING,
  );
  assert.equal((await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount(), 1);
  const pieces = pdfPieces(bytes);
  const lines = pieces.map((piece) => piece.text);

  // Entre o código e a descrição, só as 4 linhas do nome; a última diz que algo ficou de fora.
  const name = lines.slice(lines.indexOf("LD-B001") + 1, lines.indexOf("Estofado preto."));
  assert.equal(name.length, 4);
  assert.ok(name[0].startsWith("Estação multifuncional") && name[3].endsWith("…"));
  assert.ok(name.slice(0, 3).every((line) => !line.includes("…")));
  // Uma palavra só, mais larga que a coluna, também para em 4 linhas.
  const word = lines.filter((line) => /^X+…?$/.test(line));
  assert.equal(word.length, 4);
  assert.ok(word[3].endsWith("…"));

  // Nada sai pelo rodapé nem pelas margens.
  for (const piece of pieces) assert.ok(piece.x >= 36 && piece.y >= 36 && piece.y <= 841.89 - 36, `"${piece.text.slice(0, 30)}" fora da margem`);
  // O texto do nome acaba antes da primeira coluna de número.
  const font = await (await PDFDocument.create()).embedFont(StandardFonts.HelveticaBold);
  const firstNumber = Math.min(...pieces.filter((piece) => piece.text === "1").map((piece) => piece.x));
  for (const line of [...name, ...word]) {
    const piece = pieces.find((candidate) => candidate.text === line);
    assert.ok(piece && piece.x + font.widthOfTextAtSize(line, 9) < firstNumber, `"${line.slice(0, 30)}" encosta nos valores`);
  }
});

test("valores grandes: cada coluna tem a largura do seu maior valor, e nada sai da página nem encosta no vizinho", async () => {
  const big = item(1, {
    quantity: 1250,
    unitPrice: "R$ 1.234.567,89",
    unitDiscount: "R$ 61.728,39",
    unitIpi: "R$ 152.469,14",
    unitWithIpi: "R$ 1.325.308,64",
    totalWithIpi: "R$ 1.656.635.800",
  });
  const bytes = await renderQuotePdf({ ...DOCUMENT, items: [big, item(2)] }, NOTHING);
  const pieces = pdfPieces(bytes);
  const font = await (await PDFDocument.create()).embedFont(StandardFonts.HelveticaBold);

  // A linha de valores do primeiro item: tudo o que está na mesma altura de "1250".
  const baseline = pieces.find((piece) => piece.text === "1250")?.y;
  assert.ok(baseline);
  const row = pieces.filter((piece) => piece.y === baseline).sort((a, b) => a.x - b.x);
  assert.deepEqual(
    row.map((piece) => piece.text),
    ["1250", big.unitPrice, big.unitDiscount, big.unitIpi, big.unitWithIpi, big.totalWithIpi],
  );
  // O negrito é a fonte mais larga: se cabe com ela, cabe.
  const ends = row.map((piece) => piece.x + font.widthOfTextAtSize(piece.text, 8));
  for (let index = 1; index < row.length; index += 1) {
    assert.ok(row[index].x - ends[index - 1] >= 4, `"${row[index].text}" encosta em "${row[index - 1].text}"`);
  }
  assert.ok(ends[ends.length - 1] <= 595.28 - 36, "o total passa da margem direita");
  // E o nome do equipamento acaba antes da primeira coluna de número.
  const name = pieces.find((piece) => piece.text === "Equipamento 1");
  assert.ok(name && name.x + font.widthOfTextAtSize(name.text, 9) < row[0].x);
  // Nada é desenhado fora das margens de 36 pt.
  for (const piece of pieces) assert.ok(piece.x >= 36 && piece.y >= 36 && piece.y <= 841.89 - 36, `"${piece.text}" fora da margem`);
});

test("metadados do arquivo, e a mesma entrada dá os mesmos bytes", async () => {
  const assets = { logo: await logo(), photos: new Map<number, Uint8Array>([[1, await jpeg(200, 200, "#226622")]]) };
  const [first, second] = [await renderQuotePdf(DOCUMENT, assets), await renderQuotePdf(DOCUMENT, assets)];
  assert.ok(Buffer.from(first).equals(Buffer.from(second)));

  const pdf = await PDFDocument.load(first, { updateMetadata: false });
  assert.equal(pdf.getTitle(), "Orçamento #261006-ABCD");
  assert.equal(pdf.getAuthor(), "Ludus Equipamentos");
  assert.equal(pdf.getCreator(), "ERP");
  assert.equal(pdf.getCreationDate()?.toISOString(), "2026-10-06T12:00:00.000Z");
  assert.equal(pdf.getModificationDate()?.toISOString(), "2026-10-06T12:00:00.000Z");
});

test("o desenho não conhece banco, sessão, ambiente nem relógio", () => {
  const code = readFileSync(new URL("../src/lib/quote/pdf.ts", import.meta.url), "utf8");
  assert.doesNotMatch(code, /@\/lib\/(db|auth)|next\/|process\.env|new Date\(\)|Date\.now|node:fs|readFile/);
});

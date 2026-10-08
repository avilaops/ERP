import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Customer } from "@/lib/db/customers";
import type { Order } from "@/lib/db/orders";
import type { PublishedTable } from "@/lib/db/price-table";
import { showMoney } from "@/lib/format";
import { dueDates, saleOf } from "@/lib/order-quote";
import { quoteSale } from "@/lib/pricing/order";
import { QuoteError, quoteDocument } from "@/lib/quote/document";

const TABLE = {
  version: 3,
  ipi: 0.13,
  proposalValidityDays: 7,
  items: [
    { productId: 1, code: "LD-B010", name: "Leg press 45°", table: 21432.1, tableWithIpi: 24218.27 },
    { productId: 2, code: "LD-B002", name: "Supino reto", table: 9876.54, tableWithIpi: 11160.49 },
    { productId: 3, code: null, name: "Fora do pedido", table: 100, tableWithIpi: 113 },
  ],
} as PublishedTable;

const COMPANY: Customer = {
  id: 7,
  kind: "PJ",
  document: "48240052000161",
  name: "Academia Força Total Ltda",
  tradeName: "Força Total",
  contactName: "Marina",
  stateRegistration: "ISENTO",
  rg: null,
  phone: "98991234567",
  email: "compras@forcatotal.example",
  cep: "65000000",
  street: "Rua Grande",
  streetNumber: "100",
  complement: null,
  district: "Centro",
  city: "São Luís",
  uf: "MA",
} as Customer;

const ORDER = {
  number: "261006-ABCD",
  sellerName: "Vera Vendedora",
  sellerEmail: "vera@teste.local",
  customer: COMPANY,
  discount: 0.05,
  deliveryUf: "MA",
  productionDays: 90,
  notes: "Entrega no térreo.",
  downPaymentDate: null,
  closedAt: null,
  updatedAt: new Date("2026-10-05T15:00:00Z"),
  // In the order the database gives them: by product id, not by code.
  items: [
    { productId: 1, quantity: 2 },
    { productId: 2, quantity: 3 },
  ],
} as Order;

const TODAY = "2026-10-06";
const PRODUCTS = new Map([
  [1, { description: "Carga máxima de 400 kg." }],
  [2, { description: null }],
]);

const build = (order: Order = ORDER) =>
  quoteDocument({
    company: "Ludus Equipamentos",
    order,
    table: TABLE,
    sale: saleOf(order, TABLE),
    dates: dueDates(order, TABLE, TODAY),
    products: PRODUCTS,
    today: TODAY,
  });

test("2 itens com 5% de desconto e IPI de 13%: linhas e totais são os de quoteSale, formatados", () => {
  const document = build();
  const sale = quoteSale(
    {
      items: [
        { quantity: 2, tableUnitPrice: 21432.1 },
        { quantity: 3, tableUnitPrice: 9876.54 },
      ],
      discount: 0.05,
    },
    { ipi: 0.13 },
  );

  // Na ordem da tela: pelo código (LD-B002 antes de LD-B010), não pelo id.
  assert.deepEqual(document.items.map((item) => [item.productId, item.code, item.name, item.quantity]), [
    [2, "LD-B002", "Supino reto", 3],
    [1, "LD-B010", "Leg press 45°", 2],
  ]);
  const [bench, press] = document.items;
  for (const [item, line] of [
    [press, sale.lines[0]],
    [bench, sale.lines[1]],
  ] as const) {
    assert.deepEqual(
      [item.unitPrice, item.unitDiscount, item.unitIpi, item.unitWithIpi, item.totalWithIpi],
      [line.unitPrice, line.unitDiscount, line.unitIpi, line.unitWithIpi, line.totalWithIpi].map(showMoney),
    );
  }
  assert.equal(press.description, "Carga máxima de 400 kg.");
  assert.equal(bench.description, null);

  assert.equal(document.hasDiscount, true);
  assert.deepEqual(document.totals, [
    { label: "Total de tabela", value: showMoney(sale.tableTotal), strong: false },
    { label: "Desconto (5,0%)", value: `– ${showMoney(sale.tableTotal - sale.netSale)}`, strong: false },
    { label: "Valor sem IPI", value: showMoney(sale.netSale), strong: false },
    { label: "IPI (13%)", value: showMoney(sale.ipi), strong: false },
    { label: "Total da nota", value: showMoney(sale.invoiceTotal), strong: true },
  ]);
  assert.equal(document.units, 5);
});

test("cabeçalho, datas, entrega e prazo saem do pedido e do dia informado", () => {
  const document = build();
  assert.equal(document.title, "Orçamento #261006-ABCD");
  assert.equal(document.company, "Ludus Equipamentos");
  assert.equal(document.issuedOn, "06/10/2026");
  // Validade: 7 dias depois da última alteração do pedido (05/10, em São Paulo).
  assert.equal(document.validUntil, "12/10/2026");
  assert.equal(document.delivery, "Maranhão");
  assert.equal(document.production, "90 dias corridos, contados do pagamento da entrada");
  assert.equal(document.notes, "Entrega no térreo.");

  const bare = build({ ...ORDER, deliveryUf: null, productionDays: null, notes: "  " });
  assert.deepEqual([bare.delivery, bare.production, bare.notes], [null, null, null]);
});

test("sem desconto: some a linha do desconto e a coluna dos itens", () => {
  const document = build({ ...ORDER, discount: 0 });
  assert.equal(document.hasDiscount, false);
  assert.deepEqual(document.totals.map((row) => row.label), ["Total de tabela", "Valor sem IPI", "IPI (13%)", "Total da nota"]);
  assert.deepEqual(document.items.map((item) => item.unitDiscount), [null, null]);
});

test("cliente: null sem cliente; PJ com CNPJ formatado e Cidade/UF", () => {
  assert.equal(build({ ...ORDER, customer: null }).customer, null);
  assert.deepEqual(build().customer, {
    name: "Academia Força Total Ltda",
    tradeName: "Força Total",
    document: "48.240.052/0001-61",
    contactName: "Marina",
    phone: "(98) 99123-4567",
    email: "compras@forcatotal.example",
    cityUf: "São Luís/MA",
  });
  assert.equal(build({ ...ORDER, customer: { ...COMPANY, city: null } }).customer?.cityUf, "MA");
  assert.equal(build({ ...ORDER, customer: { ...COMPANY, city: null, uf: null, phone: null } }).customer?.cityUf, null);
});

test("o vendedor é o do pedido, não quem gera o arquivo", () => {
  // Quem gera não entra na função: só o pedido diz quem é o vendedor.
  assert.deepEqual(build().seller, { name: "Vera Vendedora", email: "vera@teste.local" });
});

test("pedido sem item dá QuoteError; item fora da tabela da versão é erro, não linha vazia", () => {
  const empty = { ...ORDER, items: [] };
  assert.throws(
    () =>
      quoteDocument({
        company: "Ludus Equipamentos",
        order: empty,
        table: TABLE,
        sale: { lines: [], tableTotal: 0, discount: 0, netSale: 0, ipi: 0, invoiceTotal: 0 },
        dates: dueDates(empty, TABLE, TODAY),
        products: PRODUCTS,
        today: TODAY,
      }),
    (error: unknown) => error instanceof QuoteError && error.message === "Inclua ao menos um equipamento para gerar o orçamento.",
  );

  const sale = saleOf(ORDER, TABLE);
  const missing = { ...TABLE, items: TABLE.items.filter((item) => item.productId !== 2) };
  assert.throws(
    () =>
      quoteDocument({
        company: "Ludus Equipamentos",
        order: ORDER,
        table: missing,
        sale,
        dates: dueDates(ORDER, TABLE, TODAY),
        products: PRODUCTS,
        today: TODAY,
      }),
    /Equipamento 2 não está na tabela v3/,
  );
});

test("o orçamento não carrega custo, lucro, comissão, DIFAL nem faixa do desconto", () => {
  const keys = [...JSON.stringify(build()).matchAll(/"([^"]+)":/g)].map(([, key]) => key);
  assert.ok(keys.length > 20);
  for (const key of keys) assert.doesNotMatch(key, /cost|profit|commission|difal|band/i, key);

  // E o arquivo não conhece nenhuma das leituras e contas de custo.
  const code = readFileSync(new URL("../src/lib/quote/document.ts", import.meta.url), "utf8");
  assert.doesNotMatch(code, /loadPublishedSnapshot|directorOf|engineOrder|quoteOrder|realCost|advisoryCost|next\/|process\.env|new Date|Date\.now/);
});

test("empresa sem IPI: o orçamento não traz linha de IPI nem de valor sem IPI", () => {
  const table = { ...TABLE, ipi: 0 };
  const document = quoteDocument({
    company: "Ludus Equipamentos",
    order: ORDER,
    table,
    sale: saleOf(ORDER, table),
    dates: dueDates(ORDER, table, TODAY),
    products: PRODUCTS,
    today: TODAY,
  });
  assert.equal(document.hasIpi, false);
  assert.ok(document.totals.every((total) => !total.label.includes("IPI")));
  assert.equal(document.totals.at(-1)?.label, "Total da nota");
});

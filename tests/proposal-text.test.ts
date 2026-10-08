import assert from "node:assert/strict";
import { test } from "node:test";
import { proposalText } from "@/lib/quote/text";

const BASE = {
  company: "Ludus Equipamentos",
  number: "261006-WE9N",
  customer: { name: "GABRIEL KOSHI", document: null },
  delivery: "São Paulo",
  items: [
    { quantity: 4, name: "Banco Regulável de 0 a 90°", code: "LD-WH011", unit: 1888.93 },
    { quantity: 1, name: "Sem código", code: null, unit: 100 },
  ],
  tableTotal: 12093.2,
  discount: 0.37,
  total: 7618.72,
  receipts: [
    { label: "Entrada", dueDate: "2026-10-08", method: "PIX", amount: 4647.42 },
    { label: "1/1", dueDate: "2026-11-07", method: null, amount: 2971.3 },
  ],
  validUntil: "2026-10-13",
  production: "60 dias",
  notes: "Entrega no térreo",
};

test("proposta em texto: itens com o preço já com desconto, total em negrito, pagamento, validade e prazo", () => {
  assert.equal(
    proposalText(BASE),
    [
      "*Proposta Ludus Equipamentos #261006-WE9N*",
      "Cliente: GABRIEL KOSHI",
      "Entrega: São Paulo",
      "",
      "4x Banco Regulável de 0 a 90° (LD-WH011) — R$ 1.888,93 un.",
      "1x Sem código — R$ 100 un.",
      "",
      "Valor de tabela: R$ 12.093,20",
      "Desconto especial (37,0%): − R$ 4.474,48",
      "*Total: R$ 7.618,72*",
      "",
      "*Pagamento*",
      "Entrada: R$ 4.647,42 via PIX — 08/10/2026",
      "1/1: R$ 2.971,30 — 07/11/2026",
      "",
      "Validade: 13/10/2026",
      "Prazo de fabricação: 60 dias",
      "Obs.: Entrega no térreo",
    ].join("\n"),
  );
});

test("proposta em texto: sem cliente, sem desconto e sem pagamento, as linhas somem; nada de custo ou margem", () => {
  const text = proposalText({ ...BASE, customer: null, discount: 0, receipts: [], production: null, notes: null });
  assert.doesNotMatch(text, /Cliente|Desconto|Pagamento|Prazo|Obs\./);
  assert.doesNotMatch(proposalText(BASE), /custo|margem|lucro|alçada/i);
});

test("proposta em texto: gerente comercial e local de emissão no fim, só quando a empresa cadastrou", () => {
  assert.doesNotMatch(proposalText(BASE), /Gerente comercial|Local de emissão/);
  const lines = proposalText({ ...BASE, manager: "DANILO RODRIGUES", place: "Votuporanga/SP" }).split("\n");
  assert.deepEqual(lines.slice(-3), ["", "Gerente comercial: DANILO RODRIGUES", "Local de emissão: Votuporanga/SP"]);
  assert.deepEqual(proposalText({ ...BASE, manager: null, place: "Votuporanga/SP" }).split("\n").slice(-2), ["", "Local de emissão: Votuporanga/SP"]);
});

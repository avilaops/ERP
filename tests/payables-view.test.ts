import assert from "node:assert/strict";
import { test } from "node:test";
import type { CommissionDue, Payable } from "@/lib/db/payables";
import { parsePayableForm, parsePaymentForm, readSupplierForm } from "@/lib/payable-form";
import { inPayableTab, parsePayableTab, payablesCsv, payablesSummary } from "@/lib/payables-view";

const bill = (over: Partial<Payable>): Payable => ({
  id: 1, description: "Aluguel", supplierId: null, supplierName: null, category: "Aluguel e condomínio", amount: 1000, dueDate: "2026-10-10",
  method: null, status: "aberta", paidOn: null, paidAmount: null, ...over,
});
const commission = (amount: number, dueDate: string): CommissionDue => ({ sellerEmail: "ana@x", sellerName: "Ana", month: "2026-09", dueDate, amount });

test("contas a pagar: a pagar, vencidas, os próximos sete dias e o pago no mês, com as comissões devidas", () => {
  const bills = [
    bill({ amount: 1000, dueDate: "2026-10-05" }),
    bill({ amount: 250.5, dueDate: "2026-10-06" }),
    bill({ amount: 300, dueDate: "2026-10-20" }),
    bill({ status: "paga", paidOn: "2026-10-02", paidAmount: 510.25 }),
    bill({ status: "paga", paidOn: "2026-09-30", paidAmount: 999 }),
  ];
  const summary = payablesSummary(bills, [commission(530.97, "2026-10-05"), commission(-40, "2026-10-05")], { today: "2026-10-06", inSevenDays: "2026-10-13", month: "2026-10" });
  assert.deepEqual(summary, {
    open: { total: 2081.47, count: 4 },
    overdue: { total: 1530.97, count: 2 },
    nextDays: { total: 250.5, count: 1 },
    paidInMonth: { total: 510.25, count: 1 },
  });
});

test("abas: a do endereço ou A pagar", () => {
  assert.equal(parsePayableTab("pagas"), "pagas");
  for (const value of [undefined, "", "x"]) assert.equal(parsePayableTab(value), "abertas");
  assert.deepEqual(["abertas", "pagas", "todas"].map((tab) => inPayableTab({ status: "paga" }, tab as "abertas")), [false, true, true]);
});

test("planilha: ponto e vírgula, vírgula decimal, aspas dobradas e nada de fórmula", () => {
  const csv = payablesCsv([
    bill({ description: 'Frete "expresso"; urgente', supplierName: "=HYPERLINK(1)", amount: 1234.5, method: "PIX" }),
    bill({ status: "paga", paidOn: "2026-10-02", paidAmount: 990 }),
  ]);
  assert.deepEqual(csv.split("\r\n"), [
    "Descrição;Fornecedor;Categoria;Valor;Vencimento;Forma;Situação;Pago em;Valor pago",
    '"Frete ""expresso""; urgente";\'=HYPERLINK(1);Aluguel e condomínio;1234,50;10/10/2026;PIX;A pagar;;',
    "Aluguel;;Aluguel e condomínio;1000,00;10/10/2026;;Paga;02/10/2026;990,00",
    "",
  ]);
});

const form = (values: Record<string, string>) => (key: string) => values[key] ?? null;
const KNOWN = { categories: ["Outros"], methods: ["PIX"], supplierIds: [7] };

test("formulário da conta: lê tudo, e cada problema vem com o rótulo do campo", () => {
  assert.deepEqual(parsePayableForm(form({ description: " Frete ", category: "Outros", amount: "1.234,56", dueDate: "2026-10-10", method: "PIX", supplierId: "7" }), KNOWN), {
    ok: true,
    value: { description: "Frete", supplierId: 7, category: "Outros", amount: 1234.56, dueDate: "2026-10-10", method: "PIX" },
  });
  assert.deepEqual(parsePayableForm(form({ description: "Frete", category: "Outros", amount: "10", dueDate: "2026-10-10" }), KNOWN), {
    ok: true,
    value: { description: "Frete", supplierId: null, category: "Outros", amount: 10, dueDate: "2026-10-10", method: null },
  });
  assert.deepEqual(parsePayableForm(form({ category: "Inventada", amount: "0", dueDate: "10/10/2026", method: "Cheque", supplierId: "8" }), KNOWN), {
    ok: false,
    errors: [
      '"Descrição": diga o que é a conta.',
      '"Categoria": escolha uma da lista.',
      '"Valor": informe um valor em reais maior que zero (ex.: 1.234,56).',
      '"Vencimento": informe uma data válida.',
      '"Forma": escolha uma da lista.',
      '"Fornecedor": escolha um da lista.',
    ],
  });
});

test("formulário do pagamento e do fornecedor", () => {
  assert.deepEqual(parsePaymentForm(form({ paidOn: "2026-10-06", paidAmount: "1.010,00", method: "PIX" }), ["PIX"]), {
    ok: true,
    value: { paidOn: "2026-10-06", paidAmount: 1010, method: "PIX" },
  });
  assert.equal(parsePaymentForm(form({ paidOn: "", paidAmount: "-1", method: "x" }), ["PIX"]).ok, false);

  const typed = readSupplierForm(form({ kind: "EX", name: " Fábrica ", country: "China", swift: "ABCDCNBJ", pix: " ", document: "91310000MA1" }));
  assert.deepEqual([typed.kind, typed.name, typed.country, typed.bank, typed.document, typed.active], ["EX", "Fábrica", "China", { swift: "ABCDCNBJ" }, "91310000MA1", true]);
  // Tipo desconhecido vira empresa; na ficha de quem já existe, caixa desmarcada é inativo.
  assert.equal(readSupplierForm(form({ kind: "XX", name: "A" })).kind, "PJ");
  assert.equal(readSupplierForm(form({ name: "A", hasActive: "1" })).active, false);
  assert.equal(readSupplierForm(form({ name: "A", hasActive: "1", active: "sim" })).active, true);
});

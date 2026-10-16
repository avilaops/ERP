import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseMonth, commissionsView, monthLabel } from "@/lib/commissions-view";
import type { CommissionEntry } from "@/lib/db/commissions";

const entry = (sellerEmail: string, amount: number, paid = false): CommissionEntry => ({
  sellerEmail, sellerName: sellerEmail.split("@")[0], orderNumber: "260930-BBMN", customerName: "Academia", refund: amount < 0,
  happenedOn: "2026-10-02", base: amount * 50, rate: 0.02, amount, paymentDue: "2026-11-05",
  paidAt: paid ? new Date("2026-11-05T12:00:00Z") : null, paidBy: paid ? "financeiro@teste.local" : null,
});

test("comissões por vendedor: total do mês, o que falta pagar e o saldo que veio de antes", () => {
  const view = commissionsView(
    [entry("ana@x", 100.1), entry("ana@x", 200.2), entry("bia@x", 300, true), entry("caio@x", 50), entry("caio@x", -80), entry("dani@x", 500)],
    new Map([["dani@x", -120.5], ["caio@x", 10]]),
  );
  assert.deepEqual(
    view.map(({ sellerEmail, total, open, carried, payable, status, entries }) => [sellerEmail, total, open, carried, payable, status, entries.length]),
    [
      ["ana@x", 300.3, 300.3, 0, 300.3, "em-aberto", 2],
      ["bia@x", 300, 0, 0, 0, "paga", 1],
      // Estorno maior que a comissão do mês: nada a pagar, e nunca valor negativo.
      ["caio@x", -30, -30, 10, 0, "sem-saldo", 2],
      // O estorno de um mês já pago desconta do pagamento seguinte.
      ["dani@x", 500, 500, -120.5, 379.5, "em-aberto", 1],
    ],
  );
  assert.deepEqual(commissionsView([], new Map([["ana@x", -5]])), []);
});

test("mês: rótulo em português e escolha só entre os meses que existem", () => {
  assert.equal(monthLabel("2026-10"), "outubro de 2026");
  assert.equal(monthLabel("2027-03"), "março de 2027");
  assert.equal(chooseMonth("2026-09", ["2026-10", "2026-09"], "2026-11"), "2026-09");
  assert.equal(chooseMonth("2026-11", ["2026-10"], "2026-11"), "2026-11");
  for (const asked of [undefined, "", "2020-01", "x"]) assert.equal(chooseMonth(asked, ["2026-10"], "2026-11"), "2026-11");
});

test("base líquida do mês inclui estorno de comissão paga e nova baixa sem duplicar o recebido", () => {
  const original = entry("ana@x", 53.1, true);
  const remainder = entry("ana@x", 106.19, true);
  const refund = { ...entry("ana@x", -53.1), happenedOn: "2026-11-02" };
  const net = commissionsView([original, remainder, refund], new Map())[0];
  assert.equal(net.received, 5309.5);
  assert.equal(net.open, -53.1);
  assert.equal(net.payable, 0);
  const restored = commissionsView([original, remainder, refund, entry("ana@x", 53.1)], new Map())[0];
  assert.equal(restored.received, 7964.5);
  assert.equal(restored.total, 159.29);
  // Uma reversão em mês posterior reduz a base do mês da reversão, não o mês do recebimento.
  assert.equal(commissionsView([refund], new Map())[0].received, -2655);
});

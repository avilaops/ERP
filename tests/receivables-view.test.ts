import assert from "node:assert/strict";
import { test } from "node:test";
import type { Receivable } from "@/lib/db/receivables";
import { isOverdue, receivablesSummary } from "@/lib/receivables-view";

const item = (dueDate: string | null, amount: number): Receivable => ({
  id: 1, orderNumber: "260930-BBMN", customerName: "Academia", sellerName: "Ana", label: "1/2", dueDate, amount, open: amount, method: null,
});

test("recebimentos: a receber, atrasado e o que vence em sete dias", () => {
  const items = [item("2026-10-05", 100.1), item("2026-10-06", 200.2), item("2026-10-13", 300.3), item("2026-10-14", 400), item(null, 50)];
  assert.deepEqual(receivablesSummary(items, "2026-10-06", "2026-10-13"), {
    open: { total: 1050.6, count: 5 },
    overdue: { total: 100.1, count: 1 },
    nextDays: { total: 500.5, count: 2 },
  });
  // Vence hoje não é atraso; sem data nunca atrasa.
  assert.equal(isOverdue(item("2026-10-06", 1), "2026-10-06"), false);
  assert.equal(isOverdue(item(null, 1), "2026-10-06"), false);
  assert.deepEqual(receivablesSummary([], "2026-10-06", "2026-10-13").open, { total: 0, count: 0 });
  // Com recebimento parcial, conta só o que falta entrar.
  assert.deepEqual(receivablesSummary([{ ...item("2026-10-20", 1000), open: 250 }], "2026-10-06", "2026-10-13").open, { total: 250, count: 1 });
});

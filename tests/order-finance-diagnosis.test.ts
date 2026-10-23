import { diagnoseOrderFinance } from "@/lib/db/order-finance-diagnosis";
import type { Queryable } from "@/lib/db/pool";
import type { QueryResult, QueryResultRow } from "pg";

function mockDb(rows: QueryResultRow[], queries?: string[]): Queryable {
  return { query: async <Row extends QueryResultRow = QueryResultRow>(sql: string): Promise<QueryResult<Row>> => {
    queries?.push(sql);
    return { rows: rows as Row[], command: "SELECT", rowCount: rows.length, oid: 0, fields: [] };
  } };
}
import assert from "node:assert/strict";
import { test } from "node:test";

test("diagnosis reports no order without modifying data", async () => {
  const queries: string[] = [];
  const db = mockDb([], queries);
  assert.equal(await diagnoseOrderFinance("261008-RUZL", db), null);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /WHERE o.number=\$1/);
});

test("diagnosis blocks financial and fiscal dependencies", async () => {
  const row = { number: "261008-RUZL", status: "fechado", receivables: 1, receipts: 1, commissions: 1, refund_requests: 0, refunds: 0, payables: 0, invoices: 1, fiscal_jobs: 0, signed_contracts: 0, production_orders: 0 };
  const db = mockDb([row]);
  const result = await diagnoseOrderFinance("261008-RUZL", db);
  assert.equal(result?.allowed, false);
  assert.equal(result?.counts.commissions, 1);
  assert.ok(result?.reasons.some(reason => reason.includes("fiscal")));
});

test("diagnosis permits only unbound negotiation orders", async () => {
  const row = { number: "261016-HXKP", status: "em_negociacao", receivables: 0, receipts: 0, commissions: 0, refund_requests: 0, refunds: 0, payables: 0, invoices: 0, fiscal_jobs: 0, signed_contracts: 0, production_orders: 0 };
  const db = mockDb([row]);
  const result = await diagnoseOrderFinance("261016-HXKP", db);
  assert.equal(result?.allowed, true);
  assert.deepEqual(result?.reasons, []);
});

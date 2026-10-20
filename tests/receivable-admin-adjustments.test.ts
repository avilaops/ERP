import assert from "node:assert/strict";
import { test } from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { Queryable } from "@/lib/db/pool";
import { adjustOpenReceivable, ReceivableError } from "@/lib/db/receivables";

function dbFor(rows: QueryResultRow[], calls: { sql: string; args?: unknown[] }[]): Queryable {
  return {
    query: async <Row extends QueryResultRow = QueryResultRow>(sql: string, args?: unknown[]): Promise<QueryResult<Row>> => {
      calls.push({ sql, args });
      return { rows: rows as Row[], command: "SELECT", rowCount: rows.length, oid: 0, fields: [] };
    },
  };
}

test("administrative correction writes audit atomically and scopes to eligible receivables", async () => {
  const calls: { sql: string; args?: unknown[] }[] = [];
  await adjustOpenReceivable(4, { action: "editar", dueDate: "2026-11-05", method: "PIX", reason: "Correção de vencimento" }, "diretor@empresa.com", dbFor([{ id: 7 }], calls));
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO receivable_adjustments/);
  assert.match(calls[0].sql, /NOT EXISTS \(SELECT 1 FROM receipts/);
  assert.match(calls[0].sql, /FOR UPDATE OF r, o/);
});

test("refuses adjustment when financial or fiscal obligations block it", async () => {
  const calls: { sql: string; args?: unknown[] }[] = [];
  await assert.rejects(() => adjustOpenReceivable(4, { action: "cancelar", dueDate: null, method: null, reason: "Teste sem efeito real" }, "diretor@empresa.com", dbFor([], calls)), ReceivableError);
});

test("rejects missing justification without database access", async () => {
  const calls: { sql: string; args?: unknown[] }[] = [];
  await assert.rejects(() => adjustOpenReceivable(4, { action: "cancelar", dueDate: null, method: null, reason: "teste" }, "diretor@empresa.com", dbFor([], calls)), /pelo menos 10/);
  assert.equal(calls.length, 0);
});

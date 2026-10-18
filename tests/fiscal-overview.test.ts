import assert from "node:assert/strict";
import { test } from "node:test";
import { listFiscalOverview } from "@/lib/db/fiscal-overview";
import type { Queryable } from "@/lib/db/pool";

test("painel fiscal mapeia pedidos, notas e inutilizações sem buscar conteúdo sigiloso", async () => {
  const statements: string[] = [];
  const answers = [
    [{ order_id: 8, order_number: "261017-ABCD", customer_name: "Cliente", closed_at: new Date("2026-10-17T12:00:00Z"), invoice_id: null, invoice_status: null, invoice_number: null, environment: null, job_id: null, job_kind: null, job_status: null, job_attempts: null, job_error: null, job_run_after: null }],
    [{ id: 3, order_number: "261016-WXYZ", customer_name: "Outra", environment: "homologacao", series: 9, number: 44, access_key: "1".repeat(44), status: "autorizada", protocol: "135", status_code: "100", status_reason: "Autorizado", issued_at: new Date("2026-10-16T12:00:00Z"), mail_status: "enviado", mail_recipient: "cliente@example.com", mail_sent_at: new Date("2026-10-16T12:05:00Z") }],
    [{ id: 5, environment: "producao", series: 1, first_number: 20, last_number: 22, status: "revisao_manual", attempts: 1, last_error: "Conferir na SEFAZ", run_after: new Date("2026-10-17T12:10:00Z"), created_at: new Date("2026-10-17T12:00:00Z") }],
    [{ id: 2, environment: "producao", series: 1, first_number: 10, last_number: 12, reason: "Numeração não utilizada.", protocol: "321", created_at: new Date("2026-10-15T12:00:00Z"), created_by: "diretoria@example.com" }],
  ];
  const conn: Queryable = {
    query: (async (sql: string) => {
      statements.push(sql);
      return { rows: answers.shift() ?? [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };
    }) as Queryable["query"],
  };

  const result = await listFiscalOverview({ sellerEmail: "fiscal@example.com", environment: "producao" }, conn);

  assert.equal(result.orders[0].stage, "emitir");
  assert.equal(result.invoices[0].mail?.status, "enviado");
  assert.equal(result.voidJobs[0].status, "revisao_manual");
  assert.equal(result.voids[0].first, 10);
  assert.equal(statements.length, 4);
  assert.match(statements[0], /o\.seller_email = \$1/);
  assert.match(statements[0], /environment = \$2/);
  assert.match(statements[0], /invoice_id IS NULL OR EXISTS/);
  assert.match(statements[0], /job_invoice\.environment = \$2/);
  assert.match(statements[0], /fj\.status = 'revisao_manual' AND NOT EXISTS/);
  assert.match(statements[0], /replacement\.kind = fj\.kind/);
  assert.match(statements[0], /replacement\.id > fj\.id/);
  assert.match(statements[0], /replacement\.invoice_id IS NOT DISTINCT FROM fj\.invoice_id/);
  assert.match(statements[1], /o\.seller_email = \$1/);
  for (const sql of statements) assert.doesNotMatch(sql, /signed_xml|authorized_xml|certificate|passphrase/i);
});

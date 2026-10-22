import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createCustomer } from "@/lib/db/customers";
import { cancelManualCommission, createManualCommission, listCommissions, updateManualCommission } from "@/lib/db/commissions";
import { cancelClosedOrder } from "@/lib/db/order-cancellation";
import { closeOrder, createOrder, getOrder, linkOrderCustomer, saveOrderTerms, savePayment } from "@/lib/db/orders";
import type { OrderPayment, OrderScope, OrderTerms } from "@/lib/db/orders";
import { loadParams } from "@/lib/db/params";
import { listCommissionsDue } from "@/lib/db/payables";
import type { Queryable } from "@/lib/db/pool";
import { latestVersion, loadPublishedTable, publishPriceTable } from "@/lib/db/price-table";
import { createProduct, listProducts } from "@/lib/db/products";
import { sendToProduction } from "@/lib/db/production";
import { createManualReceivable, recordReceipt } from "@/lib/db/receivables";
import { shipOrder } from "@/lib/db/stock";
import { saleOf } from "@/lib/order-quote";
import { draftPriceTable } from "@/lib/price-table";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const ALL: OrderScope = { sellerEmail: null };
const SELLER = { email: "vendedor@teste.local", name: "Vendedor teste" };
const DIRECTOR = "diretoria@teste.local";
const TODAY = "2026-10-22";
const REASON = "Cancelamento administrativo do pedido fictício de teste";
const TERMS: OrderTerms = { discount: 0, deliveryUf: "SP", taxpayer: false, productionDays: 30, freight: 0, notes: null };
let db: TestDb;
let productId = 0;
let customerId = 0;

before(async () => {
  if (skip) return;
  db = await openTestDb("financeadmin");
  await db.pool.query("UPDATE company_settings SET proposal_details = $1::jsonb", [JSON.stringify({ warranty: "12 meses contra defeitos de fabricação (teste fictício).", installation: "Não inclusa (teste fictício).", freightMode: "FOB" })]);
  productId = (await createProduct({ name: "Equipamento fictício", code: "FX-A001", advisoryCost: 1000 }, DIRECTOR, db.pool)).id;
  const draft = draftPriceTable(await loadParams(db.pool), await listProducts({ active: true }, db.pool));
  await publishPriceTable(draft, ((await latestVersion(db.pool))?.version ?? 0) + 1, DIRECTOR, db.pool);
  customerId = (await createCustomer({
    kind: "PJ", document: "11222333000181", name: "Cliente fictício", tradeName: null, contactName: "Contato fictício",
    stateRegistration: "ISENTO", rg: null, phone: "17999999999", email: "ficticio@example.test", cep: "15000000",
    street: "Rua Exemplo", streetNumber: "10", complement: null, district: "Centro", city: "São José do Rio Preto", uf: "SP",
  }, SELLER.email, db.pool)).id;
});

after(async () => {
  if (!skip) await db.close();
});

async function closedOrder(number: string): Promise<{ id: number; receivableId: number }> {
  await createOrder({ seller: SELLER, version: 1, productId, quantity: 1 }, () => number, db.pool);
  await linkOrderCustomer(number, customerId, SELLER.email, ALL, db.pool);
  await saveOrderTerms(number, TERMS, SELLER.email, ALL, db.pool);
  const order = await getOrder(number, ALL, db.pool);
  const table = await loadPublishedTable(1, db.pool);
  assert.ok(order && table);
  const payment: OrderPayment = {
    downPayment: saleOf(order, table).invoiceTotal,
    downPaymentMethod: "PIX",
    downPaymentDate: TODAY,
    balanceMethod: null,
    balanceOnDelivery: false,
    installmentCount: null,
    firstInstallmentDays: null,
    installmentIntervalDays: null,
    paymentNotes: null,
  };
  await savePayment(number, payment, SELLER.email, ALL, db.pool);
  const closed = await closeOrder(number, SELLER.email, ALL, db.pool);
  assert.deepEqual(closed, { status: "fechado", reasons: [], missing: [] });
  const row = await db.pool.query("SELECT o.id, r.id AS receivable_id FROM orders o JOIN receivables r ON r.order_id = o.id WHERE o.number = $1 ORDER BY r.id LIMIT 1", [number]);
  return { id: Number(row.rows[0].id), receivableId: Number(row.rows[0].receivable_id) };
}

async function counts(orderId: number) {
  const row = await db.pool.query(
    `SELECT o.status,
            (SELECT count(*)::int FROM receivables r WHERE r.order_id = o.id AND r.status <> 'cancelada') AS open_receivables,
            (SELECT count(*)::int FROM refunds f WHERE f.order_id = o.id) AS refunds,
            (SELECT count(*)::int FROM receivable_adjustments a JOIN receivables r ON r.id = a.receivable_id WHERE r.order_id = o.id AND a.action = 'incluir') AS manual_receivables,
            (SELECT count(*)::int FROM commission_adjustments a WHERE a.order_id = o.id) AS commission_adjustments,
            (SELECT count(*)::int FROM order_cancellations c WHERE c.order_id = o.id) AS cancellations,
            (SELECT count(*)::int FROM payables p WHERE p.order_id = o.id AND p.status = 'aberta') AS open_payables,
            (SELECT status FROM fiscal_jobs j WHERE j.order_id = o.id AND j.kind = 'emitir_nfe' ORDER BY j.id DESC LIMIT 1) AS fiscal_status
       FROM orders o WHERE o.id = $1`,
    [orderId],
  );
  return row.rows[0];
}

test("lançamento manual de cobrança grava auditoria e não registra dinheiro", { skip }, async () => {
  const order = await closedOrder("261022-M001");
  const before = Number((await db.pool.query("SELECT count(*) FROM receivables WHERE order_id = $1", [order.id])).rows[0].count);
  const id = await createManualReceivable("261022-m001", { amount: 150.5, dueDate: "2026-11-20", method: "PIX", reason: "Cobrança adicional fictícia de teste" }, DIRECTOR, db.pool);
  const row = await db.pool.query("SELECT r.amount::float AS amount, r.status, a.action FROM receivables r JOIN receivable_adjustments a ON a.receivable_id = r.id WHERE r.id = $1", [id]);
  assert.equal(row.rows[0].amount, 150.5);
  assert.equal(row.rows[0].status, "aberta");
  assert.equal(row.rows[0].action, "incluir");
  assert.equal(Number((await db.pool.query("SELECT count(*) FROM receipts WHERE receivable_id = $1", [id])).rows[0].count), 0);
  assert.equal(Number((await db.pool.query("SELECT count(*) FROM receivables WHERE order_id = $1", [order.id])).rows[0].count), before + 1);
});

test("lançamento manual desfaz a cobrança quando a auditoria falha no meio", { skip }, async () => {
  const order = await closedOrder("261022-M002");
  const before = await counts(order.id);
  const client = await db.pool.connect();
  const wrapped: Queryable = {
    query: async (sql, args) => {
      if (sql.includes("auditar-recebivel-manual")) throw new Error("falha injetada na auditoria");
      return client.query(sql, args);
    },
  };
  try {
    await assert.rejects(() => createManualReceivable("261022-M002", { amount: 80, dueDate: "2026-11-20", method: "PIX", reason: "Cobrança que não pode permanecer" }, DIRECTOR, wrapped), /falha injetada na auditoria/);
  } finally {
    client.release();
  }
  assert.deepEqual(await counts(order.id), before);
});

test("comissão manual: inclui, corrige, cancela e não paga lançamento cancelado", { skip }, async () => {
  await closedOrder("261022-C001");
  const id = await createManualCommission({ orderNumber: "261022-C001", amount: 40, direction: "credito", month: "2026-10", reason: "Ajuste comercial fictício de teste" }, DIRECTOR, db.pool);
  await updateManualCommission(id, { amount: 25, direction: "credito", reason: "Valor revisto no teste fictício" }, DIRECTOR, db.pool);
  const open = await listCommissions("2026-10", SELLER.email, db.pool);
  assert.equal(open.find((entry) => entry.id === id)?.amount, 25);
  assert.equal(open.find((entry) => entry.id === id)?.origin, "manual");
  assert.equal((await listCommissionsDue(db.pool)).some((entry) => entry.sellerEmail === SELLER.email && entry.month === "2026-10" && entry.amount >= 25), true);
  await assert.rejects(() => updateManualCommission(999999, { amount: 10, direction: "credito", reason: "Não é uma comissão manual" }, DIRECTOR, db.pool), /estorno/);
  await cancelManualCommission(id, "Lançamento manual cancelado no teste", DIRECTOR, db.pool);
  const after = await listCommissions("2026-10", SELLER.email, db.pool);
  assert.equal(after.find((entry) => entry.id === id)?.cancelled, true);
  assert.equal((await listCommissionsDue(db.pool)).some((entry) => entry.sellerEmail === SELLER.email && entry.month === "2026-10" && entry.amount === 25), false);
});

test("comissão manual some inteira quando a gravação da linha falha", { skip }, async () => {
  const order = await closedOrder("261022-C002");
  const client = await db.pool.connect();
  const wrapped: Queryable = {
    query: async (sql, args) => {
      if (sql.includes("gravar-comissao-manual")) throw new Error("falha injetada na comissão");
      return client.query(sql, args);
    },
  };
  try {
    await assert.rejects(() => createManualCommission({ orderNumber: "261022-C002", amount: 15, direction: "debito", month: "2026-10", reason: "Débito que não pode permanecer" }, DIRECTOR, wrapped), /falha injetada na comissão/);
  } finally {
    client.release();
  }
  assert.equal((await counts(order.id)).commission_adjustments, 0);
  assert.equal(Number((await db.pool.query("SELECT count(*) FROM commissions m JOIN commission_adjustments a ON a.id = m.adjustment_id WHERE a.order_id = $1", [order.id])).rows[0].count), 0);
});

test("cancelamento de pedido fechado cobre financeiro, fiscal e produção na mesma transação", { skip }, async () => {
  const order = await closedOrder("261022-X001");
  await recordReceipt(order.receivableId, { receivedOn: TODAY, method: "PIX", note: null }, "financeiro@teste.local", TODAY, db.pool);
  await db.pool.query("INSERT INTO payables (description, order_id, category, amount, due_date, updated_by) VALUES ('Conta fictícia em aberto', $1, 'Operação', 12.50, '2026-11-01', $2)", [order.id, DIRECTOR]);
  await db.pool.query("INSERT INTO payables (description, order_id, category, amount, due_date, status, paid_on, paid_amount, updated_by) VALUES ('Conta fictícia já paga', $1, 'Operação', 8, '2026-10-01', 'paga', '2026-10-02', 8, $2)", [order.id, DIRECTOR]);
  await db.pool.query(
    "INSERT INTO fiscal_jobs (kind, order_id, requested_by, environment, series, invoice_number, preparation_hash) VALUES ('emitir_nfe', $1, $2, 'homologacao', 1, 1, $3)",
    [order.id, DIRECTOR, "a".repeat(64)],
  );
  await db.pool.query(
    `INSERT INTO fiscal_invoices (order_id, environment, series, number, access_key, status, signed_xml, authorized_xml, protocol, issued_at, created_by)
     VALUES ($1, 'homologacao', 1, 9001, $2, 'autorizada', '<NFe/>', '<nfeProc/>', '135000000000000', now(), $3)`,
    [order.id, "1".repeat(44), DIRECTOR],
  );
  await sendToProduction("261022-X001", DIRECTOR, db.pool);
  await shipOrder("261022-X001", DIRECTOR, db.pool);
  await db.pool.query(
    `INSERT INTO order_contracts (order_id, sequence, title, body, pdf, pdf_sha256, token_hash, expires_at, recipient_name, recipient_email, created_by)
     VALUES ($1, 1, 'Contrato fictício', 'Texto fictício do contrato de teste, sem cliente real.', $2, $3, $4, '2099-01-01', 'Contato fictício', 'ficticio@example.test', $5)`,
    [order.id, Buffer.alloc(120, 1), "a".repeat(64), "b".repeat(64), DIRECTOR],
  );

  const result = await cancelClosedOrder("261022-X001", ALL, REASON, { email: DIRECTOR, role: "DIRETORIA" }, TODAY, db.pool);
  assert.equal(result.refundsConfirmed, 1);
  assert.equal(result.receivablesCancelled > 0, true);
  assert.equal(result.payablesCancelled, 1);
  assert.equal(result.payablesKept, 1);
  assert.equal(result.productionCancelled > 0, true);
  assert.equal(result.fiscalCancellationQueued, true);
  assert.equal(result.stockReversed > 0, true);
  assert.equal(result.contractsWithdrawn, 1);

  const state = await db.pool.query(
    `SELECT o.status,
            (SELECT count(*)::int FROM receivables r WHERE r.order_id = o.id AND r.status <> 'cancelada') AS live_receivables,
            (SELECT count(*)::int FROM commissions m JOIN receipts p ON p.id = m.receipt_id JOIN receivables r ON r.id = p.receivable_id WHERE r.order_id = o.id AND m.cancelled_at IS NULL AND m.paid_at IS NULL) AS live_commissions,
            (SELECT status FROM payables WHERE order_id = o.id AND description = 'Conta fictícia em aberto') AS open_bill,
            (SELECT status FROM payables WHERE order_id = o.id AND description = 'Conta fictícia já paga') AS paid_bill,
            (SELECT status FROM fiscal_jobs WHERE order_id = o.id AND kind = 'emitir_nfe') AS emit_job,
            (SELECT count(*)::int FROM fiscal_jobs WHERE order_id = o.id AND kind = 'cancelamento_nfe' AND status = 'pendente') AS cancel_jobs,
            (SELECT status FROM fiscal_invoices WHERE order_id = o.id) AS invoice_status,
            (SELECT count(*)::int FROM production_orders WHERE order_id = o.id AND cancelled_at IS NULL) AS live_production,
            (SELECT COALESCE(sum(quantity), 0)::int FROM stock_moves WHERE order_id = o.id) AS stock,
            (SELECT status FROM order_contracts WHERE order_id = o.id) AS contract_status,
            (SELECT count(*)::int FROM order_cancellations WHERE order_id = o.id) AS audits
       FROM orders o WHERE o.id = $1`,
    [order.id],
  );
  assert.deepEqual(state.rows[0], {
    status: "cancelado",
    live_receivables: 0,
    live_commissions: 0,
    open_bill: "cancelada",
    paid_bill: "paga",
    emit_job: "revisao_manual",
    cancel_jobs: 1,
    invoice_status: "autorizada",
    live_production: 0,
    stock: 0,
    contract_status: "cancelado",
    audits: 1,
  });
  await assert.rejects(() => cancelClosedOrder("261022-X001", ALL, REASON, { email: DIRECTOR, role: "DIRETORIA" }, TODAY, db.pool), /não está fechado/);
});

test("cancelamento em processamento fiscal não altera o pedido", { skip }, async () => {
  const order = await closedOrder("261022-X002");
  await db.pool.query("INSERT INTO fiscal_jobs (kind, order_id, requested_by, status) VALUES ('emitir_nfe', $1, $2, 'processando')", [order.id, DIRECTOR]);
  await assert.rejects(() => cancelClosedOrder("261022-X002", ALL, REASON, { email: DIRECTOR, role: "DIRETORIA" }, TODAY, db.pool), /processamento/);
  assert.equal((await counts(order.id)).status, "fechado");
  assert.equal((await counts(order.id)).cancellations, 0);
});

test("falha no meio do cancelamento desfaz estorno, cobrança, conta e fila fiscal", { skip }, async () => {
  const order = await closedOrder("261022-X003");
  await recordReceipt(order.receivableId, { receivedOn: TODAY, method: "PIX", note: null }, "financeiro@teste.local", TODAY, db.pool);
  await db.pool.query("INSERT INTO payables (description, order_id, category, amount, due_date, updated_by) VALUES ('Conta que deve permanecer', $1, 'Operação', 5, '2026-11-01', $2)", [order.id, DIRECTOR]);
  await db.pool.query(
    "INSERT INTO fiscal_jobs (kind, order_id, requested_by, environment, series, invoice_number, preparation_hash) VALUES ('emitir_nfe', $1, $2, 'homologacao', 1, 2, $3)",
    [order.id, DIRECTOR, "b".repeat(64)],
  );
  const before = await counts(order.id);
  const client = await db.pool.connect();
  const wrapped: Queryable = {
    query: async (sql, args) => {
      if (sql.includes("cancelar-producao")) throw new Error("falha injetada no meio");
      return client.query(sql, args);
    },
  };
  try {
    await assert.rejects(() => cancelClosedOrder("261022-X003", ALL, REASON, { email: DIRECTOR, role: "DIRETORIA" }, TODAY, wrapped), /falha injetada no meio/);
  } finally {
    client.release();
  }
  const after = await counts(order.id);
  assert.equal(after.status, "fechado");
  assert.equal(after.refunds, 0);
  assert.equal(after.open_payables, before.open_payables);
  assert.equal(after.cancellations, 0);
  assert.equal(after.fiscal_status, "pendente");
  const cancelledCommission = await db.pool.query(
    `SELECT count(*)::int AS total
       FROM commissions m
       JOIN receipts p ON p.id = m.receipt_id
       JOIN receivables r ON r.id = p.receivable_id
      WHERE r.order_id = $1 AND m.cancelled_at IS NOT NULL`,
    [order.id],
  );
  assert.equal(cancelledCommission.rows[0].total, 0);
});

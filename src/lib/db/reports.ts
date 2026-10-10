import type { MenuItemKey } from "@/lib/auth/permissions";
import type { Queryable } from "@/lib/db/pool";
import { roundCents } from "@/lib/pricing/money";

/**
 * The reports of the company: one summary and one list per area of the system,
 * read straight from what the screens already recorded. No report shows cost,
 * margin or profit, so none depends on the power of seeing costs.
 */
export type Column = { label: string; kind: "text" | "money" | "date" | "count" };
export type Cell = string | number | null;
export type Figure = { label: string; value: number; kind: "money" | "count" };
export type ReportData = { summary: Figure[]; columns: Column[]; rows: Cell[][] };

/** Whose records: everyone's, or only the ones of one person (a seller sees their own). */
export type ReportFilter = { from: string | null; to: string | null; person: string | null; today: string };

/** Which of the person's own limits narrows the report: the orders of the team, or the commissions of everyone. */
export type ReportScope = "team" | "commissions" | null;

export const REPORTS = [
  { key: "vendas", title: "Vendas", hint: "Pedidos fechados, por data de fechamento", item: "pedidos", period: "Fechado", scope: "team" },
  { key: "funil", title: "Funil", hint: "Oportunidades, por data de criação", item: "funil", period: "Criada", scope: "team" },
  { key: "clientes", title: "Clientes", hint: "Cadastro, com quanto cada um já comprou", item: "clientes", period: null, scope: "team" },
  { key: "notas", title: "Notas fiscais", hint: "Notas emitidas, por data de emissão", item: "parametros", period: "Emitida", scope: null },
  { key: "recebimentos", title: "Recebimentos", hint: "Entradas e parcelas, por vencimento", item: "recebimentos", period: "Vence", scope: null },
  { key: "contas-pagar", title: "Contas a pagar", hint: "Contas, por vencimento", item: "contas-pagar", period: "Vence", scope: null },
  { key: "comissoes", title: "Comissões", hint: "Lançamentos, por mês de competência", item: "comissoes", period: "Competência", scope: "commissions" },
  { key: "produtos", title: "Produtos e dados fiscais", hint: "Equipamentos com NCM, origem e unidade", item: "produtos", period: null, scope: null },
] as const satisfies readonly { key: string; title: string; hint: string; item: MenuItemKey; period: string | null; scope: ReportScope }[];

export type ReportKey = (typeof REPORTS)[number]["key"];
export type ReportInfo = (typeof REPORTS)[number];

export const reportOf = (key: string): ReportInfo | null => REPORTS.find((report) => report.key === key) ?? null;

const text = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
const amount = (value: unknown): number | null => (value === null || value === undefined ? null : roundCents(Number(value)));
const sum = (values: (number | null)[]) => roundCents(values.reduce<number>((total, value) => total + (value ?? 0), 0));
const money = (label: string, value: number): Figure => ({ label, value, kind: "money" });
const count = (label: string, value: number): Figure => ({ label, value, kind: "count" });

const DAY = "AT TIME ZONE 'America/Sao_Paulo'";

const SALES = `
  SELECT o.number, to_char(o.closed_at ${DAY}, 'YYYY-MM-DD') AS closed_on, c.name AS customer, o.seller_name, o.delivery_uf,
         (SELECT k.invoice_total FROM order_closings k WHERE k.order_id = o.id AND k.reopened_at IS NULL ORDER BY k.closed_at DESC LIMIT 1) AS total
    FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
   WHERE o.status = 'fechado'
     AND ($1::date IS NULL OR (o.closed_at ${DAY})::date >= $1) AND ($2::date IS NULL OR (o.closed_at ${DAY})::date <= $2)
     AND ($3::text IS NULL OR o.seller_email = $3)
   ORDER BY o.closed_at DESC, o.id DESC`;

async function sales(filter: ReportFilter, conn: Queryable): Promise<ReportData> {
  const { rows } = await conn.query(SALES, [filter.from, filter.to, filter.person]);
  const totals = rows.map((row) => amount(row.total));
  const total = sum(totals);
  return {
    summary: [count("Pedidos fechados", rows.length), money("Total vendido", total), money("Valor médio por pedido", rows.length ? roundCents(total / rows.length) : 0)],
    columns: [{ label: "Pedido", kind: "text" }, { label: "Fechado em", kind: "date" }, { label: "Cliente", kind: "text" }, { label: "Vendedor", kind: "text" }, { label: "Entrega", kind: "text" }, { label: "Total", kind: "money" }],
    rows: rows.map((row, index) => [text(row.number), text(row.closed_on), text(row.customer), text(row.seller_name), text(row.delivery_uf), totals[index]]),
  };
}

const FUNNEL = `
  SELECT o.title, COALESCE(c.name, o.company) AS company, s.name AS stage, s.kind, o.owner_name, o.source, o.estimated_value,
         to_char(o.created_at ${DAY}, 'YYYY-MM-DD') AS created_on
    FROM opportunities o JOIN pipeline_stages s ON s.id = o.stage_id LEFT JOIN customers c ON c.id = o.customer_id
   WHERE ($1::date IS NULL OR (o.created_at ${DAY})::date >= $1) AND ($2::date IS NULL OR (o.created_at ${DAY})::date <= $2)
     AND ($3::text IS NULL OR o.owner_email = $3)
   ORDER BY o.created_at DESC, o.id DESC`;

const STAGE_KINDS: Record<string, string> = { aberta: "Aberta", ganha: "Ganha", perdida: "Perdida" };

async function funnel(filter: ReportFilter, conn: Queryable): Promise<ReportData> {
  const { rows } = await conn.query(FUNNEL, [filter.from, filter.to, filter.person]);
  const of = (kind: string) => rows.filter((row) => row.kind === kind);
  return {
    summary: [
      count("Oportunidades", rows.length), count("Abertas", of("aberta").length), count("Ganhas", of("ganha").length), count("Perdidas", of("perdida").length),
      money("Valor estimado em aberto", sum(of("aberta").map((row) => amount(row.estimated_value)))),
    ],
    columns: [{ label: "Oportunidade", kind: "text" }, { label: "Empresa", kind: "text" }, { label: "Etapa", kind: "text" }, { label: "Situação", kind: "text" }, { label: "Dono", kind: "text" }, { label: "Origem", kind: "text" }, { label: "Valor estimado", kind: "money" }, { label: "Criada em", kind: "date" }],
    rows: rows.map((row) => [text(row.title), text(row.company), text(row.stage), STAGE_KINDS[String(row.kind)] ?? text(row.kind), text(row.owner_name), text(row.source), amount(row.estimated_value), text(row.created_on)]),
  };
}

/** The purchases counted are the closed orders the person may see: a seller's report does not tell the sales of the others. */
const CUSTOMERS = `
  SELECT c.name, c.kind, c.document, c.city, c.uf, c.phone, c.email, b.orders, b.total, b.last_on
    FROM customers c
    LEFT JOIN LATERAL (
      SELECT count(*) AS orders, to_char(max(o.closed_at ${DAY}), 'YYYY-MM-DD') AS last_on,
             sum((SELECT k.invoice_total FROM order_closings k WHERE k.order_id = o.id AND k.reopened_at IS NULL ORDER BY k.closed_at DESC LIMIT 1)) AS total
        FROM orders o WHERE o.customer_id = c.id AND o.status = 'fechado' AND ($1::text IS NULL OR o.seller_email = $1)
    ) b ON true
   ORDER BY lower(c.name), c.id`;

async function customers(filter: ReportFilter, conn: Queryable): Promise<ReportData> {
  const { rows } = await conn.query(CUSTOMERS, [filter.person]);
  const bought = rows.filter((row) => Number(row.orders) > 0);
  return {
    summary: [count("Clientes", rows.length), count("Com pedido fechado", bought.length), money("Total comprado", sum(bought.map((row) => amount(row.total))))],
    columns: [{ label: "Cliente", kind: "text" }, { label: "Documento", kind: "text" }, { label: "Cidade", kind: "text" }, { label: "UF", kind: "text" }, { label: "Telefone", kind: "text" }, { label: "E-mail", kind: "text" }, { label: "Pedidos fechados", kind: "count" }, { label: "Total comprado", kind: "money" }, { label: "Última compra", kind: "date" }],
    rows: rows.map((row) => [text(row.name), text(row.document), text(row.city), text(row.uf), text(row.phone), text(row.email), Number(row.orders), Number(row.orders) > 0 ? amount(row.total) : null, text(row.last_on)]),
  };
}

const INVOICES = `
  SELECT f.number, f.series, f.environment, f.status, o.number AS order_number, to_char(f.issued_at ${DAY}, 'YYYY-MM-DD') AS issued_on,
         substring(f.signed_xml from '<vNF>([0-9.]+)</vNF>')::numeric AS total, f.protocol
    FROM fiscal_invoices f JOIN orders o ON o.id = f.order_id
   WHERE ($1::date IS NULL OR (f.issued_at ${DAY})::date >= $1) AND ($2::date IS NULL OR (f.issued_at ${DAY})::date <= $2)
   ORDER BY f.issued_at DESC, f.id DESC`;

const INVOICE_STATUS: Record<string, string> = { assinada: "Aguardando resposta", autorizada: "Autorizada", rejeitada: "Rejeitada", denegada: "Denegada", cancelada: "Cancelada" };

async function invoices(filter: ReportFilter, conn: Queryable): Promise<ReportData> {
  const { rows } = await conn.query(INVOICES, [filter.from, filter.to]);
  // A test invoice has no fiscal value: it is listed, never added to the total.
  const real = rows.filter((row) => row.status === "autorizada" && row.environment === "producao");
  return {
    summary: [
      count("Notas autorizadas", real.length), money("Total autorizado", sum(real.map((row) => amount(row.total)))),
      count("Canceladas", rows.filter((row) => row.status === "cancelada" && row.environment === "producao").length),
      count("Rejeitadas ou sem resposta", rows.filter((row) => ["rejeitada", "denegada", "assinada"].includes(String(row.status))).length),
      count("De teste (homologação)", rows.filter((row) => row.environment !== "producao").length),
    ],
    columns: [{ label: "Nota", kind: "text" }, { label: "Série", kind: "text" }, { label: "Ambiente", kind: "text" }, { label: "Situação", kind: "text" }, { label: "Pedido", kind: "text" }, { label: "Emitida em", kind: "date" }, { label: "Valor", kind: "money" }, { label: "Protocolo", kind: "text" }],
    rows: rows.map((row) => [text(row.number), text(row.series), row.environment === "producao" ? "Produção" : "Homologação", INVOICE_STATUS[String(row.status)] ?? text(row.status), text(row.order_number), text(row.issued_on), amount(row.total), text(row.protocol)]),
  };
}

const RECEIVABLES = `
  SELECT o.number AS order_number, c.name AS customer, r.kind, r.number, to_char(r.due_date, 'YYYY-MM-DD') AS due_on, r.amount, r.status, r.due_date < $3::date AS late,
         COALESCE((SELECT sum(x.amount) FROM receipts x WHERE x.receivable_id = r.id), 0) - COALESCE((SELECT sum(y.amount) FROM refunds y WHERE y.receivable_id = r.id), 0) AS received
    FROM receivables r JOIN orders o ON o.id = r.order_id LEFT JOIN customers c ON c.id = o.customer_id
   WHERE ($1::date IS NULL OR r.due_date >= $1) AND ($2::date IS NULL OR r.due_date <= $2)
   ORDER BY r.due_date, o.number, r.number`;

async function receivables(filter: ReportFilter, conn: Queryable): Promise<ReportData> {
  const { rows } = await conn.query(RECEIVABLES, [filter.from, filter.to, filter.today]);
  const valid = rows.filter((row) => row.status !== "cancelada");
  const open = valid.filter((row) => row.status === "aberta");
  const left = (list: typeof rows) => sum(list.map((row) => roundCents(Number(row.amount) - Number(row.received))));
  const state = (row: (typeof rows)[number]) => (row.status === "recebida" ? "Recebida" : row.status === "cancelada" ? "Cancelada" : row.late ? "Vencida" : "A receber");
  return {
    summary: [
      money("Previsto", sum(valid.map((row) => amount(row.amount)))), money("Recebido", sum(valid.map((row) => amount(row.received)))),
      money("A receber", left(open)), money("Vencido", left(open.filter((row) => row.late === true))),
    ],
    columns: [{ label: "Pedido", kind: "text" }, { label: "Cliente", kind: "text" }, { label: "Parcela", kind: "text" }, { label: "Vence em", kind: "date" }, { label: "Valor", kind: "money" }, { label: "Recebido", kind: "money" }, { label: "Situação", kind: "text" }],
    rows: rows.map((row) => [text(row.order_number), text(row.customer), row.kind === "entrada" ? "Entrada" : `Parcela ${row.number}`, text(row.due_on), amount(row.amount), amount(row.received), state(row)]),
  };
}

const PAYABLES = `
  SELECT p.description, s.name AS supplier, p.category, to_char(p.due_date, 'YYYY-MM-DD') AS due_on, p.amount, p.status, p.due_date < $3::date AS late,
         to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on, p.paid_amount
    FROM payables p LEFT JOIN suppliers s ON s.id = p.supplier_id
   WHERE ($1::date IS NULL OR p.due_date >= $1) AND ($2::date IS NULL OR p.due_date <= $2)
   ORDER BY p.due_date, p.id`;

async function payables(filter: ReportFilter, conn: Queryable): Promise<ReportData> {
  const { rows } = await conn.query(PAYABLES, [filter.from, filter.to, filter.today]);
  const open = rows.filter((row) => row.status === "aberta");
  return {
    summary: [
      money("Total das contas", sum(rows.map((row) => amount(row.amount)))), money("Pago", sum(rows.map((row) => amount(row.paid_amount)))),
      money("A pagar", sum(open.map((row) => amount(row.amount)))), money("Vencido", sum(open.filter((row) => row.late === true).map((row) => amount(row.amount)))),
    ],
    columns: [{ label: "Conta", kind: "text" }, { label: "Fornecedor", kind: "text" }, { label: "Categoria", kind: "text" }, { label: "Vence em", kind: "date" }, { label: "Valor", kind: "money" }, { label: "Situação", kind: "text" }, { label: "Paga em", kind: "date" }, { label: "Valor pago", kind: "money" }],
    rows: rows.map((row) => [text(row.description), text(row.supplier), text(row.category), text(row.due_on), amount(row.amount), row.status === "paga" ? "Paga" : row.late ? "Vencida" : "A pagar", text(row.paid_on), amount(row.paid_amount)]),
  };
}

const COMMISSIONS = `
  SELECT COALESCE(u.name, (SELECT o.seller_name FROM orders o WHERE o.seller_email = c.seller_email ORDER BY o.id DESC LIMIT 1), c.seller_email) AS seller, to_char(c.competence, 'YYYY-MM-DD') AS competence, c.base_amount, c.rate, c.amount,
         to_char(c.payment_due, 'YYYY-MM-DD') AS due_on, to_char(c.paid_at ${DAY}, 'YYYY-MM-DD') AS paid_on
    FROM commissions c LEFT JOIN users u ON u.email = c.seller_email
   WHERE ($1::date IS NULL OR c.competence >= $1) AND ($2::date IS NULL OR c.competence <= $2)
     AND ($3::text IS NULL OR c.seller_email = $3)
   ORDER BY c.competence DESC, seller, c.id`;

async function commissions(filter: ReportFilter, conn: Queryable): Promise<ReportData> {
  const { rows } = await conn.query(COMMISSIONS, [filter.from, filter.to, filter.person]);
  return {
    summary: [
      money("Comissão do período", sum(rows.map((row) => amount(row.amount)))),
      money("Paga", sum(rows.filter((row) => row.paid_on !== null).map((row) => amount(row.amount)))),
      money("A pagar", sum(rows.filter((row) => row.paid_on === null).map((row) => amount(row.amount)))),
    ],
    columns: [{ label: "Vendedor", kind: "text" }, { label: "Competência", kind: "date" }, { label: "Base", kind: "money" }, { label: "Percentual", kind: "text" }, { label: "Comissão", kind: "money" }, { label: "Vence em", kind: "date" }, { label: "Paga em", kind: "date" }],
    rows: rows.map((row) => [text(row.seller), text(row.competence), amount(row.base_amount), `${(Number(row.rate) * 100).toFixed(2).replace(".", ",")}%`, amount(row.amount), text(row.due_on), text(row.paid_on)]),
  };
}

const PRODUCTS = `
  SELECT p.code, p.name, l.name AS line, p.ncm, p.origin, p.unit, p.active
    FROM products p JOIN product_lines l ON l.id = p.line_id
   ORDER BY l.name, p.code NULLS LAST, lower(p.name), p.id`;

const ncm = (value: unknown) => (typeof value === "string" && /^\d{8}$/.test(value) ? `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6)}` : text(value));

async function products(conn: Queryable): Promise<ReportData> {
  const { rows } = await conn.query(PRODUCTS);
  const active = rows.filter((row) => row.active === true);
  return {
    summary: [count("Equipamentos ativos", active.length), count("Ativos sem NCM", active.filter((row) => row.ncm === null).length), count("Ativos sem origem", active.filter((row) => row.origin === null).length), count("Inativos", rows.length - active.length)],
    columns: [{ label: "Código", kind: "text" }, { label: "Equipamento", kind: "text" }, { label: "Linha", kind: "text" }, { label: "NCM", kind: "text" }, { label: "Origem", kind: "text" }, { label: "Unidade", kind: "text" }, { label: "Situação", kind: "text" }],
    rows: rows.map((row) => [text(row.code), text(row.name), text(row.line), ncm(row.ncm), text(row.origin), text(row.unit), row.active === true ? "Ativo" : "Inativo"]),
  };
}

/** The summary and the list of one report, for the period and the person the filter says. */
export function runReport(key: ReportKey, filter: ReportFilter, conn: Queryable): Promise<ReportData> {
  switch (key) {
    case "vendas":
      return sales(filter, conn);
    case "funil":
      return funnel(filter, conn);
    case "clientes":
      return customers(filter, conn);
    case "notas":
      return invoices(filter, conn);
    case "recebimentos":
      return receivables(filter, conn);
    case "contas-pagar":
      return payables(filter, conn);
    case "comissoes":
      return commissions(filter, conn);
    case "produtos":
      return products(conn);
  }
}

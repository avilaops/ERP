import { PDFDocument } from "pdf-lib";
import type { Queryable } from "@/lib/db/pool";

export const MAX_BILL_BYTES = 2 * 1024 * 1024;
export class BillError extends Error {}

export type OrderBill = { id: number; label: string; dueDate: string | null; amount: number; open: number; status: string; method: string | null; billId: number | null };

/** The latest file belongs to a receivable of this order, in the session's tenant. */
export async function listOrderBills(orderId: number, conn: Queryable): Promise<OrderBill[]> {
  const { rows } = await conn.query(
    `SELECT r.id, r.kind, r.number, to_char(r.due_date, 'YYYY-MM-DD') AS due_date, r.amount, r.status, r.method,
            r.amount - (SELECT COALESCE(sum(p.amount), 0) FROM receipts p WHERE p.receivable_id = r.id
              AND NOT EXISTS (SELECT 1 FROM refund_requests q WHERE q.receipt_id = p.id AND q.status = 'confirmada')) AS open,
            CASE WHEN b.pdf IS NOT NULL THEN b.id END AS bill_id
       FROM receivables r LEFT JOIN LATERAL
         (SELECT id, pdf FROM receivable_bills WHERE receivable_id = r.id ORDER BY id DESC LIMIT 1) b ON true
      WHERE r.order_id = $1 AND r.status <> 'cancelada' ORDER BY r.number, r.id`, [orderId],
  );
  return rows.map((row) => ({ id: Number(row.id), label: row.kind === "entrada" ? "Entrada" : `Parcela ${row.number}`, dueDate: row.due_date === null ? null : String(row.due_date), amount: Number(row.amount), open: Number(row.open), status: String(row.status), method: row.method === null ? null : String(row.method), billId: row.bill_id === null ? null : Number(row.bill_id) }));
}

/** Parse the PDF as well as checking its header; encrypted or corrupt files are refused. */
export async function validateBillPdf(bytes: Uint8Array): Promise<void> {
  if (bytes.length === 0 || bytes.length > MAX_BILL_BYTES) throw new BillError("Envie um boleto em PDF de até 2 MB.");
  if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") throw new BillError("O arquivo precisa ser um PDF válido.");
  try {
    const pdf = await PDFDocument.load(bytes);
    if (pdf.getPageCount() === 0) throw new Error("sem páginas");
  } catch {
    throw new BillError("Não foi possível ler o PDF. Envie um arquivo válido e sem senha.");
  }
}

/** Append a replacement or a withdrawal (null), preserving every previous version. */
export async function saveOrderBill(orderId: number, receivableId: number, bytes: Uint8Array | null, who: string, conn: Queryable): Promise<void> {
  if (!who.trim()) throw new BillError("Falta identificar quem está vinculando o boleto.");
  if (bytes !== null) await validateBillPdf(bytes);
  const { rows } = await conn.query(
    `INSERT INTO receivable_bills (receivable_id, pdf, created_by)
     SELECT r.id, $3, $4 FROM receivables r JOIN orders o ON o.id = r.order_id
      WHERE r.id = $2 AND r.order_id = $1 AND r.status = 'aberta' AND o.status = 'fechado'
        AND NOT EXISTS (SELECT 1 FROM receipts p WHERE p.receivable_id = r.id
          AND NOT EXISTS (SELECT 1 FROM refund_requests q WHERE q.receipt_id = p.id AND q.status = 'confirmada'))
     RETURNING id`, [orderId, receivableId, bytes === null ? null : Buffer.from(bytes), who],
  );
  if (!rows[0]) throw new BillError("Só é possível vincular ou retirar boleto de parcela em aberto, sem recebimentos, de um pedido fechado.");
}

/** Only explicitly selected, current, unpaid bills can leave in an e-mail. */
export async function billAttachments(orderId: number, ids: number[], conn: Queryable): Promise<{ id: number; filename: string; contentType: string; content: Buffer }[]> {
  if (ids.length > 12 || new Set(ids).size !== ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new BillError("Selecione até 12 boletos válidos.");
  if (ids.length === 0) return [];
  const { rows } = await conn.query(
    `SELECT b.id, b.pdf, o.number AS order_number, r.number FROM receivable_bills b
       JOIN receivables r ON r.id = b.receivable_id JOIN orders o ON o.id = r.order_id
      WHERE b.id = ANY($2::integer[]) AND r.order_id = $1 AND o.status = 'fechado' AND r.status = 'aberta'
        AND b.pdf IS NOT NULL AND b.id = (SELECT max(v.id) FROM receivable_bills v WHERE v.receivable_id = r.id)
        AND NOT EXISTS (SELECT 1 FROM receipts p WHERE p.receivable_id = r.id
          AND NOT EXISTS (SELECT 1 FROM refund_requests q WHERE q.receipt_id = p.id AND q.status = 'confirmada'))
      ORDER BY r.number`, [orderId, ids],
  );
  if (rows.length !== ids.length) throw new BillError("Um boleto foi substituído, retirado ou a parcela já tem recebimento. Atualize o pedido e selecione novamente.");
  if (rows.reduce((sum, row) => sum + (row.pdf as Buffer).length, 0) > 8 * 1024 * 1024) throw new BillError("Os boletos somam mais de 8 MB. Envie menos arquivos por vez.");
  return rows.map((row) => ({ id: Number(row.id), filename: `Boleto-${row.order_number}-${row.number}.pdf`, contentType: "application/pdf", content: row.pdf as Buffer }));
}

import type { Queryable } from "@/lib/db/pool";
import { roundCents } from "@/lib/pricing/money";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class PurchaseError extends Error {}

export const PURCHASE_KINDS = [["importacao", "Importação"], ["nacional", "Compra no Brasil"]] as const;
export const PURCHASE_STATUS = { pedido: "Pedido feito", em_transito: "Em trânsito", recebida: "Recebida", cancelada: "Cancelada" } as const;
export const CURRENCIES = [["BRL", "Real"], ["USD", "Dólar"], ["EUR", "Euro"], ["CNY", "Yuan"]] as const;

export type PurchaseKind = (typeof PURCHASE_KINDS)[number][0];
export type PurchaseStatus = keyof typeof PURCHASE_STATUS;
export type Currency = (typeof CURRENCIES)[number][0];

export type PurchaseInput = {
  supplierId: number;
  kind: PurchaseKind;
  reference: string | null;
  /** Days as `AAAA-MM-DD`. */
  orderedOn: string;
  expectedOn: string | null;
  currency: Currency;
  /** How many reais one unit of the currency is worth. */
  exchangeRate: number;
  invoiceNumber: string | null;
  invoiceKey: string | null;
  notes: string | null;
};

export type PurchaseSummary = { id: number; supplier: string; kind: PurchaseKind; status: PurchaseStatus; reference: string | null; orderedOn: string; expectedOn: string | null; receivedOn: string | null; pieces: number; total: number };

export type PurchaseItem = { productId: number; code: string | null; name: string; quantity: number; unitPrice: number; /** In reais, at the rate of the purchase. */ goods: number; /** The item's share of the costs of the purchase, by value. */ share: number; /** What one piece costs put in the warehouse. */ landedUnit: number };
export type PurchaseCost = { id: number; label: string; amount: number };
export type Purchase = PurchaseInput & { id: number; supplier: string; status: PurchaseStatus; receivedOn: string | null; items: PurchaseItem[]; costs: PurchaseCost[]; goods: number; extra: number; total: number };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const blank = (value: string | null) => (value?.trim() ? value.trim() : null);
const day = (value: unknown) => (value === null ? null : String(value));

function checked(input: PurchaseInput, who: string) {
  if (who.trim() === "") throw new Error("Falta dizer quem está gravando a compra.");
  if (!Number.isSafeInteger(input.supplierId)) throw new PurchaseError("Escolha o fornecedor.");
  if (!PURCHASE_KINDS.some(([key]) => key === input.kind)) throw new PurchaseError("Escolha se é importação ou compra no Brasil.");
  if (!DAY.test(input.orderedOn)) throw new PurchaseError("Informe a data do pedido ao fornecedor.");
  if (input.expectedOn !== null && !DAY.test(input.expectedOn)) throw new PurchaseError("Previsão de chegada: data inválida.");
  if (!CURRENCIES.some(([key]) => key === input.currency)) throw new PurchaseError("Escolha a moeda da lista.");
  const rate = input.currency === "BRL" ? 1 : input.exchangeRate;
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1000) throw new PurchaseError("Câmbio: quantos reais vale uma unidade da moeda (ex.: 5,42).");
  const reference = blank(input.reference);
  if (reference !== null && reference.length > 60) throw new PurchaseError("Referência: até 60 letras.");
  const invoiceNumber = blank(input.invoiceNumber);
  if (invoiceNumber !== null && invoiceNumber.length > 20) throw new PurchaseError("Número da nota: até 20 letras.");
  const invoiceKey = blank(input.invoiceKey)?.replace(/[\s.]/g, "").toUpperCase() ?? null;
  if (invoiceKey !== null && !/^[0-9A-Z]{44}$/.test(invoiceKey)) throw new PurchaseError("Chave da nota: são 44 posições.");
  const notes = blank(input.notes);
  if (notes !== null && notes.length > 1000) throw new PurchaseError("Observações: até 1.000 letras.");
  return [input.supplierId, input.kind, reference, input.orderedOn, input.expectedOn, input.currency, rate, invoiceNumber, invoiceKey, notes, who] as const;
}

export async function createPurchase(input: PurchaseInput, who: string, conn: Queryable): Promise<{ id: number }> {
  const { rows } = await conn.query(
    `INSERT INTO purchases (supplier_id, kind, reference, ordered_on, expected_on, currency, exchange_rate, invoice_number, invoice_key, notes, updated_by)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11 WHERE EXISTS (SELECT 1 FROM suppliers WHERE id = $1)
     RETURNING id`,
    [...checked(input, who)],
  );
  if (!rows[0]) throw new PurchaseError("Fornecedor não encontrado. Recarregue a página.");
  return { id: Number(rows[0].id) };
}

export async function updatePurchase(id: number, input: PurchaseInput, who: string, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `UPDATE purchases SET supplier_id = $1, kind = $2, reference = $3, ordered_on = $4, expected_on = $5, currency = $6, exchange_rate = $7,
            invoice_number = $8, invoice_key = $9, notes = $10, updated_at = now(), updated_by = $11
      WHERE id = $12 AND EXISTS (SELECT 1 FROM suppliers WHERE id = $1) RETURNING id`,
    [...checked(input, who), id],
  );
  if (!rows[0]) throw new PurchaseError("Compra ou fornecedor não encontrado. Recarregue a página.");
}

const OPEN = "status IN ('pedido', 'em_transito')";
const ONLY_OPEN = "A compra já foi recebida ou cancelada: desfaça o recebimento para alterar os itens.";

/** Adds an equipment to the purchase, or changes quantity and price of one already in it. Only while it has not arrived. */
export async function savePurchaseItem(purchaseId: number, item: { productId: number; quantity: number; unitPrice: number }, who: string, conn: Queryable): Promise<void> {
  if (!Number.isSafeInteger(item.productId)) throw new PurchaseError("Escolha o equipamento.");
  if (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 100_000_000 || Math.round(item.quantity * 10_000) / 10_000 !== item.quantity) throw new PurchaseError("Quantidade: maior que zero, com até quatro casas decimais.");
  if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0 || item.unitPrice > 100_000_000) throw new PurchaseError("Preço: informe o valor de uma peça, na moeda da compra.");
  const { rows } = await conn.query(SAVE_ITEM, [purchaseId, item.productId, item.quantity, item.unitPrice, who]);
  if (!rows[0]) throw new PurchaseError(`Compra ou equipamento não encontrado. ${ONLY_OPEN}`);
}

const SAVE_ITEM = `
  WITH target AS (UPDATE purchases SET updated_at = now(), updated_by = $5 WHERE id = $1 AND ${OPEN} RETURNING id)
  INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_price)
  SELECT t.id, p.id, $3, $4 FROM target t JOIN products p ON p.id = $2
  ON CONFLICT (purchase_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity, unit_price = EXCLUDED.unit_price
  RETURNING product_id`;

const REMOVE_ITEM = `
  WITH target AS (UPDATE purchases SET updated_at = now(), updated_by = $3 WHERE id = $1 AND ${OPEN} RETURNING id)
  DELETE FROM purchase_items i USING target t WHERE i.purchase_id = t.id AND i.product_id = $2 RETURNING i.product_id`;

export async function removePurchaseItem(purchaseId: number, productId: number, who: string, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(REMOVE_ITEM, [purchaseId, productId, who]);
  if (!rows[0]) throw new PurchaseError(`Item não encontrado. ${ONLY_OPEN}`);
}

/** A cost of the purchase beyond the goods, in reais. It may be written at any time: the bill of the broker comes after the goods. */
export async function addPurchaseCost(purchaseId: number, label: string, amount: number, who: string, conn: Queryable): Promise<void> {
  const text = label.trim();
  if (text.length < 1 || text.length > 80) throw new PurchaseError("Diga o que é o custo (ex.: Frete internacional), em até 80 letras.");
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) throw new PurchaseError("Valor do custo: em reais, maior que zero.");
  const { rows } = await conn.query(
    "INSERT INTO purchase_costs (purchase_id, label, amount, created_by) SELECT id, $2, $3, $4 FROM purchases WHERE id = $1 AND status <> 'cancelada' RETURNING id",
    [purchaseId, text, roundCents(amount), who],
  );
  if (!rows[0]) throw new PurchaseError("Compra não encontrada ou cancelada.");
}

export async function removePurchaseCost(purchaseId: number, costId: number, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("DELETE FROM purchase_costs WHERE id = $2 AND purchase_id = $1 RETURNING id", [purchaseId, costId]);
  if (!rows[0]) throw new PurchaseError("Custo não encontrado. Recarregue a página.");
}

const MOVE = `UPDATE purchases SET status = $2, updated_at = now(), updated_by = $3 WHERE id = $1 AND ${OPEN} RETURNING id`;

/** `pedido` ↔ `em_transito`, or cancelling a purchase that has not arrived. */
export async function movePurchase(id: number, to: "pedido" | "em_transito" | "cancelada", who: string, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(MOVE, [id, to, who]);
  if (!rows[0]) throw new PurchaseError("Compra não encontrada, já recebida ou cancelada.");
}

const RECEIVE = `
  WITH target AS (UPDATE purchases SET status = 'recebida', received_on = $2, updated_at = now(), updated_by = $3
                   WHERE id = $1 AND ${OPEN} AND EXISTS (SELECT 1 FROM purchase_items WHERE purchase_id = $1) RETURNING id),
       written AS (INSERT INTO stock_moves (product_id, kind, quantity, purchase_id, created_by)
                   SELECT i.product_id, 'compra', i.quantity, i.purchase_id, $3 FROM purchase_items i JOIN target t ON t.id = i.purchase_id RETURNING id)
  SELECT count(*) AS items FROM written`;

/** The goods arrived: the purchase closes and every item enters the stock, in one statement. */
export async function receivePurchase(id: number, receivedOn: string, who: string, conn: Queryable): Promise<{ items: number }> {
  if (!DAY.test(receivedOn)) throw new PurchaseError("Informe a data em que a mercadoria chegou.");
  const { rows } = await conn.query(RECEIVE, [id, receivedOn, who]);
  const items = Number(rows[0].items);
  if (items === 0) throw new PurchaseError("Compra não encontrada, sem itens, já recebida ou cancelada.");
  return { items };
}

const UNRECEIVE = `
  WITH target AS (UPDATE purchases SET status = 'em_transito', received_on = NULL, updated_at = now(), updated_by = $2 WHERE id = $1 AND status = 'recebida' RETURNING id),
       balance AS (SELECT m.product_id, m.purchase_id, sum(m.quantity) AS entered FROM stock_moves m JOIN target t ON t.id = m.purchase_id GROUP BY m.product_id, m.purchase_id HAVING sum(m.quantity) <> 0),
       written AS (INSERT INTO stock_moves (product_id, kind, quantity, purchase_id, note, created_by)
                   SELECT product_id, 'estorno', -entered, purchase_id, 'Recebimento desfeito', $2 FROM balance RETURNING id)
  SELECT (SELECT count(*) FROM target) AS found`;

/** Undoes the receiving: the purchase goes back to "em trânsito" and what entered the stock leaves it. */
export async function unreceivePurchase(id: number, who: string, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(UNRECEIVE, [id, who]);
  if (Number(rows[0].found) === 0) throw new PurchaseError("Compra não encontrada ou não recebida.");
}

const DELETE = `
  WITH target AS (SELECT id FROM purchases WHERE id = $1 AND status <> 'recebida' AND NOT EXISTS (SELECT 1 FROM stock_moves WHERE purchase_id = $1) FOR UPDATE),
       items AS (DELETE FROM purchase_items i USING target t WHERE i.purchase_id = t.id),
       costs AS (DELETE FROM purchase_costs c USING target t WHERE c.purchase_id = t.id)
  DELETE FROM purchases b USING target t WHERE b.id = t.id RETURNING b.id`;

/** Removes a purchase that never entered the stock. One that did keeps its history: cancel or undo it instead. */
export async function deletePurchase(id: number, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(DELETE, [id]);
  if (!rows[0]) throw new PurchaseError("Só se remove compra que nunca entrou no estoque. Para as outras, desfaça o recebimento e cancele.");
}

const LIST = `
  SELECT b.id, COALESCE(s.trade_name, s.name) AS supplier, b.kind, b.status, b.reference, to_char(b.ordered_on, 'YYYY-MM-DD') AS ordered_on,
         to_char(b.expected_on, 'YYYY-MM-DD') AS expected_on, to_char(b.received_on, 'YYYY-MM-DD') AS received_on,
         COALESCE((SELECT sum(i.quantity) FROM purchase_items i WHERE i.purchase_id = b.id), 0) AS pieces,
         COALESCE((SELECT sum(i.quantity * i.unit_price) FROM purchase_items i WHERE i.purchase_id = b.id), 0) * b.exchange_rate
           + COALESCE((SELECT sum(c.amount) FROM purchase_costs c WHERE c.purchase_id = b.id), 0) AS total
    FROM purchases b JOIN suppliers s ON s.id = b.supplier_id
   ORDER BY (b.status IN ('pedido', 'em_transito')) DESC, b.ordered_on DESC, b.id DESC`;

export async function listPurchases(conn: Queryable): Promise<PurchaseSummary[]> {
  const { rows } = await conn.query(LIST);
  return rows.map((row) => ({
    id: Number(row.id), supplier: String(row.supplier), kind: row.kind as PurchaseKind, status: row.status as PurchaseStatus, reference: day(row.reference),
    orderedOn: String(row.ordered_on), expectedOn: day(row.expected_on), receivedOn: day(row.received_on), pieces: Number(row.pieces), total: roundCents(Number(row.total)),
  }));
}

/**
 * The share of the costs each item carries, by its value in the goods, with the
 * cents that rounding leaves put on the largest item, so the shares add up to
 * the costs exactly.
 */
export function landedCosts(items: { quantity: number; goods: number }[], extra: number): { share: number; landedUnit: number }[] {
  const goods = items.reduce((sum, item) => sum + item.goods, 0);
  const shares = items.map((item) => (goods > 0 ? roundCents((extra * item.goods) / goods) : 0));
  const left = roundCents(extra - shares.reduce((sum, share) => sum + share, 0));
  if (left !== 0 && goods > 0) {
    const largest = items.reduce((best, item, index) => (item.goods > items[best].goods ? index : best), 0);
    shares[largest] = roundCents(shares[largest] + left);
  }
  return items.map((item, index) => ({ share: shares[index], landedUnit: roundCents((item.goods + shares[index]) / item.quantity) }));
}

export async function getPurchase(id: number, conn: Queryable): Promise<Purchase | null> {
  if (!Number.isSafeInteger(id)) return null;
  const { rows } = await conn.query(
    `SELECT b.id, b.supplier_id, COALESCE(s.trade_name, s.name) AS supplier, b.kind, b.status, b.reference, to_char(b.ordered_on, 'YYYY-MM-DD') AS ordered_on,
            to_char(b.expected_on, 'YYYY-MM-DD') AS expected_on, to_char(b.received_on, 'YYYY-MM-DD') AS received_on, b.currency, b.exchange_rate,
            b.invoice_number, b.invoice_key, b.notes
       FROM purchases b JOIN suppliers s ON s.id = b.supplier_id WHERE b.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  const rate = Number(row.exchange_rate);
  const lines = await conn.query(
    "SELECT i.product_id, p.code, p.name, i.quantity, i.unit_price FROM purchase_items i JOIN products p ON p.id = i.product_id WHERE i.purchase_id = $1 ORDER BY p.code NULLS LAST, lower(p.name)",
    [id],
  );
  const extras = await conn.query("SELECT id, label, amount FROM purchase_costs WHERE purchase_id = $1 ORDER BY id", [id]);
  const costs = extras.rows.map((cost) => ({ id: Number(cost.id), label: String(cost.label), amount: Number(cost.amount) }));
  const extra = roundCents(costs.reduce((sum, cost) => sum + cost.amount, 0));
  const bare = lines.rows.map((line) => ({ productId: Number(line.product_id), code: day(line.code), name: String(line.name), quantity: Number(line.quantity), unitPrice: Number(line.unit_price), goods: roundCents(Number(line.quantity) * Number(line.unit_price) * rate) }));
  const landed = landedCosts(bare, extra);
  const goods = roundCents(bare.reduce((sum, item) => sum + item.goods, 0));
  return {
    id: Number(row.id), supplierId: Number(row.supplier_id), supplier: String(row.supplier), kind: row.kind as PurchaseKind, status: row.status as PurchaseStatus,
    reference: day(row.reference), orderedOn: String(row.ordered_on), expectedOn: day(row.expected_on), receivedOn: day(row.received_on),
    currency: row.currency as Currency, exchangeRate: rate, invoiceNumber: day(row.invoice_number), invoiceKey: day(row.invoice_key), notes: day(row.notes),
    items: bare.map((item, index) => ({ ...item, ...landed[index] })), costs, goods, extra, total: roundCents(goods + extra),
  };
}

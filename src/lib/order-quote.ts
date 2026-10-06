import type { Order } from "@/lib/db/orders";
import type { PublishedSnapshot, PublishedTable } from "@/lib/db/price-table";
import { isoDate } from "@/lib/format";
import { orderMaxDiscounts, quoteOrder, quoteSale } from "@/lib/pricing/order";
import type { OrderInput, OrderQuote, SaleQuote } from "@/lib/pricing/order";
import { completenessText, isComplete, missingFields } from "@/lib/customer";
import { commissionOn } from "@/lib/pricing/commission";
import { roundCents } from "@/lib/pricing/money";
import { addDays, installments } from "@/lib/pricing/payment";
import { realCost } from "@/lib/pricing/product";
import type { MaxDiscounts } from "@/lib/pricing/table";

/** What the functions here need from an order: no more than the database row and its items. */
type OrderData = Pick<
  Order,
  "items" | "discount" | "deliveryUf" | "taxpayer" | "freight" | "productionDays" | "downPaymentDate" | "updatedAt" | "closedAt"
>;

/**
 * The sale as the whole team sees it: each item at the table price of the
 * version of the order, in cents. Nothing here reads a cost.
 */
export function saleOf(order: Pick<Order, "items" | "discount">, table: PublishedTable): SaleQuote {
  const prices = new Map(table.items.map((item) => [item.productId, item.table]));
  const items = order.items.map(({ productId, quantity }) => {
    const tableUnitPrice = prices.get(productId);
    if (tableUnitPrice === undefined) throw new Error(`Equipamento ${productId} não está na tabela v${table.version}.`);
    return { quantity, tableUnitPrice };
  });
  return quoteSale({ items, discount: order.discount }, table);
}

/**
 * The order as the engine takes it, with the costs of its version: real cost in
 * full precision, never the rounded one. `null` while there is no delivery state,
 * because taxes depend on it.
 */
export function engineOrder(order: OrderData, snapshot: PublishedSnapshot): OrderInput | null {
  if (order.deliveryUf === null) return null;
  const costs = new Map(snapshot.items.map((item) => [item.productId, item]));
  const items = order.items.map(({ productId, quantity }) => {
    const item = costs.get(productId);
    if (!item) throw new Error(`Equipamento ${productId} não está na tabela v${snapshot.version}.`);
    return {
      quantity,
      tableUnitPrice: item.table,
      unitRealCost: realCost(item, snapshot.params),
      unitAdvisoryCost: item.advisoryCost,
    };
  });
  return {
    items,
    discount: order.discount,
    destination: { uf: order.deliveryUf, taxpayer: order.taxpayer },
    freight: order.freight,
  };
}

/** The "Só o diretor vê" board and the limits of the discount. */
export type DirectorBoard = { quote: OrderQuote; max: MaxDiscounts; targetNetProfit: number };

/** Only for who `seesCosts`: the caller reads the snapshot only for them. `null` without delivery state. */
export function directorOf(order: OrderData, snapshot: PublishedSnapshot): DirectorBoard | null {
  const input = engineOrder(order, snapshot);
  if (!input) return null;
  return {
    quote: quoteOrder(input, snapshot.params),
    max: orderMaxDiscounts(input, snapshot.params),
    targetNetProfit: snapshot.params.targetNetProfit,
  };
}

export type DueDates = {
  /** Until when the proposal holds: counted from the last change of the order. */
  proposalValidUntil: string;
  /** When production ends, or `null` without a production time. */
  completion: string | null;
};

/**
 * The dates of the order, as `AAAA-MM-DD`. Production counts from the payment of
 * the down payment; without that date, from the closing; without it, from `today`.
 */
export function dueDates(order: OrderData, table: PublishedTable, today: string): DueDates {
  const base = order.downPaymentDate ?? (order.closedAt ? isoDate(order.closedAt) : today);
  return {
    proposalValidUntil: addDays(isoDate(order.updatedAt), table.proposalValidityDays),
    completion: order.productionDays === null ? null : addDays(base, order.productionDays),
  };
}

/** One amount the order expects to receive: the down payment or one installment. */
export type ExpectedReceipt = {
  /** `Entrada`, `1/3`, `2/3`… */
  label: string;
  /** `AAAA-MM-DD`. For the down payment without a date, the day production counts from. */
  dueDate: string;
  method: string | null;
  amount: number;
  /** Commission the seller gets when this amount is received. A forecast, not an entry. */
  commission: number;
};

export type PaymentPlan = {
  downPayment: number;
  /** Down payment over the invoice total. */
  downPaymentRate: number;
  balance: number;
  /** What the policy of the version asks for, in reais. */
  policyDownPayment: number;
  /** Whether the down payment reaches the policy. Below it the order needs approval. */
  meetsPolicy: boolean;
  receipts: ExpectedReceipt[];
  /** Sum of the installments: equal to the balance when there are any. */
  installmentsTotal: number;
};

type PaymentData = Pick<
  Order,
  | "downPayment"
  | "downPaymentMethod"
  | "downPaymentDate"
  | "balanceMethod"
  | "installmentCount"
  | "firstInstallmentDays"
  | "installmentIntervalDays"
  | "closedAt"
>;

/**
 * The payment as agreed: down payment, balance, installments and the commission
 * each receipt will bring. Dates count from the day of the down payment; without
 * it, from the closing; without it, from `today`. Rates are the ones of the
 * version of the order.
 */
export function paymentOf(order: PaymentData, sale: SaleQuote, table: PublishedTable, today: string): PaymentPlan {
  const base = order.downPaymentDate ?? (order.closedAt ? isoDate(order.closedAt) : today);
  const downPayment = roundCents(order.downPayment);
  const balance = roundCents(Math.max(0, sale.invoiceTotal - downPayment));
  const commission = (amount: number) => roundCents(commissionOn(amount, table));
  const policyDownPayment = roundCents(table.minDownPayment * sale.invoiceTotal);

  const receipts: ExpectedReceipt[] = [];
  if (downPayment > 0) {
    receipts.push({ label: "Entrada", dueDate: base, method: order.downPaymentMethod, amount: downPayment, commission: commission(downPayment) });
  }
  const parts =
    balance > 0 && order.installmentCount
      ? installments({
          balance,
          count: order.installmentCount,
          firstInDays: order.firstInstallmentDays ?? 0,
          intervalDays: order.installmentIntervalDays ?? 0,
          from: base,
        })
      : [];
  for (const part of parts) {
    receipts.push({
      label: `${part.number}/${parts.length}`,
      dueDate: part.dueDate,
      method: order.balanceMethod,
      amount: part.amount,
      commission: commission(part.amount),
    });
  }

  return {
    downPayment,
    downPaymentRate: sale.invoiceTotal > 0 ? downPayment / sale.invoiceTotal : 0,
    balance,
    policyDownPayment,
    meetsPolicy: downPayment >= policyDownPayment,
    receipts,
    installmentsTotal: roundCents(parts.reduce((total, part) => total + part.amount, 0)),
  };
}

/** What is missing for the order to be closed, in the words of the screen. Empty when it can go on to the policy. */
export function closingProblems(
  order: Pick<Order, "customer" | "deliveryUf" | "productionDays" | "downPayment" | "downPaymentMethod" | "balanceMethod" | "installmentCount">,
  sale: SaleQuote,
): string[] {
  const problems: string[] = [];
  if (!order.customer) problems.push("Informe o cliente.");
  else if (!isComplete(order.customer)) {
    problems.push(`${completenessText(order.customer)} no cadastro do cliente: ${missingFields(order.customer).join(", ")}.`);
  }
  if (order.deliveryUf === null) problems.push("Informe o estado de entrega.");
  if (order.productionDays === null) problems.push("Informe o prazo de fabricação.");

  if (order.downPayment > sale.invoiceTotal) problems.push("A entrada é maior que o total da nota.");
  if (order.downPayment > 0 && !order.downPaymentMethod) problems.push("Informe a forma da entrada.");
  const balance = roundCents(sale.invoiceTotal - order.downPayment);
  if (balance > 0) {
    if (!order.installmentCount) problems.push("Informe em quantas parcelas o saldo será pago.");
    if (!order.balanceMethod) problems.push("Informe a forma de pagamento do saldo.");
  }
  return problems;
}

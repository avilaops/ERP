import type { Receivable } from "@/lib/db/receivables";
import { roundCents } from "@/lib/pricing/money";

export type ReceivablesSummary = {
  open: { total: number; count: number };
  /** Due before `today`. */
  overdue: { total: number; count: number };
  /** Due from `today` to seven days ahead. */
  nextDays: { total: number; count: number };
};

// What counts is what is still to come in, not the whole amount agreed.
const sum = (items: Receivable[]) => ({ total: roundCents(items.reduce((total, item) => total + item.open, 0)), count: items.length });

/** `AAAA-MM-DD` compares as text. A receivable without a date is never overdue. */
export const isOverdue = (item: Pick<Receivable, "dueDate">, today: string) => item.dueDate !== null && item.dueDate < today;

/** The cards of Recebimentos. `today` and `inSevenDays` are days in São Paulo, as `AAAA-MM-DD`. */
export function receivablesSummary(items: Receivable[], today: string, inSevenDays: string): ReceivablesSummary {
  return {
    open: sum(items),
    overdue: sum(items.filter((item) => isOverdue(item, today))),
    nextDays: sum(items.filter((item) => item.dueDate !== null && item.dueDate >= today && item.dueDate <= inSevenDays)),
  };
}

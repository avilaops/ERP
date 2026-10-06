import type { CommissionEntry } from "@/lib/db/commissions";
import { roundCents } from "@/lib/pricing/money";

/** The commissions of one seller in one month, with what is still to be paid. */
export type SellerCommissions = {
  sellerEmail: string;
  sellerName: string;
  entries: CommissionEntry[];
  /** Everything of the month, refunds included. */
  total: number;
  /** The part of the month not paid yet. */
  open: number;
  /** What was left open from earlier months: negative when a refund came after a payment. */
  carried: number;
  /** What "Marcar como paga" pays now: the open part plus what was carried. Never negative. */
  payable: number;
  status: "paga" | "em-aberto" | "sem-saldo";
};

const sum = (values: number[]) => roundCents(values.reduce((total, value) => total + value, 0));

/**
 * Groups the lines of a month by seller, in the order received. A seller who
 * only has a balance carried from earlier months has no group: it shows in the
 * month their next commission is born.
 */
export function commissionsView(entries: CommissionEntry[], carried: ReadonlyMap<string, number>): SellerCommissions[] {
  const groups = new Map<string, CommissionEntry[]>();
  for (const entry of entries) groups.set(entry.sellerEmail, [...(groups.get(entry.sellerEmail) ?? []), entry]);

  return [...groups.entries()].map(([sellerEmail, own]) => {
    const open = sum(own.filter((entry) => entry.paidAt === null).map((entry) => entry.amount));
    const before = roundCents(carried.get(sellerEmail) ?? 0);
    const hasOpen = own.some((entry) => entry.paidAt === null);
    const payable = Math.max(0, roundCents(open + before));
    return {
      sellerEmail,
      sellerName: own[0].sellerName,
      entries: own,
      total: sum(own.map((entry) => entry.amount)),
      open,
      carried: before,
      payable,
      status: !hasOpen ? "paga" : payable > 0 ? "em-aberto" : "sem-saldo",
    };
  });
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** `2026-10` → `outubro de 2026`. */
export function monthLabel(month: string): string {
  const [year, number] = month.split("-");
  return `${MONTHS[Number(number) - 1]} de ${year}`;
}

/** The month of the address when it is one of the known ones; otherwise the current one. */
export function chooseMonth(asked: string | undefined, known: string[], current: string): string {
  return asked !== undefined && (known.includes(asked) || asked === current) ? asked : current;
}

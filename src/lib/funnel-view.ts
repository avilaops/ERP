import type { Opportunity, Stage } from "@/lib/db/funnel";
import { showIsoDate } from "@/lib/format";

/** How late or how close a date is, for the colour of its label and the words on it. `today` is `AAAA-MM-DD` in São Paulo. */
export function dueLabel(dueOn: string | null, today: string): { tone: "bad" | "warn" | "neutral"; text: string } | null {
  if (dueOn === null) return null;
  if (dueOn < today) return { tone: "bad", text: `Atrasada · ${showIsoDate(dueOn)}` };
  if (dueOn === today) return { tone: "warn", text: "Hoje" };
  return { tone: "neutral", text: showIsoDate(dueOn) };
}

export type StageColumn = { stage: Stage; items: Opportunity[]; total: number };

/** The opportunities of each stage, with the sum of what they are estimated at. Every stage is there, even empty. */
export function byStage(stages: Stage[], opportunities: Opportunity[]): StageColumn[] {
  return stages.map((stage) => {
    const items = opportunities.filter((item) => item.stageId === stage.id);
    return { stage, items, total: items.reduce((sum, item) => sum + (item.estimatedValue ?? 0), 0) };
  });
}

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Whether every word typed is in the title, the company or customer, the contact or the owner. */
export function matchesOpportunity(item: Opportunity, search: string): boolean {
  const words = fold(search).split(/\s+/).filter(Boolean);
  const hay = fold([item.title, item.customerName, item.company, item.contactName, item.ownerName].filter(Boolean).join(" "));
  return words.every((word) => hay.includes(word));
}

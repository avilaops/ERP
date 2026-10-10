import { getSession } from "@/lib/auth/index";
import { allows } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { reportOf, runReport } from "@/lib/db/reports";
import { isoDate } from "@/lib/format";
import { parsePeriod, personOf, reportCsv } from "@/lib/reports-view";

/**
 * One report of the company of the session, as a spreadsheet file. The same
 * gates and the same scope of the screen: the screen of Relatórios, the screen
 * the numbers come from, and only the person's own records where that is the rule.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ tipo: string; periodo: string }> };

const text = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(_request: Request, context: Context) {
  const session = await getSession();
  if (!session) return text("Entre no sistema para continuar.", 401);
  const { tipo, periodo } = await context.params;
  const report = reportOf(tipo);
  if (!report) return text("Relatório não encontrado.", 404);
  if (!allows(session, "relatorios") || !allows(session, report.item)) return text("Seu perfil não vê este relatório.", 403);

  // The period comes in the path: a ready-made one (`ano`) or two days (`2026-01-01_2026-01-31`).
  const [from, to] = periodo.split("_");
  const today = isoDate(new Date());
  const period = report.period ? parsePeriod(to === undefined ? { periodo } : { de: from, ate: to }, today) : { from: null, to: null };
  const data = await runReport(report.key, { from: period.from, to: period.to, person: personOf(report, session), today }, tenantDb(session.tenant.slug));
  // The mark at the start makes Excel read the accents right.
  return new Response(`﻿${reportCsv(data)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-${report.key}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

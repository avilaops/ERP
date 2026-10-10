import Link from "next/link";
import { CARD, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { allows, menuItem } from "@/lib/auth/permissions";
import { REPORTS } from "@/lib/db/reports";

export const metadata = { title: `${menuItem("relatorios").label} · ERP` };
export const dynamic = "force-dynamic";

/** The reports the person may open: each one asks for the screen its numbers come from. */
export default async function RelatoriosPage() {
  const session = await requirePermission("relatorios");
  const reports = REPORTS.filter((report) => allows(session, report.item));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={menuItem("relatorios").label} hint="Um resumo e uma lista de cada área, com exportação para planilha." />
      {reports.length === 0 ? (
        <p className={`${CARD} mt-3 p-4 text-sm text-slate-600`}>Nenhum relatório para as telas que você tem. Peça à diretoria a tela de onde vêm os números.</p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {reports.map((report) => (
            <li key={report.key}>
              <Link href={`${menuItem("relatorios").href}/${report.key}`} className={`${CARD} block h-full px-4 py-3 hover:border-brand`}>
                <span className="block font-semibold">{report.title}</span>
                <span className="block text-sm text-slate-600">{report.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

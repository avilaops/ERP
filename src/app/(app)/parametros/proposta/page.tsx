import Link from "next/link";
import { ProposalFields } from "@/components/ProposalFields";
import { PageHeader, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { loadProposalDetails } from "@/lib/db/proposal-details";
import { COMPANY_PROPOSAL_SECTIONS } from "@/lib/quote/settings";
import { saveCompanyProposalAction } from "./actions";

export const metadata = { title: "Dados da proposta · ERP" };
export const dynamic = "force-dynamic";
export default async function ProposalSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("parametros");
  const stored = await loadProposalDetails(tenantDb(session.tenant.slug));
  const query = await searchParams;
  return <><PageHeader title="Dados da proposta" hint="Contato e condições para os próximos documentos." actions={<Link href="/parametros?ver=inicio" className={SECONDARY}>Configurações</Link>} />
    {query.salvo === "1" && <p role="status" className="mt-2 text-sm">Dados salvos.</p>}
    <ProposalFields sections={COMPANY_PROPOSAL_SECTIONS} details={stored.details} revision={stored.revision} back="/parametros?ver=inicio" action={saveCompanyProposalAction} />
  </>;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, PageHeader, PRIMARY, QUIET_LINK } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { seesAllOrders } from "@/lib/auth/permissions";
import { ActionForm } from "../../../pedidos/ActionForm";
import { saveCampaignAction } from "../../marketing-actions";
import { CampaignFields } from "../CampaignFields";

export const metadata = { title: "Nova campanha · ERP" };
export const dynamic = "force-dynamic";

export default async function NovaCampanhaPage() {
  const session = await requirePermission("funil", "/funil/campanhas/nova");
  if (!seesAllOrders(session)) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href="/funil/campanhas" className={QUIET_LINK}>
          ← Campanhas
        </Link>
      </p>
      <PageHeader title="Nova campanha" hint="Fica como rascunho: nada é enviado até você conferir e mandar." />
      <ActionForm action={saveCampaignAction} className={`${CARD} mt-3 p-3`}>
        <CampaignFields saved={null} />
        <button type="submit" className={`${PRIMARY} mt-3`}>
          Criar campanha
        </button>
      </ActionForm>
    </div>
  );
}

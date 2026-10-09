import Link from "next/link";
import { CARD, PageHeader, PRIMARY, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listCustomers } from "@/lib/db/customers";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { createOpportunityAction } from "../actions";
import { OpportunityFields } from "../OpportunityFields";

export const metadata = { title: "Nova oportunidade · ERP" };
export const dynamic = "force-dynamic";

export default async function NovaOportunidadePage() {
  const session = await requirePermission("funil", "/funil/nova");
  const customers = (await listCustomers(tenantDb(session.tenant.slug))).map(({ id, name }) => ({ id, name }));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Nova oportunidade" hint="Uma venda possível, de cliente ou de quem ainda não é. Ela começa na primeira etapa do funil, no seu nome." />
      <ActionForm action={createOpportunityAction} className={`${CARD} mt-3 p-3 md:p-4`}>
        <OpportunityFields saved={null} customers={customers} />
        <div className="mt-4 flex gap-2">
          <button type="submit" className={`${PRIMARY} order-2 flex-1 sm:flex-none`}>
            Criar oportunidade
          </button>
          <Link href={menuItem("funil").href} className={`${SECONDARY} order-1`}>
            Cancelar
          </Link>
        </div>
      </ActionForm>
    </div>
  );
}

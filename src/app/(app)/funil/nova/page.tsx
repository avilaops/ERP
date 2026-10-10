import Link from "next/link";
import { CARD, INPUT, PageHeader, PRIMARY, SECONDARY } from "@/components/ui";
import { CnpjError, companySummary, lookupCnpj } from "@/lib/cnpj";
import type { CompanyRecord } from "@/lib/cnpj";
import type { Opportunity } from "@/lib/db/funnel";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listCustomers } from "@/lib/db/customers";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { createOpportunityAction } from "../actions";
import { OpportunityFields } from "../OpportunityFields";

export const metadata = { title: "Nova oportunidade · ERP" };
export const dynamic = "force-dynamic";

export default async function NovaOportunidadePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("funil", "/funil/nova");
  const all = await listCustomers(tenantDb(session.tenant.slug));
  const customers = all.map(({ id, name }) => ({ id, name }));

  // "Buscar na Receita": the company comes filled in from its CNPJ. Nothing is saved by the search.
  const asked = (await searchParams).cnpj;
  const typed = (Array.isArray(asked) ? asked[0] : asked)?.trim() ?? "";
  let found: CompanyRecord | null = null;
  let refused: string | null = null;
  if (typed !== "") {
    try {
      found = await lookupCnpj(typed);
    } catch (error) {
      if (!(error instanceof CnpjError)) throw error;
      refused = error.message;
    }
  }
  // From a WhatsApp conversation of a number that is of nobody yet: the phone comes filled in, and ties the conversation to the new opportunity.
  const askedPhone = (await searchParams).telefone;
  const phoned = /^\d{10,11}$/.test((Array.isArray(askedPhone) ? askedPhone[0] : askedPhone) ?? "") ? String(Array.isArray(askedPhone) ? askedPhone[0] : askedPhone) : null;
  // A company that is already a customer is offered as the customer, not typed again.
  const known = found ? (all.find((customer) => customer.document === found.cnpj) ?? null) : null;
  const filled = found
    ? ({
        customerId: known?.id ?? null, company: known ? null : (found.tradeName ?? found.legalName), phone: found.phone, email: found.email,
        notes: `CNPJ ${found.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")} · ${found.legalName}\n${companySummary(found)}`,
      } as Partial<Opportunity> as Opportunity)
    : phoned
      ? ({ phone: phoned } as Partial<Opportunity> as Opportunity)
      : null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Nova oportunidade" hint="Uma venda possível, de cliente ou de quem ainda não é. Ela começa na primeira etapa do funil, no seu nome." />
      <form method="get" role="search" className="mt-3 flex items-end gap-2">
        <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
          CNPJ da empresa (opcional)
          <input type="text" name="cnpj" inputMode="numeric" defaultValue={typed} placeholder="00.000.000/0000-00" autoComplete="off" className={INPUT} />
        </label>
        <button type="submit" className={SECONDARY}>
          Buscar na Receita
        </button>
      </form>
      {refused && (
        <p role="alert" className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {refused}
        </p>
      )}
      {found && (
        <p role="status" className="mt-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <strong>{found.legalName}</strong>. {companySummary(found)}.{known ? " Já é cliente do cadastro." : ""}
        </p>
      )}
      <ActionForm action={createOpportunityAction} className={`${CARD} mt-3 p-3 md:p-4`}>
        <OpportunityFields key={found?.cnpj ?? "vazio"} saved={filled} customers={customers} />
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

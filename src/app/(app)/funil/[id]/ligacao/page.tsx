import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, INPUT, LABEL, PageHeader, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { seesAllOrders } from "@/lib/auth/permissions";
import { getOpportunity, opportunityParty } from "@/lib/db/funnel";
import { CALL_OUTCOMES, dialable } from "@/lib/db/meetings";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../../pedidos/ActionForm";
import { logCallAction } from "../../actions";

export const metadata = { title: "Registrar ligação · ERP" };
export const dynamic = "force-dynamic";

export default async function LigacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission("funil", `/funil/${id}/ligacao`);
  const conn = tenantDb(session.tenant.slug);
  if (!/^[1-9]\d{0,8}$/.test(id)) notFound();
  const item = await getOpportunity(Number(id), { ownerEmail: seesAllOrders(session) ? null : session.email }, conn);
  // An opportunity of another seller answers as one that does not exist.
  if (!item) notFound();
  const number = dialable(item.phone);

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm">
        <Link href={`/funil/${item.id}`} className={QUIET_LINK}>
          ← {item.title}
        </Link>
      </p>
      <PageHeader title="Registrar ligação" hint={`${item.contactName ?? opportunityParty(item)}${item.phone ? ` · ${item.phone}` : ""}`} />
      {number && (
        <p className="mt-2">
          <a href={`tel:+${number}`} className={SECONDARY}>
            Ligar agora
          </a>
        </p>
      )}
      <ActionForm action={logCallAction} className={`${CARD} mt-3 flex flex-col gap-3 p-3`}>
        <input type="hidden" name="id" value={item.id} />
        <fieldset>
          <legend className={LABEL}>Como foi</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {Object.entries(CALL_OUTCOMES).map(([key, label], index) => (
              <label key={key} className="flex min-h-[var(--control)] cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium has-[:checked]:border-brand has-[:checked]:text-brand">
                <input type="radio" name="outcome" value={key} defaultChecked={index === 0} className="h-4 w-4" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="note" className={LABEL}>
            O que ficou combinado (opcional)
          </label>
          <input id="note" name="note" type="text" maxLength={250} autoComplete="off" className={INPUT} />
        </div>
        <div>
          <label htmlFor="againOn" className={LABEL}>
            Ligar de novo em (opcional)
          </label>
          <input id="againOn" name="againOn" type="date" className={INPUT} />
        </div>
        <button type="submit" className={PRIMARY}>
          Registrar
        </button>
      </ActionForm>
    </div>
  );
}

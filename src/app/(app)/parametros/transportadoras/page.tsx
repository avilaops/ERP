import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { formatDocument } from "@/lib/customer";
import { listCarriers } from "@/lib/db/carriers";
import type { Carrier } from "@/lib/db/carriers";
import { tenantDb } from "@/lib/db/pool";
import { UFS } from "@/lib/pricing/states";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { createCarrierAction, deleteCarrierAction, updateCarrierAction } from "./actions";

export const metadata = { title: "Transportadoras · ERP" };
export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-slate-200 bg-white";
const INPUT = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";
const LABEL = "block text-xs font-medium text-slate-600";

/** The fields of a carrier, the same to add and to edit. `prefix` keeps the ids unique on the page. */
function Fields({ carrier, prefix }: { carrier: Carrier | null; prefix: string }) {
  const fields = [
    ["document", "CNPJ ou CPF", carrier ? formatDocument(carrier.document) : "", ""],
    ["name", "Nome ou razão social", carrier?.name ?? "", "sm:col-span-2"],
    ["stateRegistration", "Inscrição estadual (ou ISENTO)", carrier?.stateRegistration ?? "", ""],
    ["address", "Endereço", carrier?.address ?? "", "sm:col-span-2"],
    ["city", "Município", carrier?.city ?? "", ""],
  ] as const;
  return (
    <>
      {fields.map(([name, label, value, span]) => (
        <div key={name} className={span}>
          <label htmlFor={`${prefix}-${name}`} className={LABEL}>
            {label}
          </label>
          <input key={value} id={`${prefix}-${name}`} name={name} type="text" defaultValue={value} autoComplete="off" className={INPUT} />
        </div>
      ))}
      <div>
        <label htmlFor={`${prefix}-uf`} className={LABEL}>
          UF
        </label>
        <select key={carrier?.uf ?? ""} id={`${prefix}-uf`} name="uf" defaultValue={carrier?.uf ?? ""} className={INPUT}>
          <option value="">—</option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

export default async function TransportadorasPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const carriers = await listCarriers(conn);

  return (
    <>
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className="text-brand underline">
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Transportadoras</h1>
      <p className="mt-1 max-w-3xl text-slate-600">
        Quem leva a mercadoria. Na nota fiscal a transportadora é opcional: só a modalidade do frete é obrigatória. Cadastre aqui para
        escolher no pedido. Só CNPJ ou CPF e o nome são exigidos; com inscrição estadual, a UF também.
      </p>

      <section className={`${CARD} mt-6 p-5`} aria-labelledby="nova">
        <h2 id="nova" className="text-sm font-semibold uppercase tracking-wide">
          Adicionar transportadora
        </h2>
        <ActionForm action={createCarrierAction} className="mt-3 grid gap-3 sm:grid-cols-3">
          <Fields carrier={null} prefix="new" />
          <div className="sm:col-span-3">
            <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
              Adicionar
            </button>
          </div>
        </ActionForm>
      </section>

      <section className={`${CARD} mt-6`} aria-labelledby="lista">
        <h2 id="lista" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
          Transportadoras cadastradas ({carriers.length})
        </h2>
        {carriers.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Nenhuma transportadora cadastrada.</p>
        ) : (
          <ul>
            {carriers.map((carrier) => (
              <li key={carrier.id} className="border-t border-slate-200 px-5 py-4 first:border-t-0">
                <ActionForm action={updateCarrierAction} className="grid gap-3 sm:grid-cols-3">
                  <input type="hidden" name="id" value={carrier.id} />
                  <Fields carrier={carrier} prefix={`c${carrier.id}`} />
                  <div className="sm:col-span-3">
                    <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                      Salvar
                    </button>
                  </div>
                </ActionForm>
                <ActionForm action={deleteCarrierAction} className="mt-1">
                  <input type="hidden" name="id" value={carrier.id} />
                  <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50" />
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

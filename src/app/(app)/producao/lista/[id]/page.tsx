import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, INPUT, LABEL, PageHeader, PRIMARY, QUIET_LINK } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { getBill, listMaterials, MATERIAL_UNITS } from "@/lib/db/materials";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../../pedidos/ActionForm";
import { billAction } from "../../material-actions";

export const metadata = { title: "Lista de materiais · ERP" };
export const dynamic = "force-dynamic";

const show = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

export default async function ListaDeMateriaisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission("producao", `/producao/lista/${id}`);
  const conn = tenantDb(session.tenant.slug);
  const bill = /^[1-9]\d{0,8}$/.test(id) ? await getBill(Number(id), conn) : null;
  if (!bill) notFound();
  const used = new Set(bill.lines.map((line) => line.materialId));
  const free = (await listMaterials(conn)).filter((material) => !used.has(material.id));

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm">
        <Link href="/producao/materiais?ver=listas" className={QUIET_LINK}>
          ← Listas por equipamento
        </Link>
      </p>
      <PageHeader title={bill.product.name} hint={`${bill.product.code ? `${bill.product.code} · ` : ""}o que vai em uma unidade`} />
      {bill.lines.length === 0 ? (
        <p className={`${CARD} mt-3 p-4 text-sm text-slate-700`}>Este equipamento ainda não tem lista de materiais.</p>
      ) : (
        <ul className={`${CARD} mt-3 divide-y divide-slate-200`}>
          {bill.lines.map((line) => (
            <li key={line.materialId} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{line.name}</span>
                <span className="block text-sm text-slate-600">
                  {show(line.quantity)} {MATERIAL_UNITS[line.unit]} por equipamento
                </span>
              </span>
              <ActionForm action={billAction}>
                <input type="hidden" name="productId" value={bill.product.id} />
                <input type="hidden" name="materialId" value={line.materialId} />
                <button type="submit" name="what" value="remover" aria-label={`Tirar ${line.name} da lista`} className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50">
                  Remover
                </button>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
      {free.length === 0 && bill.lines.length === 0 ? (
        <p className="mt-3 text-sm text-slate-700">
          Cadastre os materiais primeiro, em{" "}
          <Link href="/producao/materiais?ver=novo" className={QUIET_LINK}>
            Materiais
          </Link>
          .
        </p>
      ) : (
        <ActionForm action={billAction} className={`${CARD} mt-3 grid grid-cols-[minmax(0,1fr)_7rem] items-end gap-2 p-3`}>
          <input type="hidden" name="productId" value={bill.product.id} />
          <div>
            <label htmlFor="materialId" className={LABEL}>
              Material (para mudar a quantidade, escolha de novo)
            </label>
            <select id="materialId" name="materialId" defaultValue="" className={INPUT}>
              <option value="" disabled>
                Escolha
              </option>
              {[...free, ...(await listMaterials(conn)).filter((material) => used.has(material.id))].map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name} ({MATERIAL_UNITS[material.unit]}){used.has(material.id) ? " · já na lista" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="quantity" className={LABEL}>
              Quantidade
            </label>
            <input id="quantity" name="quantity" type="text" inputMode="decimal" autoComplete="off" className={`${INPUT} text-right`} />
          </div>
          <button type="submit" name="what" value="salvar" className={`${PRIMARY} col-span-2`}>
            Pôr na lista
          </button>
        </ActionForm>
      )}
    </div>
  );
}

import { tenantDb } from "@/lib/db/pool";
import { listLines } from "@/lib/db/product-lines";
import { LINE_PARAM, pickLine } from "@/lib/lines-view";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { deleteProductAction, saveProductScreenAction, setProductActiveAction } from "../actions";
import { ProductScreen } from "../ProductScreen";

export const metadata = { title: "Novo equipamento · ERP" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function NovoEquipamentoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("produtos");
  const query = await searchParams;
  const saved = first(query.salvo) === "1";
  const lines = await listLines(tenantDb(session.tenant.slug));
  const line = pickLine(lines, query[LINE_PARAM]);

  return (
    <>
      <div className="mx-auto max-w-xl">
        <Link href={menuItem("produtos").href} aria-label="Voltar para Produtos e custos" className="inline-block rounded-lg bg-brand-soft px-4 py-2 text-xl text-brand">
          ←
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Novo equipamento</h1>
        <p className="mt-1 text-slate-600">Só o nome é obrigatório. A equipe vê o preço depois que você publicar a tabela.</p>
        {saved && (
          <p role="status" className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Equipamento salvo. Pode cadastrar o próximo.
          </p>
        )}
      </div>
      <div className="mt-6">
        <ProductScreen id={null} saved={null} photo={null} active lines={lines} lineId={line.id} save={saveProductScreenAction} setActive={setProductActiveAction} remove={deleteProductAction} />
      </div>
    </>
  );
}

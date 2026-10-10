import { cookies } from "next/headers";
import Link from "next/link";
import { CARD, Pager, PageHeader, pageOf, Pill, QUIET_LINK } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { materialNeeds, MATERIAL_UNITS } from "@/lib/db/materials";
import { tenantDb } from "@/lib/db/pool";
import { ROWS_COOKIE, rowsPerPage } from "@/lib/rows";

export const metadata = { title: "O que vai faltar · ERP" };
export const dynamic = "force-dynamic";

const show = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export default async function NecessidadesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("producao", "/producao/necessidades");
  const conn = tenantDb(session.tenant.slug);
  const { needs, withoutList } = await materialNeeds(conn);
  const asked = (await searchParams).pagina;
  const slice = pageOf(needs, Array.isArray(asked) ? asked[0] : asked, rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value));
  const short = needs.filter((need) => need.missing > 0).length;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href="/producao/materiais" className={QUIET_LINK}>
          ← Materiais
        </Link>
      </p>
      <PageHeader title="O que vai faltar" hint={`O que as ordens em produção ainda vão usar, contra o estoque de hoje. ${short === 0 ? "Nada falta." : `${short} ${short === 1 ? "material falta" : "materiais faltam"}.`}`} />
      {withoutList > 0 && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {withoutList} {withoutList === 1 ? "ordem em produção é de equipamento" : "ordens em produção são de equipamentos"} sem lista de materiais: não {withoutList === 1 ? "entra" : "entram"} nesta conta.
        </p>
      )}
      {slice.total === 0 ? (
        <p className={`${CARD} mt-3 p-4 text-sm text-slate-700`}>Nenhuma ordem em produção usa material com lista cadastrada.</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-2">
            {slice.rows.map((need) => (
              <li key={need.materialId} className={`${CARD} flex items-center gap-3 px-3 py-2`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold leading-snug">{need.name}</span>
                  <span className="block text-sm text-slate-600">
                    precisa de {show(need.needed)} {MATERIAL_UNITS[need.unit]} em {need.orders} {need.orders === 1 ? "ordem" : "ordens"} · tem {show(need.stock)}
                  </span>
                </span>
                {need.missing > 0 ? <Pill tone="bad">faltam {show(need.missing)}</Pill> : <Pill tone="good">tem</Pill>}
              </li>
            ))}
          </ul>
          <Pager {...slice} noun={["material", "materiais"]} hrefFor={(page) => `/producao/necessidades${page > 1 ? `?pagina=${page}` : ""}`} />
        </>
      )}
    </div>
  );
}

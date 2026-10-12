import { withOptions } from "@/lib/plates";
import { cookies } from "next/headers";
import Link from "next/link";
import { CARD, INPUT, Pager, pageOf, PageHeader, Pill, PRIMARY, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { listOrdersToShip, listStock } from "@/lib/db/stock";
import { showIsoDate } from "@/lib/format";
import { ROWS_COOKIE, rowsPerPage } from "@/lib/rows";
import { ActionForm } from "../pedidos/ActionForm";
import { ConfirmButton } from "../pedidos/ConfirmButton";
import { shipOrderAction } from "./actions";

export const metadata = { title: `${menuItem("estoque").label} · ERP` };
export const dynamic = "force-dynamic";

const HERE = menuItem("estoque").href;
const TABS = [["saldo", "Saldo"], ["expedir", "A expedir"], ["expedidos", "Expedidos"]] as const;
const FILTERS = [["todos", "Todos"], ["com", "Com saldo"], ["falta", "Em falta"]] as const;
const TAB = "inline-flex min-h-[var(--control)] items-center rounded-full border px-3 text-sm font-medium";
const ON = "border-brand bg-brand text-white";
const OFF = "border-slate-300 bg-white hover:bg-slate-50";

export default async function EstoquePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("estoque");
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const tab = TABS.find(([key]) => key === first(query.ver))?.[0] ?? "saldo";
  const size = rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value);

  const nav = (
    <nav aria-label="Partes do estoque" className="mt-3 flex flex-wrap gap-2">
      {TABS.map(([key, label]) => (
        <Link key={key} href={`${HERE}?ver=${key}`} aria-current={tab === key ? "page" : undefined} className={`${TAB} ${tab === key ? ON : OFF}`}>
          {label}
        </Link>
      ))}
    </nav>
  );

  if (tab !== "saldo") {
    const shipped = tab === "expedidos";
    const orders = await listOrdersToShip(shipped, conn);
    const slice = pageOf(orders, first(query.pagina), Math.max(2, Math.floor(size / 2)));
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={menuItem("estoque").label} hint={shipped ? "Pedidos que já saíram do estoque." : "Pedidos fechados que ainda não saíram do estoque. Enquanto não saem, comprometem o saldo."} />
        {nav}
        {orders.length === 0 ? (
          <p className={`${CARD} mt-3 p-4 text-sm text-slate-600`}>{shipped ? "Nenhum pedido expedido ainda." : "Nenhum pedido esperando para sair."}</p>
        ) : (
          <section className={`${CARD} mt-3`} aria-label="Pedidos">
            <ul>
              {slice.rows.map((order) => {
                const short = order.items.some((item) => item.physical < item.quantity);
                return (
                  <li key={order.number} className="border-t border-slate-200 p-3 first:border-t-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 text-sm">
                        <Link href={`${menuItem("pedidos").href}/${order.number}`} className="font-semibold text-brand underline">
                          #{order.number}
                        </Link>{" "}
                        · {order.customer ?? "sem cliente"} · fechado em {showIsoDate(order.closedOn)}
                        <span className="block text-slate-600">{order.items.map((item) => `${item.quantity} × ${withOptions(item.name, item)}`).join(" · ")}</span>
                        {!shipped && short && <span className="mt-1 block text-amber-900">Não há peças bastantes no estoque para este pedido: a saída deixa o saldo negativo.</span>}
                      </p>
                      <ActionForm action={shipOrderAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="number" value={order.number} />
                        {shipped ? (
                          <ConfirmButton label="Desfazer saída" confirmLabel="Confirmar: desfazer" className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50" />
                        ) : (
                          <button type="submit" name="what" value="sair" className={PRIMARY}>
                            Dar saída
                          </button>
                        )}
                      </ActionForm>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pager {...slice} noun={["pedido", "pedidos"]} hrefFor={(page) => `${HERE}?ver=${tab}&pagina=${page}`} />
          </section>
        )}
      </div>
    );
  }

  const filter = FILTERS.find(([key]) => key === first(query.filtro))?.[0] ?? "todos";
  const search = (first(query.q) ?? "").trim().toLowerCase();
  const all = await listStock(conn);
  const rows = all
    .filter((row) => (filter === "com" ? row.physical > 0 : filter === "falta" ? row.available < 0 : true))
    .filter((row) => search === "" || `${row.code ?? ""} ${row.name}`.toLowerCase().includes(search));
  const slice = pageOf(rows, first(query.pagina), size);
  const link = (extra: string) => `${HERE}?ver=saldo&filtro=${filter}${search ? `&q=${encodeURIComponent(search)}` : ""}${extra}`;
  const total = (pick: (row: (typeof all)[number]) => number) => all.reduce((sum, row) => sum + pick(row), 0);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={menuItem("estoque").label}
        hint={`${total((row) => row.physical)} no estoque · ${total((row) => row.committed)} em pedidos fechados · ${total((row) => row.incoming)} a chegar`}
      />
      {nav}
      <form method="get" action={HERE} className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="ver" value="saldo" />
        <input type="hidden" name="filtro" value={filter} />
        <input name="q" type="search" defaultValue={search} placeholder="Buscar nome ou código" aria-label="Buscar equipamento" className={`${INPUT} min-w-0 flex-1`} />
        <button type="submit" className={SECONDARY}>
          Buscar
        </button>
      </form>
      <nav aria-label="Filtro" className="mt-2 flex flex-wrap gap-2">
        {FILTERS.map(([key, label]) => (
          <Link key={key} href={`${HERE}?ver=saldo&filtro=${key}${search ? `&q=${encodeURIComponent(search)}` : ""}`} aria-current={filter === key ? "true" : undefined} className={`${TAB} ${filter === key ? ON : OFF}`}>
            {label}
          </Link>
        ))}
      </nav>
      <section className={`${CARD} mt-3`} aria-label="Saldo por equipamento">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-600">Nenhum equipamento neste filtro.</p>
        ) : (
          <>
            <table className="stack-sm w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-600">
                  <th scope="col" className="px-3 py-2 font-medium">Equipamento</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">No estoque</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Em pedidos</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Disponível</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">A chegar</th>
                </tr>
              </thead>
              <tbody>
                {slice.rows.map((row) => (
                  <tr key={row.productId} className="border-t border-slate-200">
                    <td className="px-3 py-2">
                      <Link href={`${HERE}/${row.productId}`} className="font-medium text-brand underline">
                        {row.name}
                      </Link>
                      <span className="block text-xs text-slate-500">{[row.code ?? "sem código", row.line].join(" · ")}</span>
                    </td>
                    <td data-label="No estoque" className="px-3 py-2 text-right tabular-nums">{row.physical}</td>
                    <td data-label="Em pedidos" className="px-3 py-2 text-right tabular-nums">{row.committed}</td>
                    <td data-label="Disponível" className="px-3 py-2 text-right tabular-nums">
                      {row.available < 0 ? <Pill tone="warn">{row.available}</Pill> : <span className="font-semibold">{row.available}</span>}
                    </td>
                    <td data-label="A chegar" className="px-3 py-2 text-right tabular-nums">{row.incoming}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager {...slice} noun={["equipamento", "equipamentos"]} hrefFor={(page) => link(`&pagina=${page}`)} />
          </>
        )}
      </section>
    </div>
  );
}

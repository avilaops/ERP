import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, INPUT, LABEL, PageHeader, PRIMARY, QUIET_LINK } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { allows, menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { listProductMoves, productStock } from "@/lib/db/stock";
import { showDate } from "@/lib/format";
import { ActionForm } from "../../pedidos/ActionForm";
import { countStockAction } from "../actions";

export const metadata = { title: `${menuItem("estoque").label} · ERP` };
export const dynamic = "force-dynamic";

const HERE = menuItem("estoque").href;
const KINDS = { compra: "Compra recebida", venda: "Saída de pedido", ajuste: "Contagem", estorno: "Estorno" } as const;

export default async function EstoqueDoEquipamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("estoque");
  const { id } = await params;
  const conn = tenantDb(session.tenant.slug);
  const stock = /^[1-9]\d{0,8}$/.test(id) ? await productStock(Number(id), conn) : null;
  if (!stock) notFound();
  const moves = await listProductMoves(stock.productId, 12, conn);
  const buys = allows(session, "compras");

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm">
        <Link href={HERE} className={QUIET_LINK}>
          ← {menuItem("estoque").label}
        </Link>
      </p>
      <PageHeader title={stock.name} hint={[stock.code ?? "sem código", stock.line].join(" · ")} />
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([["No estoque", stock.physical], ["Em pedidos fechados", stock.committed], ["Disponível", stock.available], ["A chegar", stock.incoming]] as const).map(([label, value]) => (
          <div key={label} className={`${CARD} px-3 py-2`}>
            <dt className="text-xs text-slate-600">{label}</dt>
            <dd className="text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <ActionForm action={countStockAction} className={`${CARD} mt-3 flex flex-wrap items-end gap-2 p-3`}>
        <input type="hidden" name="id" value={stock.productId} />
        <div className="basis-full sm:basis-32">
          <label htmlFor="counted" className={LABEL}>
            Contagem: quantos há
          </label>
          <input id="counted" name="counted" type="text" inputMode="numeric" required key={stock.physical} defaultValue={Math.max(0, stock.physical)} className={INPUT} />
        </div>
        <div className="basis-full sm:basis-48 sm:flex-1">
          <label htmlFor="note" className={LABEL}>
            Observação (opcional)
          </label>
          <input id="note" name="note" type="text" maxLength={200} autoComplete="off" className={INPUT} />
        </div>
        <button type="submit" className={PRIMARY}>
          Gravar contagem
        </button>
      </ActionForm>

      <section className={`${CARD} mt-3`} aria-label="Últimos movimentos">
        <h2 className="px-3 py-2 text-sm font-semibold">Últimos movimentos</h2>
        {moves.length === 0 ? (
          <p className="border-t border-slate-200 p-3 text-sm text-slate-600">Nenhum movimento ainda. A primeira contagem dá o saldo inicial.</p>
        ) : (
          <ul>
            {moves.map((move) => (
              <li key={move.id} className="flex items-start justify-between gap-3 border-t border-slate-200 px-3 py-2 text-sm">
                <span className="min-w-0">
                  {KINDS[move.kind]}
                  {move.orderNumber && <> · pedido #{move.orderNumber}</>}
                  {move.purchaseId !== null && (buys ? <> · <Link href={`${menuItem("compras").href}/${move.purchaseId}`} className="text-brand underline">compra {move.purchaseId}</Link></> : <> · compra {move.purchaseId}</>)}
                  <span className="block text-xs text-slate-500">{[showDate(move.at), move.by, move.note].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="font-semibold tabular-nums">{move.quantity > 0 ? `+${move.quantity}` : move.quantity}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, DANGER, INPUT, LABEL, PageHeader, Pill, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { listProducts } from "@/lib/db/products";
import { getPurchase, PURCHASE_KINDS, PURCHASE_STATUS } from "@/lib/db/purchases";
import { listSuppliers } from "@/lib/db/suppliers";
import { formatMoney, isoDate, showIsoDate, showMoney } from "@/lib/format";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { deletePurchaseAction, purchaseCostAction, purchaseItemAction, purchaseStatusAction, updatePurchaseAction } from "../actions";
import { PurchaseFields } from "../PurchaseFields";

export const metadata = { title: `${menuItem("compras").label} · ERP` };
export const dynamic = "force-dynamic";

const HERE = menuItem("compras").href;
const TABS = [["itens", "Equipamentos"], ["custos", "Custos"], ["dados", "Dados"], ["andamento", "Andamento"]] as const;
const TAB = "inline-flex min-h-[var(--control)] items-center rounded-full border px-3 text-sm font-medium";
const TONE = { pedido: "neutral", em_transito: "warn", recebida: "good", cancelada: "neutral" } as const;

export default async function CompraPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("compras");
  const conn = tenantDb(session.tenant.slug);
  const { id } = await params;
  const purchase = /^[1-9]\d{0,8}$/.test(id) ? await getPurchase(Number(id), conn) : null;
  if (!purchase) notFound();
  const query = await searchParams;
  const asked = Array.isArray(query.ver) ? query.ver[0] : query.ver;
  const tab = TABS.find(([key]) => key === asked)?.[0] ?? "itens";
  const open = purchase.status === "pedido" || purchase.status === "em_transito";
  const foreign = purchase.currency !== "BRL";
  const price = (value: number) => `${foreign ? `${purchase.currency} ` : "R$ "}${formatMoney(value)}`;

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-sm">
        <Link href={HERE} className={QUIET_LINK}>
          ← {menuItem("compras").label}
        </Link>
      </p>
      <PageHeader
        title={purchase.supplier}
        hint={[PURCHASE_KINDS.find(([key]) => key === purchase.kind)?.[1], purchase.reference, `pedido em ${showIsoDate(purchase.orderedOn)}`, foreign ? `${purchase.currency} a R$ ${String(purchase.exchangeRate).replace(".", ",")}` : null].filter(Boolean).join(" · ")}
        actions={<Pill tone={TONE[purchase.status]}>{PURCHASE_STATUS[purchase.status]}</Pill>}
      />
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {([["Mercadoria", purchase.goods], ["Custos da compra", purchase.extra], ["Total", purchase.total]] as const).map(([label, value]) => (
          <div key={label} className={`${CARD} px-3 py-2`}>
            <dt className="text-xs text-slate-600">{label}</dt>
            <dd className="font-semibold">{showMoney(value)}</dd>
          </div>
        ))}
      </dl>
      <nav aria-label="Partes da compra" className="mt-3 flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <Link key={key} href={`${HERE}/${purchase.id}?ver=${key}`} aria-current={tab === key ? "page" : undefined} className={`${TAB} ${tab === key ? "border-brand bg-brand text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "itens" && (
        <>
          <section className={`${CARD} mt-3`} aria-label="Equipamentos da compra">
            {purchase.items.length === 0 ? (
              <p className="p-4 text-sm text-slate-600">Nenhum equipamento ainda. Adicione abaixo.</p>
            ) : (
              <ul>
                {purchase.items.map((item) => (
                  <li key={item.productId} className="border-t border-slate-200 p-3 first:border-t-0">
                    <p className="text-sm">
                      <span className="font-medium">{item.name}</span> <span className="text-slate-500">{item.code ?? "sem código"}</span>
                      <span className="block text-slate-600">
                        {showMoney(item.goods)} de mercadoria + {showMoney(item.share)} de custos = <span className="font-semibold">{showMoney(item.landedUnit)} por peça no estoque</span>
                      </span>
                    </p>
                    {open && (
                      <ActionForm action={purchaseItemAction} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={purchase.id} />
                        <input type="hidden" name="productId" value={item.productId} />
                        <div className="basis-24">
                          <label htmlFor={`q-${item.productId}`} className={LABEL}>
                            Quantidade
                          </label>
                          <input id={`q-${item.productId}`} name="quantity" type="text" inputMode="numeric" defaultValue={item.quantity} key={item.quantity} className={INPUT} />
                        </div>
                        <div className="basis-36">
                          <label htmlFor={`p-${item.productId}`} className={LABEL}>
                            Preço da peça ({purchase.currency})
                          </label>
                          <input id={`p-${item.productId}`} name="unitPrice" type="text" inputMode="decimal" defaultValue={formatMoney(item.unitPrice)} key={item.unitPrice} className={INPUT} />
                        </div>
                        <button type="submit" name="what" value="salvar" className={SECONDARY}>
                          Salvar
                        </button>
                        <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className={DANGER} />
                      </ActionForm>
                    )}
                    {!open && <p className="mt-1 text-sm text-slate-600">{item.quantity} × {price(item.unitPrice)}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {open && (
            <ActionForm action={purchaseItemAction} className={`${CARD} mt-3 flex flex-wrap items-end gap-2 p-3`}>
              <input type="hidden" name="id" value={purchase.id} />
              <div className="basis-full sm:basis-64 sm:flex-1">
                <label htmlFor="productId" className={LABEL}>
                  Adicionar equipamento
                </label>
                <select id="productId" name="productId" required defaultValue="" className={INPUT}>
                  <option value="" disabled>
                    Escolha
                  </option>
                  {(await listProducts({ active: true }, conn))
                    .filter((product) => !purchase.items.some((item) => item.productId === product.id))
                    .map((product) => (
                      <option key={product.id} value={product.id}>
                        {[product.code, product.name].filter(Boolean).join(" · ")}
                      </option>
                    ))}
                </select>
              </div>
              <div className="basis-24">
                <label htmlFor="quantity" className={LABEL}>
                  Quantidade
                </label>
                <input id="quantity" name="quantity" type="text" inputMode="numeric" required className={INPUT} />
              </div>
              <div className="basis-36">
                <label htmlFor="unitPrice" className={LABEL}>
                  Preço da peça ({purchase.currency})
                </label>
                <input id="unitPrice" name="unitPrice" type="text" inputMode="decimal" required placeholder="0,00" className={INPUT} />
              </div>
              <button type="submit" name="what" value="salvar" className={PRIMARY}>
                Adicionar
              </button>
            </ActionForm>
          )}
        </>
      )}

      {tab === "custos" && (
        <>
          <section className={`${CARD} mt-3`} aria-label="Custos da compra">
            <p className="px-3 py-2 text-sm text-slate-600">O que a compra custa além da mercadoria, em reais. É dividido entre os equipamentos pelo valor de cada um.</p>
            <ul>
              {purchase.costs.map((cost) => (
                <li key={cost.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-sm">
                  <span>{cost.label}</span>
                  <ActionForm action={purchaseCostAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={purchase.id} />
                    <input type="hidden" name="costId" value={cost.id} />
                    <span className="font-semibold tabular-nums">{showMoney(cost.amount)}</span>
                    <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className={DANGER} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </section>
          {purchase.status !== "cancelada" && (
            <ActionForm action={purchaseCostAction} className={`${CARD} mt-3 flex flex-wrap items-end gap-2 p-3`}>
              <input type="hidden" name="id" value={purchase.id} />
              <div className="basis-full sm:basis-64 sm:flex-1">
                <label htmlFor="label" className={LABEL}>
                  Custo
                </label>
                <input id="label" name="label" type="text" list="custos-comuns" maxLength={80} required autoComplete="off" placeholder="Ex.: Frete internacional" className={INPUT} />
                <datalist id="custos-comuns">
                  {["Frete internacional", "Seguro", "Imposto de importação", "IPI", "PIS", "COFINS", "ICMS", "AFRMM", "Taxa Siscomex", "Despachante", "Armazenagem", "Frete interno"].map((label) => (
                    <option key={label} value={label} />
                  ))}
                </datalist>
              </div>
              <div className="basis-36">
                <label htmlFor="amount" className={LABEL}>
                  Valor (R$)
                </label>
                <input id="amount" name="amount" type="text" inputMode="decimal" required placeholder="0,00" className={INPUT} />
              </div>
              <button type="submit" name="what" value="adicionar" className={PRIMARY}>
                Adicionar custo
              </button>
            </ActionForm>
          )}
        </>
      )}

      {tab === "dados" && (
        <ActionForm action={updatePurchaseAction} className={`${CARD} mt-3 flex flex-wrap items-end gap-3 p-4`}>
          <input type="hidden" name="id" value={purchase.id} />
          <PurchaseFields
            saved={purchase}
            suppliers={(await listSuppliers(conn)).filter((supplier) => supplier.active || supplier.id === purchase.supplierId).map((supplier) => ({ id: supplier.id, name: supplier.tradeName ?? supplier.name }))}
            today={isoDate(new Date())}
          />
          <div className="basis-full">
            <button type="submit" className={PRIMARY}>
              Salvar dados
            </button>
          </div>
        </ActionForm>
      )}

      {tab === "andamento" && (
        <section className={`${CARD} mt-3 p-4 text-sm`} aria-label="Andamento da compra">
          <p>
            {purchase.status === "recebida"
              ? `Recebida em ${showIsoDate(purchase.receivedOn ?? purchase.orderedOn)}: as peças estão no estoque.`
              : purchase.status === "cancelada"
                ? "Compra cancelada: não conta como a chegar."
                : `${PURCHASE_STATUS[purchase.status]}${purchase.expectedOn ? `, com chegada prevista para ${showIsoDate(purchase.expectedOn)}` : ""}. As peças contam como a chegar no estoque.`}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            {open && (
              <ActionForm action={purchaseStatusAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={purchase.id} />
                <div>
                  <label htmlFor="receivedOn" className={LABEL}>
                    Chegou em
                  </label>
                  <input id="receivedOn" name="receivedOn" type="date" required defaultValue={isoDate(new Date())} className={INPUT} />
                </div>
                <button type="submit" name="what" value="receber" className={PRIMARY}>
                  Receber e dar entrada no estoque
                </button>
              </ActionForm>
            )}
            {open && (
              <ActionForm action={purchaseStatusAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={purchase.id} />
                <button type="submit" name="what" value={purchase.status === "pedido" ? "em_transito" : "pedido"} className={SECONDARY}>
                  {purchase.status === "pedido" ? "Marcar em trânsito" : "Voltar a pedido feito"}
                </button>
              </ActionForm>
            )}
            {open && (
              <ActionForm action={purchaseStatusAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={purchase.id} />
                <input type="hidden" name="what" value="cancelada" />
                <ConfirmButton label="Cancelar compra" confirmLabel="Confirmar: cancelar" className={DANGER} />
              </ActionForm>
            )}
            {purchase.status === "recebida" && (
              <ActionForm action={purchaseStatusAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={purchase.id} />
                <input type="hidden" name="what" value="desfazer" />
                <ConfirmButton label="Desfazer recebimento" confirmLabel="Confirmar: desfazer" className={DANGER} />
              </ActionForm>
            )}
            {purchase.status !== "recebida" && (
              <ActionForm action={deletePurchaseAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={purchase.id} />
                <ConfirmButton label="Remover compra" confirmLabel="Confirmar: remover" className={DANGER} />
              </ActionForm>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

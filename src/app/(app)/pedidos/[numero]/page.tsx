import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { canAccess, menuItem, seesAllOrders, seesCosts } from "@/lib/auth/permissions";
import { ufFromCep } from "@/lib/cep";
import { completenessText, isComplete, isRequired, normalizeDocument, taxpayerFromRegistration } from "@/lib/customer";
import type { CustomerKind } from "@/lib/customer";
import { CUSTOMER_FIELDS, customerToForm } from "@/lib/customer-form";
import { lastDecision } from "@/lib/db/approvals";
import { findCustomerByDocument } from "@/lib/db/customers";
import { getOrder, listPaymentMethods, loadOrderStanding } from "@/lib/db/orders";
import { latestVersion, loadPublishedSnapshot, loadPublishedTable } from "@/lib/db/price-table";
import { formatMoney, formatPercent, isoDate, showDateTime, showIsoDate, showMoney, showPercent } from "@/lib/format";
import { BAND_TEXT, REASON_TEXT, STATUS_LABELS, UF_NAMES } from "@/lib/order-form";
import { ORDER_NUMBER } from "@/lib/order-number";
import { closingProblems, directorOf, dueDates, paymentOf, saleOf } from "@/lib/order-quote";
import { UFS } from "@/lib/pricing/states";
import { compareByCode } from "@/lib/products-view";
import { CustomerForm } from "../../clientes/CustomerForm";
import { ActionForm } from "../ActionForm";
import {
  addItemAction,
  closeOrderAction,
  deleteOrderAction,
  removeItemAction,
  reopenOrderAction,
  saveOrderCustomerAction,
  savePaymentAction,
  saveTermsAction,
  setItemQuantityAction,
} from "../actions";
import { ConfirmButton } from "../ConfirmButton";
import { DirectorBoard } from "../DirectorBoard";

export const metadata = { title: "Pedido · ERP" };
// Never reused between profiles: what is assembled for the directors has costs.
export const dynamic = "force-dynamic";

const NONE = "—";
const TERMS = "condicoes";
const CARD = "rounded-lg border border-slate-200 bg-white";
const TITLE = "text-sm font-semibold uppercase tracking-wide";
const INPUT = "rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";
const BUTTON = "rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50";
const PRIMARY = "rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark";
const HELP = "mt-1 text-xs text-slate-500";

const BAND_COLORS = {
  "na-meta": "border-emerald-300 bg-emerald-50 text-emerald-900",
  "abaixo-da-meta": "border-amber-300 bg-amber-50 text-amber-900",
  prejuizo: "border-red-300 bg-red-50 text-red-900",
} as const;

const PROFIT_TITLES = { "na-meta": "Lucro na meta", "abaixo-da-meta": "Lucro abaixo da meta", prejuizo: "Prejuízo" } as const;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
/** "—" where there is nothing to show, as the prototype does for a discount of zero. */
const moneyOrNone = (value: number) => (value === 0 ? NONE : showMoney(value));

const requiredOf = (kind: CustomerKind) =>
  [...CUSTOMER_FIELDS[kind].main, ...CUSTOMER_FIELDS[kind].address].map(({ key }) => key).filter((key) => isRequired(kind, key));

export default async function PedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ numero: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ numero }, query] = await Promise.all([params, searchParams]);
  // Only a well-formed number goes into the address the login returns to.
  const wellFormed = ORDER_NUMBER.test(numero);
  const session = await requirePermission("pedidos", wellFormed ? `/pedidos/${numero}` : undefined);
  const conn = tenantDb(session.tenant.slug);
  if (!wellFormed) notFound();

  const scope = { sellerEmail: seesAllOrders(session.role) ? null : session.email };
  const order = await getOrder(numero, scope, conn);
  if (!order) notFound();
  const decision = await lastDecision(order.number, scope, conn);

  // The team's account: prices of the version of the order, no cost.
  const table = await loadPublishedTable(order.priceTableVersion, conn);
  if (!table) notFound();
  const standing = await loadOrderStanding(order, conn);
  // The profile comes from the session. Costs are read only for who may see them.
  const costs = seesCosts(session.role);
  const snapshot = costs ? await loadPublishedSnapshot(order.priceTableVersion, conn) : null;
  const board = snapshot ? directorOf(order, snapshot) : null;

  const latest = await latestVersion(conn);
  const sale = saleOf(order, table);
  const today = isoDate(new Date());
  const dates = dueDates(order, table, today);
  const editable = order.status === "em_negociacao";
  const plan = paymentOf(order, sale, table, today);
  const missing = editable ? closingProblems(order, sale) : [];
  // The forms of payment are the company's own list; one already used and since turned off still shows.
  const methods = await listPaymentMethods(conn);
  const methodsWith = (used: string | null) => (used && !methods.includes(used) ? [...methods, used] : methods);
  const reasons = standing.policy?.reasons ?? [];
  const shortOfRequired = board ? Math.max(0, board.quote.requiredDownPayment - plan.downPayment) : 0;
  const ipi = `${formatPercent(table.ipi)}%`;

  const products = new Map(table.items.map((item) => [item.productId, item]));
  const catalog = [...table.items].sort((a, b) => compareByCode(a, b) || a.productId - b.productId);
  const units = order.items.reduce((total, item) => total + item.quantity, 0);
  const discountValue = sale.tableTotal - sale.netSale;

  // The block Cliente: the linked customer, or the one searched for by document.
  const linked = order.customer;
  const asked = first(query.cliente);
  const tab: CustomerKind = asked === "pf" ? "PF" : asked === "pj" ? "PJ" : (linked?.kind ?? "PJ");
  const typedDocument = (first(query.doc) ?? "").trim();
  const searched = normalizeDocument(typedDocument);
  const found = searched === "" ? null : await findCustomerByDocument(searched, conn);
  const shown = found ?? (searched === "" && linked?.kind === tab ? linked : null);
  const kind = shown?.kind ?? tab;
  const cepUf = shown?.cep ? ufFromCep(shown.cep) : null;
  const here = `/pedidos/${order.number}`;
  const canBeTaxpayer = linked !== null && taxpayerFromRegistration(linked.kind, linked.stateRegistration);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pedido #{order.number}</h1>
          <p className="mt-1 text-sm text-slate-600">
            De {order.sellerEmail === session.email ? "Você" : order.sellerName} · atualizado {showDateTime(order.updatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full bg-slate-200 px-3 py-1 font-medium">{STATUS_LABELS[order.status]}</span>
          <span className="rounded-full border border-slate-300 px-3 py-1">Tabela v{table.version}</span>
        </div>
      </div>
      {latest && latest.version !== table.version && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Este pedido usa a tabela v{table.version}; a tabela atual é a v{latest.version}. Os preços dele não mudam.
        </p>
      )}
      {editable && decision && !decision.approved && (
        <p role="status" className="mt-3 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">
          <strong>Aprovação recusada</strong> por {decision.decidedBy} em {showDateTime(decision.decidedAt)}: {decision.comment}
        </p>
      )}
      {order.status === "aguardando_aprovacao" && canAccess(session.role, "aprovacoes") && (
        <p className="mt-3 text-sm">
          <Link href={menuItem("aprovacoes").href} className="font-medium text-brand underline">
            Decidir em Aprovações
          </Link>
        </p>
      )}
      {!editable && (
        <div className="mt-3 rounded border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
          <p>
            {order.status === "aguardando_aprovacao"
              ? `Aguardando aprovação${reasons.length > 0 ? `: ${reasons.map((reason) => REASON_TEXT[reason]).join("; ")}` : ""}. Somente leitura.`
              : order.status === "fechado" && order.closedAt
                ? `Pedido fechado em ${showDateTime(order.closedAt)}. Somente leitura.`
                : "Pedido fora de negociação: somente leitura."}
          </p>
          {(order.status === "fechado" || order.status === "aguardando_aprovacao") && (
            <ActionForm action={reopenOrderAction} className="mt-2">
              <input type="hidden" name="number" value={order.number} />
              <ConfirmButton label="Reabrir para alterar" confirmLabel="Confirmar: voltar para negociação" className={BUTTON} />
              <span className="ml-3 text-xs text-slate-600">Os preços continuam os da tabela v{table.version}.</span>
            </ActionForm>
          )}
        </div>
      )}

      <fieldset disabled={!editable} className="mt-6 flex min-w-0 flex-col gap-6">
        <section className={CARD} aria-labelledby="equipamentos">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 id="equipamentos" className={TITLE}>
              Equipamentos
            </h2>
            <p className="text-xs text-slate-600">{units} un.</p>
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-semibold">
                    Equipamento
                  </th>
                  <th scope="col" className="px-4 py-2 text-left font-semibold">
                    Qtd
                  </th>
                  {["Valor unit. s/ IPI", "Valor desconto", "IPI unit.", "Valor unit. c/ IPI", "Total c/ IPI"].map((column) => (
                    <th key={column} scope="col" className="whitespace-nowrap px-4 py-2 text-right font-semibold">
                      {column}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-2">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, index) => {
                  const product = products.get(item.productId);
                  const line = sale.lines[index];
                  return (
                    <tr key={item.productId} className="border-t border-slate-200 align-top">
                      <td className="px-4 py-3">
                        <span className="font-medium">{product?.name}</span>
                        <span className="block text-xs text-slate-500">{product?.code ?? "sem código"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <ActionForm action={setItemQuantityAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="number" value={order.number} />
                          <input type="hidden" name="productId" value={item.productId} />
                          <input
                            key={item.quantity}
                            name="quantity"
                            type="text"
                            inputMode="numeric"
                            size={1}
                            defaultValue={item.quantity}
                            aria-label={`Quantidade de ${product?.name}`}
                            className={`${INPUT} w-16 py-1 text-right`}
                          />
                          {editable && (
                            <button type="submit" className="rounded px-2 py-1 text-xs text-brand hover:bg-slate-100">
                              Alterar
                            </button>
                          )}
                        </ActionForm>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{showMoney(line.unitPrice)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{moneyOrNone(line.unitDiscount)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {showMoney(line.unitIpi)}
                        <span className="block text-xs text-slate-500">{ipi}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{showMoney(line.unitWithIpi)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{showMoney(line.totalWithIpi)}</td>
                      <td className="px-4 py-3 text-right">
                        {editable && order.items.length > 1 && (
                          <ActionForm action={removeItemAction}>
                            <input type="hidden" name="number" value={order.number} />
                            <input type="hidden" name="productId" value={item.productId} />
                            <button type="submit" className="rounded px-2 py-1 text-sm text-red-700 hover:bg-slate-100">
                              Remover
                            </button>
                          </ActionForm>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3">{units} un.</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{showMoney(sale.tableTotal)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{moneyOrNone(discountValue)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{showMoney(sale.ipi)}</td>
                  <td />
                  <td className="whitespace-nowrap px-4 py-3 text-right">{showMoney(sale.invoiceTotal)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          {editable && (
            <ActionForm action={addItemAction} className="flex flex-wrap items-end gap-3 border-t border-slate-200 p-5">
              <input type="hidden" name="number" value={order.number} />
              <div className="min-w-0 flex-1">
                <label htmlFor="productId" className="block text-sm font-medium">
                  Adicionar equipamento da tabela v{table.version}
                </label>
                <select id="productId" name="productId" className={`${INPUT} mt-1 w-full`}>
                  {catalog.map((item) => (
                    <option key={item.productId} value={item.productId}>
                      {[item.code, item.name, `${showMoney(item.tableWithIpi)} c/ IPI`].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="quantity" className="block text-sm font-medium">
                  Qtd
                </label>
                <input id="quantity" name="quantity" type="text" inputMode="numeric" defaultValue="1" className={`${INPUT} mt-1 w-20 text-right`} />
              </div>
              <button type="submit" className={PRIMARY}>
                Adicionar
              </button>
            </ActionForm>
          )}
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <section className={CARD} aria-labelledby="cliente">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
                <h2 id="cliente" className={TITLE}>
                  Cliente
                </h2>
                {linked ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    <Link href={`${menuItem("clientes").href}/${linked.id}`} className="rounded-full bg-indigo-100 px-3 py-1 text-indigo-900 underline">
                      Cadastrado
                    </Link>
                    <span
                      className={`rounded-full px-3 py-1 ${
                        isComplete(linked) ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {completenessText(linked)}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600">Sem cliente ligado ao pedido</p>
                )}
              </div>
              <div className="flex flex-col gap-4 p-5">
                {linked && (
                  <p className="text-sm">
                    Ligado ao pedido: <span className="font-medium">{linked.name}</span>
                  </p>
                )}
                {editable && (
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <nav aria-label="Tipo de cliente" className="flex w-fit rounded-lg border border-slate-200 p-0.5 text-sm">
                      {(
                        [
                          ["PJ", "pj", "Empresa (CNPJ)"],
                          ["PF", "pf", "Pessoa física (CPF)"],
                        ] as const
                      ).map(([value, slug, label]) => (
                        <Link
                          key={value}
                          href={`${here}?cliente=${slug}`}
                          aria-current={kind === value ? "page" : undefined}
                          className={`rounded-md px-3 py-1.5 font-medium ${
                            kind === value ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {label}
                        </Link>
                      ))}
                    </nav>
                    <form method="get" action={here} role="search" className="flex w-full gap-2 sm:w-auto">
                      <input type="hidden" name="cliente" value={kind === "PF" ? "pf" : "pj"} />
                      <input
                        type="search"
                        name="doc"
                        defaultValue={typedDocument}
                        placeholder={kind === "PJ" ? "CNPJ já cadastrado" : "CPF já cadastrado"}
                        aria-label={kind === "PJ" ? "Buscar cliente pelo CNPJ" : "Buscar cliente pelo CPF"}
                        className={`${INPUT} min-w-0 flex-1 text-sm sm:w-56 sm:flex-none`}
                      />
                      <button type="submit" className={BUTTON}>
                        Buscar
                      </button>
                    </form>
                  </div>
                )}
                {searched !== "" && (
                  <p role="status" className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {found
                      ? `Cliente já cadastrado: ${found.name}. Confira e clique em Salvar cliente para ligar ao pedido.`
                      : "Nenhum cliente com este documento. Preencha a ficha e salve para cadastrar e ligar ao pedido."}
                  </p>
                )}
                {(editable || shown) && (
                  <CustomerForm
                    key={`${kind}-${shown?.id ?? "novo"}-${searched}`}
                    kind={kind}
                    id={shown?.id ?? null}
                    saved={shown ? customerToForm(shown) : { document: typedDocument }}
                    required={requiredOf(kind)}
                    cepNote={cepUf && `Pelo CEP, o estado é ${cepUf}. Preencha rua, bairro e cidade.`}
                    hidden={{ number: order.number }}
                    action={saveOrderCustomerAction}
                  />
                )}
              </div>
            </section>

            <section className={CARD} aria-labelledby="entrega">
              <h2 id="entrega" className={`${TITLE} border-b border-slate-200 px-5 py-3`}>
                Entrega e condições
              </h2>
              <ActionForm id={TERMS} action={saveTermsAction} className="grid gap-5 p-5 sm:grid-cols-2">
                <input type="hidden" name="number" value={order.number} />
                <div>
                  <label htmlFor="deliveryUf" className="block text-sm font-medium">
                    Estado de entrega
                  </label>
                  <select
                    key={order.deliveryUf ?? ""}
                    id="deliveryUf"
                    name="deliveryUf"
                    defaultValue={order.deliveryUf ?? ""}
                    className={`${INPUT} mt-1 w-full`}
                  >
                    <option value="">—</option>
                    {UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf} — {UF_NAMES[uf]}
                      </option>
                    ))}
                  </select>
                  <p className={HELP}>Segue a UF do endereço. Troque só se a entrega for em outro estado.</p>
                </div>
                <fieldset>
                  <legend className="block text-sm font-medium">Cliente contribuinte do ICMS (tem IE)?</legend>
                  <div key={String(order.taxpayer)} className="mt-2 flex gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="taxpayer" value="nao" defaultChecked={!order.taxpayer} /> Não
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="taxpayer" value="sim" defaultChecked={order.taxpayer} disabled={!canBeTaxpayer} /> Sim
                    </label>
                  </div>
                  <p className={HELP}>Marcado sozinho pela inscrição estadual. ISENTO = Não.</p>
                </fieldset>
                <div>
                  <label htmlFor="productionDays" className="block text-sm font-medium">
                    Prazo de fabricação <span className="text-red-700">*</span>
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      id="productionDays"
                      name="productionDays"
                      type="text"
                      inputMode="numeric"
                      defaultValue={order.productionDays ?? ""}
                      className={`${INPUT} w-24 text-right`}
                    />
                    <span className="text-sm text-slate-600">dias corridos</span>
                  </div>
                  {dates.completion && (
                    <p className={HELP}>
                      Previsão de conclusão: <strong>{showIsoDate(dates.completion)}</strong>, contando do pagamento da entrada.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="freight" className="block text-sm font-medium">
                    Frete por nossa conta (R$)
                  </label>
                  <input
                    id="freight"
                    name="freight"
                    type="text"
                    inputMode="decimal"
                    defaultValue={order.freight === 0 ? "" : formatMoney(order.freight)}
                    placeholder="0,00"
                    className={`${INPUT} mt-1 w-full text-right`}
                  />
                  <p className={HELP}>Deixe vazio se o cliente paga ou retira.</p>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="notes" className="block text-sm font-medium">
                    Observações
                  </label>
                  <input
                    id="notes"
                    name="notes"
                    type="text"
                    defaultValue={order.notes ?? ""}
                    placeholder="Prazo, condição de pagamento…"
                    className={`${INPUT} mt-1 w-full`}
                  />
                </div>
                {editable && (
                  <div className="sm:col-span-2">
                    <button type="submit" className={PRIMARY}>
                      Salvar condições e desconto
                    </button>
                  </div>
                )}
              </ActionForm>
            </section>

            <section className={CARD} aria-labelledby="pagamento">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
                <h2 id="pagamento" className={TITLE}>
                  Forma de pagamento
                </h2>
                <p className="text-xs text-slate-600">
                  Política: entrada de pelo menos {showPercent(table.minDownPayment, 0)} da nota ({showMoney(plan.policyDownPayment)})
                </p>
              </div>
              <ActionForm action={savePaymentAction} className="grid gap-5 p-5 sm:grid-cols-3">
                <input type="hidden" name="number" value={order.number} />
                <div>
                  <label htmlFor="downPayment" className="block text-sm font-medium">
                    Entrada (R$)
                  </label>
                  <input
                    id="downPayment"
                    name="downPayment"
                    type="text"
                    inputMode="decimal"
                    defaultValue={order.downPayment === 0 ? "" : formatMoney(order.downPayment)}
                    placeholder="0,00"
                    className={`${INPUT} mt-1 w-full text-right`}
                  />
                  <p className={HELP}>
                    {showPercent(plan.downPaymentRate)} da nota ·{" "}
                    {plan.meetsPolicy ? "dentro da política" : "abaixo da política: precisa de aprovação"}
                  </p>
                </div>
                <div>
                  <label htmlFor="downPaymentMethod" className="block text-sm font-medium">
                    Forma da entrada
                  </label>
                  <select
                    key={order.downPaymentMethod ?? ""}
                    id="downPaymentMethod"
                    name="downPaymentMethod"
                    defaultValue={order.downPaymentMethod ?? ""}
                    className={`${INPUT} mt-1 w-full`}
                  >
                    <option value="">—</option>
                    {methodsWith(order.downPaymentMethod).map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="downPaymentDate" className="block text-sm font-medium">
                    Data da entrada
                  </label>
                  <input
                    id="downPaymentDate"
                    name="downPaymentDate"
                    type="date"
                    defaultValue={order.downPaymentDate ?? ""}
                    className={`${INPUT} mt-1 w-full`}
                  />
                  <p className={HELP}>Vazio: na confirmação do pedido.</p>
                </div>
                <div>
                  <label htmlFor="installmentCount" className="block text-sm font-medium">
                    Parcelas do saldo
                  </label>
                  <input
                    id="installmentCount"
                    name="installmentCount"
                    type="text"
                    inputMode="numeric"
                    defaultValue={order.installmentCount ?? ""}
                    className={`${INPUT} mt-1 w-24 text-right`}
                  />
                  <p className={HELP}>Saldo: {showMoney(plan.balance)}</p>
                </div>
                <div>
                  <label htmlFor="balanceMethod" className="block text-sm font-medium">
                    Forma do saldo
                  </label>
                  <select
                    key={order.balanceMethod ?? ""}
                    id="balanceMethod"
                    name="balanceMethod"
                    defaultValue={order.balanceMethod ?? ""}
                    className={`${INPUT} mt-1 w-full`}
                  >
                    <option value="">—</option>
                    {methodsWith(order.balanceMethod).map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3">
                  <div>
                    <label htmlFor="firstInstallmentDays" className="block text-sm font-medium">
                      1ª parcela em
                    </label>
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        id="firstInstallmentDays"
                        name="firstInstallmentDays"
                        type="text"
                        inputMode="numeric"
                        size={1}
                        defaultValue={order.firstInstallmentDays ?? ""}
                        className={`${INPUT} w-16 text-right`}
                      />
                      <span className="text-xs text-slate-600">dias</span>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="installmentIntervalDays" className="block text-sm font-medium">
                      Intervalo
                    </label>
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        id="installmentIntervalDays"
                        name="installmentIntervalDays"
                        type="text"
                        inputMode="numeric"
                        size={1}
                        defaultValue={order.installmentIntervalDays ?? ""}
                        className={`${INPUT} w-16 text-right`}
                      />
                      <span className="text-xs text-slate-600">dias</span>
                    </div>
                  </div>
                </div>
                <div className="sm:col-span-3">
                  <label htmlFor="paymentNotes" className="block text-sm font-medium">
                    Observações do pagamento
                  </label>
                  <input
                    id="paymentNotes"
                    name="paymentNotes"
                    type="text"
                    defaultValue={order.paymentNotes ?? ""}
                    className={`${INPUT} mt-1 w-full`}
                  />
                </div>
                {editable && (
                  <div className="sm:col-span-3">
                    <button type="submit" className={PRIMARY}>
                      Salvar pagamento
                    </button>
                  </div>
                )}
              </ActionForm>
              {plan.receipts.length > 0 && (
                <div className="relative overflow-x-auto border-t border-slate-200">
                  <table className="w-full text-sm">
                    <caption className="px-5 py-2 text-left text-xs text-slate-600">
                      Recebimentos previstos. A comissão é uma previsão: só vale quando o valor entra.
                    </caption>
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        {["Parcela", "Vencimento", "Forma"].map((column) => (
                          <th key={column} scope="col" className="px-5 py-2 text-left font-semibold">
                            {column}
                          </th>
                        ))}
                        {["Valor", "Comissão"].map((column) => (
                          <th key={column} scope="col" className="px-5 py-2 text-right font-semibold">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {plan.receipts.map((receipt) => (
                        <tr key={receipt.label} className="border-t border-slate-200">
                          <td className="px-5 py-2 font-medium">{receipt.label}</td>
                          <td className="px-5 py-2">{showIsoDate(receipt.dueDate)}</td>
                          <td className="px-5 py-2">{receipt.method ?? NONE}</td>
                          <td className="whitespace-nowrap px-5 py-2 text-right">{showMoney(receipt.amount)}</td>
                          <td className="whitespace-nowrap px-5 py-2 text-right">{showMoney(receipt.commission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <section className={`${CARD} p-5`} aria-labelledby="desconto">
              <div className="flex items-center justify-between">
                <h2 id="desconto" className={TITLE}>
                  Desconto
                </h2>
                <p className="text-xs text-slate-600">sobre a tabela</p>
              </div>
              {/* The field belongs to the form of "Entrega e condições": one save, one account. */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  form={TERMS}
                  name="discount"
                  type="text"
                  inputMode="decimal"
                  defaultValue={formatPercent(order.discount)}
                  aria-label="Desconto sobre a tabela, em %"
                  className={`${INPUT} w-24 text-right`}
                />
                <span className="text-sm text-slate-600">%</span>
                {editable && (
                  <button form={TERMS} type="submit" className={BUTTON}>
                    Aplicar
                  </button>
                )}
              </div>
              {board && (
                <p className="mt-3 text-xs text-slate-600">
                  <strong>Na meta</strong> até {showPercent(board.max.atTarget)} · <strong>Abaixo da meta</strong> até{" "}
                  {showPercent(board.max.noLoss)} · <strong>Prejuízo</strong> acima
                </p>
              )}
              {standing.band ? (
                <div className={`mt-3 rounded-lg border p-3 text-sm ${BAND_COLORS[standing.band]}`}>
                  <p className="font-semibold uppercase tracking-wide">
                    {board ? PROFIT_TITLES[standing.band] : BAND_TEXT[standing.band].label}
                  </p>
                  <p className="mt-1">
                    {board
                      ? `Lucro líquido de ${showPercent(board.quote.netProfitRate)} (${showMoney(board.quote.netProfit)}). Meta: ${showPercent(board.targetNetProfit)}.`
                      : BAND_TEXT[standing.band].text}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">Informe o estado de entrega para ver a situação do desconto.</p>
              )}
            </section>

            <section className={`${CARD} p-5`} aria-label="Resumo">
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
                {(
                  [
                    ["Total de tabela", showMoney(sale.tableTotal)],
                    [`Desconto (${showPercent(sale.discount)})`, `– ${showMoney(discountValue)}`],
                    ["Valor sem IPI", showMoney(sale.netSale)],
                    [`IPI (${ipi})`, showMoney(sale.ipi)],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-slate-600">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
                <div className="contents">
                  <dt className="border-t border-slate-200 pt-3 font-medium">Total da nota</dt>
                  <dd className="border-t border-slate-200 pt-3 text-right text-2xl font-bold">{showMoney(sale.invoiceTotal)}</dd>
                </div>
                <div className="contents">
                  <dt className="text-slate-600">Entrada ({showPercent(plan.downPaymentRate)})</dt>
                  <dd className="text-right font-medium">{showMoney(plan.downPayment)}</dd>
                  <dt className="text-slate-600">Saldo</dt>
                  <dd className="text-right font-medium">{showMoney(plan.balance)}</dd>
                </div>
                <div className="contents text-xs">
                  <dt className="text-slate-600">Prazo de fabricação</dt>
                  <dd className="text-right">{order.productionDays === null ? NONE : `${order.productionDays} dias corridos`}</dd>
                  <dt className="text-slate-600">Validade da proposta</dt>
                  <dd className="text-right">{showIsoDate(dates.proposalValidUntil)}</dd>
                </div>
              </dl>
            </section>

            {board && <DirectorBoard board={board} />}
            {board && shortOfRequired > 0 && (
              <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Faltam <strong>{showMoney(shortOfRequired)}</strong> de entrada para cobrir a China, o lucro da meta e a comissão.
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {editable && (
        <section className={`${CARD} mt-6 p-5`} aria-labelledby="fechar">
          <h2 id="fechar" className={TITLE}>
            Fechar pedido
          </h2>
          {missing.length > 0 ? (
            <ul className="mt-3 list-disc pl-5 text-sm text-slate-700">
              {missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-700">
              {reasons.length > 0
                ? `Vai para aprovação, porque ${reasons.map((reason) => REASON_TEXT[reason]).join(" e ")}.`
                : "Dentro da política: fecha na hora."}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <ActionForm action={closeOrderAction}>
              <input type="hidden" name="number" value={order.number} />
              <button type="submit" disabled={missing.length > 0} className={`${PRIMARY} disabled:cursor-not-allowed disabled:opacity-50`}>
                {reasons.length > 0 && missing.length === 0 ? "Enviar para aprovação" : "Fechar pedido"}
              </button>
            </ActionForm>
            <ActionForm action={deleteOrderAction}>
              <input type="hidden" name="number" value={order.number} />
              <ConfirmButton
                label="Excluir pedido"
                confirmLabel="Confirmar exclusão"
                className="rounded border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              />
            </ActionForm>
          </div>
        </section>
      )}
    </>
  );
}

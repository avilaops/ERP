import { LineTabs } from "@/components/LineTabs";
import { listLines } from "@/lib/db/product-lines";
import { LINE_PARAM, pickLine } from "@/lib/lines-view";
import { DiscountFields } from "@/components/DiscountFields";
import { requirePermission } from "@/lib/auth";
import { allows, menuItem, seesCosts } from "@/lib/auth/permissions";
import { simulationBand } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { latestVersion, loadPublishedSnapshot, loadPublishedTable } from "@/lib/db/price-table";
import { formatMoney, formatPercent, parseMoney, parsePercent, showMoney, showPercent } from "@/lib/format";
import { BAND_TEXT, parseQuantity, UF_NAMES } from "@/lib/order-form";
import { directorOf, saleOf, simulatedOrder } from "@/lib/order-quote";
import type { Simulation } from "@/lib/order-quote";
import { saleBreakdown } from "@/lib/pricing/breakdown";
import { roundCents } from "@/lib/pricing/money";
import { ORIGIN_UF, UFS } from "@/lib/pricing/states";
import type { Uf } from "@/lib/pricing/states";
import { compareByCode } from "@/lib/products-view";
import { EquipmentPicker } from "@/components/EquipmentPicker";
import { CARD, INPUT, LABEL, PageHeader, Pill, PRIMARY, QUIET_LINK, SECONDARY, SECTION_TITLE } from "@/components/ui";
import { ActionForm } from "../pedidos/ActionForm";
import { createOrderAction } from "../pedidos/actions";
import { DirectorBoard } from "../pedidos/DirectorBoard";

export const metadata = { title: `${menuItem("simulador").label} · ERP` };
// Never reused between profiles: what is assembled for the directors has costs.
export const dynamic = "force-dynamic";

const BAND_TONES = { "na-meta": "good", "abaixo-da-meta": "warn", prejuizo: "bad" } as const;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function SimuladorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("simulador");
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;

  const lines = await listLines(conn);
  const productLine = pickLine(lines, query[LINE_PARAM]);
  const latest = await latestVersion(conn, productLine.id);
  const table = latest ? await loadPublishedTable(latest.version, conn) : null;
  if (!latest || !table || table.items.length === 0) {
    return (
      <>
        <PageHeader title={menuItem("simulador").label} />
        <LineTabs lines={lines} current={productLine.id} path={menuItem("simulador").href} />
        <p className={`${CARD} mt-3 p-5 text-sm text-slate-600`}>Nenhuma tabela publicada ainda. Sem ela não há preço para simular.</p>
      </>
    );
  }

  // What was typed, read here on the server. Anything invalid falls back to a neutral value: nothing is written anywhere.
  const catalog = [...table.items].sort((a, b) => compareByCode(a, b) || a.productId - b.productId);
  const product = catalog.find((item) => String(item.productId) === first(query.equipamento)) ?? catalog[0];
  const typedUf = (first(query.uf) ?? "").toUpperCase();
  const deliveryUf: Uf = (UFS as readonly string[]).includes(typedUf) ? (typedUf as Uf) : ORIGIN_UF;
  const simulation: Simulation = {
    productId: product.productId,
    quantity: parseQuantity(first(query.qtd) ?? "1") ?? 1,
    discount: parsePercent((first(query.desconto) ?? "").replace(/\s*%$/, "")) ?? 0,
    deliveryUf,
    taxpayer: first(query.ie) === "sim",
    freight: parseMoney(first(query.frete) ?? "") ?? 0,
  };

  const sale = saleOf(simulatedOrder(simulation, new Date()), table);
  const band = await simulationBand(latest.version, simulation, conn);
  // The profile comes from the session. Costs are read only for who may see them.
  const snapshot = seesCosts(session) ? await loadPublishedSnapshot(latest.version, conn) : null;
  const board = snapshot ? directorOf(simulatedOrder(simulation, new Date()), snapshot) : null;
  // Where each real goes, for the directors: the board opened line by line.
  const breakdown = board && snapshot ? saleBreakdown(board.quote, snapshot.params, { uf: deliveryUf, taxpayer: simulation.taxpayer }) : null;
  const policyDownPayment = roundCents(table.minDownPayment * sale.invoiceTotal);
  const [line] = sale.lines;

  const hasIpi = table.ipi > 0;
  const summary = [
    [hasIpi ? "Preço de tabela (unidade, sem IPI)" : "Preço de tabela (unidade)", showMoney(line.unitPrice)],
    [`Desconto (${showPercent(sale.discount)})`, `– ${showMoney(sale.tableTotal - sale.netSale)}`],
    ...(hasIpi ? ([["Valor sem IPI", showMoney(sale.netSale)], [`IPI (${formatPercent(table.ipi)}%)`, showMoney(sale.ipi)]] as const) : []),
  ] as const;

  // On a phone the sale is told in three short steps; a wide screen shows the conditions and the result side by side.
  const STEPS = ["Equipamento", "Condições", "Resultado"] as const;
  const step = Math.min(3, Math.max(1, Number(first(query.etapa)) || 1));
  const only = (wanted: number) => (step === wanted ? "" : "hidden md:block");
  const sells = allows(session, "pedidos");
  const overFree = simulation.discount > table.freeDiscount;
  const destination = `${deliveryUf}${deliveryUf !== ORIGIN_UF ? (simulation.taxpayer ? " com IE" : " sem IE") : ""}`;
  const FORM = "simulacao";

  return (
    <>
      <PageHeader
        title={menuItem("simulador").label}
        hint={
          <span className="flex flex-wrap items-center gap-2">
            Tabela v{table.version}
            <Pill tone="neutral">Simulação não salva</Pill>
          </span>
        }
      />
      <LineTabs lines={lines} current={productLine.id} path={menuItem("simulador").href} />
      <p className="mt-3 text-sm font-medium text-slate-600 md:hidden" aria-live="polite">
        Etapa {step} de 3 · <span className="text-slate-900">{STEPS[step - 1]}</span>
      </p>

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)] items-start gap-4 md:mt-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <form id={FORM} method="get" className={`${CARD} ${step === 3 ? "hidden md:block" : ""} p-3 md:p-4`}>
          {lines.length > 1 && <input type="hidden" name={LINE_PARAM} value={productLine.id} />}

          <fieldset className={`${only(1)} min-w-0`}>
            <legend className={`${SECTION_TITLE} hidden md:block`}>Equipamento</legend>
            <div className="flex flex-col gap-3 md:mt-2 md:flex-row md:items-end">
              <div className="min-w-0 flex-1">
                <EquipmentPicker
                  key={product.productId}
                  name="equipamento"
                  chosen={product.productId}
                  items={catalog.map((item) => ({ id: item.productId, name: item.name, code: item.code, price: showMoney(hasIpi ? item.tableWithIpi : item.table) }))}
                />
              </div>
              <div className="md:w-28">
                <label htmlFor="qtd" className={LABEL}>
                  Quantidade
                </label>
                <input id="qtd" name="qtd" type="text" inputMode="numeric" defaultValue={simulation.quantity} className={`${INPUT} text-right`} />
              </div>
            </div>
          </fieldset>

          <fieldset className={`${only(2)} min-w-0 md:mt-4`}>
            <legend className={`${SECTION_TITLE} hidden md:block`}>Condições</legend>
            <div className="grid grid-cols-2 gap-3 md:mt-2">
              <div>
                <label htmlFor="uf" className={LABEL}>
                  Destino
                </label>
                <select id="uf" name="uf" defaultValue={deliveryUf} className={INPUT}>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf} — {UF_NAMES[uf]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ie" className={LABEL}>
                  Inscrição estadual
                </label>
                <select id="ie" name="ie" defaultValue={simulation.taxpayer ? "sim" : "nao"} className={INPUT}>
                  <option value="nao">Cliente sem IE</option>
                  <option value="sim">Cliente com IE</option>
                </select>
              </div>
              <div className="col-span-2">
                <DiscountFields
                  key={`${simulation.productId}:${simulation.quantity}:${simulation.discount}`}
                  name="desconto"
                  percent={formatPercent(simulation.discount)}
                  tableTotal={sale.tableTotal}
                  invoiceFactor={1 + table.ipi}
                  free={table.freeDiscount}
                />
              </div>
              <details className="col-span-2" open={simulation.freight > 0}>
                <summary className={`${QUIET_LINK} inline-block cursor-pointer py-1 text-sm`}>Frete por nossa conta</summary>
                <label htmlFor="frete" className={`${LABEL} mt-1`}>
                  Valor do frete que a empresa paga (R$)
                </label>
                <input id="frete" name="frete" type="text" inputMode="decimal" defaultValue={simulation.freight === 0 ? "" : formatMoney(simulation.freight)} placeholder="0,00" className={`${INPUT} text-right sm:max-w-48`} />
              </details>
            </div>
          </fieldset>

          {/* The main action comes first in the page so Enter in any field takes it; "Voltar" is drawn before it. */}
          <div className="mt-4 flex gap-2 md:hidden">
            <button type="submit" name="etapa" value={step + 1} className={`${PRIMARY} order-2 flex-1`}>
              {step === 1 ? "Continuar" : "Ver resultado"}
            </button>
            {step === 2 && (
              <button type="submit" name="etapa" value="1" className={`${SECONDARY} order-1`}>
                Voltar
              </button>
            )}
          </div>
          <div className="mt-4 hidden md:block">
            <button type="submit" className={PRIMARY}>
              Simular
            </button>
          </div>
        </form>

        <section className={`${CARD} ${only(3)} p-3 md:p-4`} aria-labelledby="resultado">
          <h2 id="resultado" className={`${SECTION_TITLE} sr-only md:not-sr-only`}>
            Resultado
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {simulation.quantity} un. · {product.name} · {destination}
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <p>
              <span className="block text-sm text-slate-600">Total da venda{hasIpi ? ", com IPI" : ""}</span>
              <span className="block text-3xl font-bold leading-tight">{showMoney(sale.invoiceTotal)}</span>
            </p>
            <p className="flex flex-wrap gap-1.5 pb-1">
              {band && <Pill tone={BAND_TONES[band]}>{BAND_TEXT[band].label}</Pill>}
              {overFree && <Pill tone="warn">Iria para aprovação</Pill>}
            </p>
          </div>
          <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t border-slate-200 pt-3 text-sm">
            <dt className="text-slate-600">Entrada mínima ({showPercent(table.minDownPayment, 0)})</dt>
            <dd className="text-right text-base font-semibold">{showMoney(policyDownPayment)}</dd>
          </dl>
          {band && (
            <p className="mt-2 text-sm text-slate-600">
              {board
                ? `Lucro líquido de ${showPercent(board.quote.netProfitRate)} (${showMoney(board.quote.netProfit)}). Meta: ${showPercent(board.targetNetProfit)}.`
                : BAND_TEXT[band].text}
              {overFree ? ` O desconto passa do livre (${showPercent(table.freeDiscount, 0)}).` : ""}
            </p>
          )}

          <details className="mt-3 border-t border-slate-200 pt-2">
            <summary className={`${QUIET_LINK} inline-block cursor-pointer py-1 text-sm`}>Ver composição</summary>
            <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm">
              {summary.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-slate-600">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
              <dt className="text-slate-600">{hasIpi ? "Preço por unidade, com IPI" : "Preço por unidade"}</dt>
              <dd className="text-right font-medium">{showMoney(line.unitWithIpi)}</dd>
              <dt className="font-medium">Total da venda</dt>
              <dd className="text-right font-semibold">{showMoney(sale.invoiceTotal)}</dd>
            </dl>
          </details>

          <div className="mt-4 flex flex-wrap gap-2">
            {sells && (
              // The order opens with this equipment and quantity; the conditions are agreed on the order itself.
              <ActionForm action={createOrderAction} className="order-2 min-w-0 flex-1">
                <input type="hidden" name="version" value={table.version} />
                <input type="hidden" name="productId" value={product.productId} />
                <input type="hidden" name="quantity" value={simulation.quantity} />
                <button type="submit" className={`${PRIMARY} w-full`}>
                  Criar pedido
                </button>
              </ActionForm>
            )}
            <button type="submit" form={FORM} name="etapa" value="2" className={`${SECONDARY} order-1 md:hidden`}>
              Editar condições
            </button>
          </div>

          {board && (
            <details className="mt-3 border-t border-slate-200 pt-2">
              <summary className={`${QUIET_LINK} inline-block cursor-pointer py-1 text-sm`}>Custos e lucro (só a diretoria vê)</summary>
              <p className="mt-1 text-sm">
                {hasIpi ? "Preço mínimo na meta, com IPI:" : "Preço mínimo na meta:"}{" "}
                <strong>{showMoney(roundCents((sale.tableTotal / simulation.quantity) * (1 - Math.max(0, board.max.atTarget)) * (1 + table.ipi)))}</strong> por unidade.
              </p>
              <div className="mt-3">
                <DirectorBoard board={board} imported={productLine.imported} />
              </div>
              {breakdown && (
                <>
                  <h3 className={`${SECTION_TITLE} mt-4`}>Para onde vai cada real</h3>
                  <p className="text-xs text-slate-600">sobre o valor da venda{hasIpi ? " sem IPI" : ""}</p>
                  <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                    {breakdown.map((item) => (
                      <li
                        key={item.label}
                        className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 ${item.kind === "subtotal" || item.kind === "profit" ? "border-t border-slate-200 pt-2 font-semibold" : ""} ${item.kind === "sale" ? "font-semibold" : ""}`}
                      >
                        <span className={item.kind === "cost" ? "text-slate-700" : ""}>{item.label}</span>
                        <span className="text-right">
                          {item.amount < 0 ? `– ${showMoney(-item.amount)}` : showMoney(item.amount)} <span className="text-xs font-normal text-slate-600">({showPercent(item.share)})</span>
                        </span>
                        <span className="col-span-2 h-1.5 rounded bg-slate-100" aria-hidden="true">
                          <span
                            className={`block h-full rounded ${item.kind === "cost" ? "bg-red-700" : item.kind === "profit" ? (item.amount >= 0 ? "bg-emerald-600" : "bg-red-700") : "bg-brand"}`}
                            style={{ width: `${Math.min(100, Math.abs(item.share) * 100)}%` }}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </details>
          )}
        </section>
      </div>
    </>
  );
}

import { LineTabs } from "@/components/LineTabs";
import { listLines } from "@/lib/db/product-lines";
import { LINE_PARAM, pickLine } from "@/lib/lines-view";
import { DiscountFields } from "@/components/DiscountFields";
import { requirePermission } from "@/lib/auth";
import { menuItem, seesCosts } from "@/lib/auth/permissions";
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
import { DirectorBoard } from "../pedidos/DirectorBoard";

export const metadata = { title: `${menuItem("simulador").label} · ERP` };
// Never reused between profiles: what is assembled for the directors has costs.
export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-slate-200 bg-white";
const INPUT = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";
const LABEL = "block text-sm font-medium";
const BAND_COLORS = {
  "na-meta": "border-emerald-300 bg-emerald-50 text-emerald-900",
  "abaixo-da-meta": "border-amber-300 bg-amber-50 text-amber-900",
  prejuizo: "border-red-300 bg-red-50 text-red-900",
} as const;
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
        <h1 className="text-2xl font-semibold">{menuItem("simulador").label}</h1>
        <LineTabs lines={lines} current={productLine.id} path={menuItem("simulador").href} />
        <p className={`${CARD} mt-6 p-6 text-sm text-slate-600`}>Nenhuma tabela publicada ainda. Sem ela não há preço para simular.</p>
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
  const snapshot = seesCosts(session.role) ? await loadPublishedSnapshot(latest.version, conn) : null;
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

  return (
    <>
      <h1 className="text-2xl font-semibold">{menuItem("simulador").label}</h1>
      <p className="mt-1 text-slate-600">
        Uma venda de teste com a tabela v{table.version}. Nada é gravado: para vender, abra um pedido.
      </p>
      <LineTabs lines={lines} current={productLine.id} path={menuItem("simulador").href} />

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <form method="get" className={`${CARD} grid gap-4 p-5 sm:grid-cols-2`}>
            {lines.length > 1 && <input type="hidden" name={LINE_PARAM} value={productLine.id} />}
            <div className="sm:col-span-2">
              <label htmlFor="equipamento" className={LABEL}>
                Equipamento
              </label>
              <select id="equipamento" name="equipamento" defaultValue={product.productId} className={INPUT}>
                {catalog.map((item) => (
                  <option key={item.productId} value={item.productId}>
                    {[item.code, item.name].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </div>
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
                Cliente tem inscrição estadual?
              </label>
              <select id="ie" name="ie" defaultValue={simulation.taxpayer ? "sim" : "nao"} className={INPUT}>
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </div>
            <div>
              <label htmlFor="qtd" className={LABEL}>
                Quantidade
              </label>
              <input id="qtd" name="qtd" type="text" inputMode="numeric" defaultValue={simulation.quantity} className={`${INPUT} text-right`} />
            </div>
            <DiscountFields
              key={`${simulation.productId}:${simulation.quantity}:${simulation.discount}`}
              name="desconto"
              percent={formatPercent(simulation.discount)}
              tableTotal={sale.tableTotal}
            />
            <div>
              <label htmlFor="frete" className={LABEL}>
                Frete por nossa conta (R$)
              </label>
              <input
                id="frete"
                name="frete"
                type="text"
                inputMode="decimal"
                defaultValue={simulation.freight === 0 ? "" : formatMoney(simulation.freight)}
                placeholder="0,00"
                className={`${INPUT} text-right`}
              />
            </div>
            <div className="flex items-end">
              <button type="submit" className="w-full rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark sm:w-auto">
                Simular
              </button>
            </div>
          </form>

          <section className={`${CARD} p-5`} aria-labelledby="conta">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="conta" className="text-sm font-semibold uppercase tracking-wide">
                A conta da venda
              </h2>
              <p className="text-xs text-slate-600">
                {simulation.quantity} un. · {deliveryUf}
                {deliveryUf !== ORIGIN_UF ? (simulation.taxpayer ? " com IE" : " sem IE") : ""}
              </p>
            </div>
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
              {summary.map(([label, value]) => (
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
                <dt className="text-slate-600">{hasIpi ? "Preço por unidade, com IPI" : "Preço por unidade"}</dt>
                <dd className="text-right font-medium">{showMoney(line.unitWithIpi)}</dd>
                <dt className="text-slate-600">Entrada mínima da política ({showPercent(table.minDownPayment, 0)})</dt>
                <dd className="text-right font-medium">{showMoney(policyDownPayment)}</dd>
              </div>
            </dl>
          </section>

          {breakdown && (
            <section className={`${CARD} p-5`} aria-labelledby="cada-real">
              <h2 id="cada-real" className="text-sm font-semibold uppercase tracking-wide">
                Para onde vai cada real
              </h2>
              <p className="mt-1 text-xs text-slate-600">sobre o valor da venda{hasIpi ? " sem IPI" : ""} · só a diretoria vê</p>
              <ul className="mt-4 flex flex-col gap-1.5 text-sm">
                {breakdown.map((item) => (
                  <li
                    key={item.label}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[minmax(0,14rem)_7rem_minmax(0,1fr)_4rem] ${
                      item.kind === "subtotal" || item.kind === "profit" ? "border-t border-slate-200 pt-2 font-semibold" : ""
                    } ${item.kind === "sale" ? "font-semibold" : ""}`}
                  >
                    <span className={item.kind === "cost" ? "text-slate-700" : ""}>{item.label}</span>
                    <span className="text-right">{item.amount < 0 ? `– ${showMoney(-item.amount)}` : showMoney(item.amount)}</span>
                    <span className="col-span-2 h-2 rounded bg-slate-100 sm:col-span-1" aria-hidden="true">
                      <span
                        className={`block h-full rounded ${item.kind === "cost" ? "bg-red-700" : item.kind === "profit" ? (item.amount >= 0 ? "bg-emerald-600" : "bg-red-700") : "bg-brand"}`}
                        style={{ width: `${Math.min(100, Math.abs(item.share) * 100)}%` }}
                      />
                    </span>
                    <span className="hidden text-right text-xs text-slate-600 sm:block">{showPercent(item.share)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {band && (
            <section className={`rounded-lg border p-4 text-sm ${BAND_COLORS[band]}`} aria-label="Situação do desconto">
              <p className="font-semibold uppercase tracking-wide">{BAND_TEXT[band].label}</p>
              <p className="mt-1">
                {board
                  ? `Lucro líquido de ${showPercent(board.quote.netProfitRate)} (${showMoney(board.quote.netProfit)}). Meta: ${showPercent(board.targetNetProfit)}.`
                  : BAND_TEXT[band].text}
              </p>
              {simulation.discount > table.freeDiscount && <p className="mt-1">O desconto passa do livre ({showPercent(table.freeDiscount, 0)}): o pedido iria para aprovação.</p>}
            </section>
          )}
          {board && (
            <>
              <p className={`${CARD} p-4 text-sm`}>
                {hasIpi ? "Preço mínimo na meta, com IPI:" : "Preço mínimo na meta:"}{" "}
                <strong>{showMoney(roundCents((sale.tableTotal / simulation.quantity) * (1 - Math.max(0, board.max.atTarget)) * (1 + table.ipi)))}</strong> por unidade.
              </p>
              <DirectorBoard board={board} imported={productLine.imported} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

import { showMoney, showPercent } from "@/lib/format";
import { lineWords } from "@/lib/line-words";
import type { DirectorBoard as Board } from "@/lib/order-quote";

/** `– R$ 7.304,31`: what leaves the sale. */
const minus = (value: number) => `– ${showMoney(value)}`;

type Row = [label: string, value: string, strong?: boolean];

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
      {rows.map(([label, value, strong]) => (
        <div key={label} className="contents">
          <dt className={strong ? "font-medium" : "text-slate-600"}>{label}</dt>
          <dd className={`text-right ${strong ? "font-semibold" : ""}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The board "Só o diretor vê": taxes, cost, profit and the down payment the order
 * needs. A server component on purpose: it is rendered only when the page has a
 * board, and the page only has one for who `seesCosts`.
 */
/** `imported`: whether the line of the order is bought abroad; it names what the down payment pays first. */
export function DirectorBoard({ board, imported = true, note = null }: { board: Board; imported?: boolean; /** What the figures assume, when the order does not say yet. */ note?: string | null }) {
  const { quote, max, targetNetProfit } = board;
  const target = showPercent(targetNetProfit, 0);

  const result: Row[] = [
    [quote.invoiceTotal > quote.netSale ? "Valor sem IPI" : "Valor da venda", showMoney(quote.netSale)],
    [`Impostos e taxas (${showPercent(quote.taxRate)})`, minus(quote.taxes)],
    ...(quote.difalRate > 0 ? [[`DIFAL (${showPercent(quote.difalRate)})`, minus(quote.difal)] as Row] : []),
    ["Custo dos equipamentos", minus(quote.equipmentCost)],
    ...(quote.freight > 0 ? [["Frete", minus(quote.freight)] as Row] : []),
    ...(quote.fixedFee > 0 ? [["Taxa fixa do pedido", minus(quote.fixedFee)] as Row] : []),
    ["Sobra antes do IR", showMoney(quote.profitBeforeIncomeTax), true],
    ["IRPJ + CSLL", minus(quote.incomeTax)],
  ];
  const profit: Row[] = [
    ["Lucro líquido", `${showMoney(quote.netProfit)} · ${showPercent(quote.netProfitRate)}`, true],
    [`Desconto máx. na meta (${target})`, showPercent(max.atTarget)],
    ["Desconto máx. sem prejuízo", showPercent(max.noLoss)],
  ];
  const downPayment: Row[] = [
    [lineWords(imported).pay, showMoney(quote.chinaPayment)],
    [`Lucro líquido da meta (${target})`, showMoney(quote.targetNetProfit)],
    ["Comissão sobre a entrada", showMoney(quote.downPaymentCommission)],
    ["Entrada mínima", `${showMoney(quote.requiredDownPayment)} · ${showPercent(quote.requiredDownPaymentRate, 0)} da nota`, true],
  ];

  return (
    <aside className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5" aria-labelledby="so-o-diretor">
      <h2 id="so-o-diretor" className="text-xs font-semibold uppercase tracking-wide text-indigo-900">
        Só o diretor vê
      </h2>
      {note && <p className="mt-1 text-xs text-slate-600">{note}</p>}
      <div className="mt-3 flex flex-col gap-3">
        <Rows rows={result} />
        <hr className="border-slate-200" />
        <Rows rows={profit} />
        <hr className="border-slate-200" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-900">Entrada necessária</h3>
        <Rows rows={downPayment} />
      </div>
    </aside>
  );
}

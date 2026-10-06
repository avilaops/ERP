import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { menuItem } from "@/lib/auth/permissions";
import { loadParams } from "@/lib/db/params";
import { listProductCosts } from "@/lib/db/products";
import { showMoney, showMultiplier, showPercent } from "@/lib/format";
import { paramsToForm } from "@/lib/params-form";
import { roundCents } from "@/lib/pricing/money";
import { paramsResult } from "@/lib/pricing/results";
import { adoptSuggestedDownPaymentAction, saveParamsAction } from "./actions";
import { ParamsForm } from "./ParamsForm";

export const metadata = { title: `${menuItem("parametros").label} · ERP` };
export const dynamic = "force-dynamic";

export default async function ParametrosPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);

  const [params, costs] = await Promise.all([loadParams(conn), listProductCosts(conn)]);
  // Every figure of the board is calculated here, on the server, by the engine.
  const result = paramsResult(params, costs);
  const form = paramsToForm(params);
  const worst = result.worstDestination;
  const suggestion = result.suggestedDownPayment;

  const rows: [string, string][] = [
    [
      "Pior destino",
      `${worst.uf}, ${worst.taxpayer ? "contribuinte" : "não contribuinte"} (ICMS + DIFAL ${showPercent(result.worstIcmsAndDifal)})`,
    ],
    ["Impostos e taxas no pior caso", showPercent(result.worstRate)],
    ["Lucro antes do IR necessário", showPercent(result.preTaxProfit)],
    ["Venda com desconto = custo ×", showMultiplier(result.discountedMultiplier)],
    ["Despesas fixas por mês", showMoney(result.fixedMonthlyExpenses)],
    ["Faturamento de equilíbrio", showMoney(roundCents(result.breakEvenRevenue))],
  ];

  return (
    <>
      <h1 className="text-2xl font-semibold">{menuItem("parametros").label}</h1>
      <p className="mt-1 text-slate-600">Impostos, canal e política. Tudo que muda aqui recalcula a tabela inteira.</p>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ParamsForm saved={form} action={saveParamsAction} />

        <aside className="rounded-lg border border-slate-200 bg-white" aria-labelledby="resultado">
          <h2 id="resultado" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
            Resultado
          </h2>
          <div className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preço de tabela</p>
            <p className="mt-1 text-3xl font-bold">custo × {showMultiplier(result.tableMultiplier)}</p>
            <p className="text-sm text-slate-600">markup de {showPercent(result.markup)}</p>

            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-slate-600">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
              <div className="contents">
                <dt className="text-slate-600">Entrada mínima sugerida</dt>
                <dd className="flex items-center justify-end gap-2 font-medium">
                  {suggestion ? showPercent(suggestion.rate, 0) : "—"}
                  {suggestion && (
                    <form action={adoptSuggestedDownPaymentAction}>
                      <button type="submit" className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                        usar
                      </button>
                    </form>
                  )}
                </dd>
              </div>
            </dl>

            <p className="mt-4 text-xs text-slate-500">
              A conta: venda com desconto = custo ÷ (1 − impostos e taxas − lucro antes do IR). Tabela = isso ÷ (1 −
              desconto livre). Mudou algo? A equipe só vê depois de publicar.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

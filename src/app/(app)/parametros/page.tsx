import { LineTabs } from "@/components/LineTabs";
import { listLines } from "@/lib/db/product-lines";
import { LINE_PARAM, pickLine } from "@/lib/lines-view";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { menuItem } from "@/lib/auth/permissions";
import { loadApprovalPolicy, loadCommissionDay, loadLogoVersion, loadProposalSettings } from "@/lib/db/company";
import { ActionForm } from "../pedidos/ActionForm";
import { loadParams } from "@/lib/db/params";
import { listProductCosts } from "@/lib/db/products";
import { showMoney, showMultiplier, showPercent } from "@/lib/format";
import { paramsToForm } from "@/lib/params-form";
import { roundCents } from "@/lib/pricing/money";
import { paramsResult } from "@/lib/pricing/results";
import { adoptSuggestedDownPaymentAction, removeLogoAction, saveLogoAction, saveParamsAction, saveApprovalPolicyAction, saveCommissionDayAction, saveProposalSettingsAction } from "./actions";
import { LogoForm } from "./LogoForm";
import { ParamsForm } from "./ParamsForm";

export const metadata = { title: `${menuItem("parametros").label} · ERP` };
export const dynamic = "force-dynamic";

const TABS = [["inicio", "Cadastros"], ["precos", "Regra de preço"], ["empresa", "Empresa"], ["aprovacao", "Aprovação"]] as const;

/** Every register of the company, by subject. Each opens a screen of its own. */
const GROUPS: [title: string, links: [href: string, label: string, hint: string][]][] = [
  ["Vendas", [["/parametros/linhas", "Linhas de produto", "Grupos de equipamento, cada um com a sua regra de preço"], ["/parametros/formas-de-pagamento", "Formas de pagamento", "Pix, boleto, cartão e as taxas de cada uma"], ["/parametros/transportadoras", "Transportadoras", "Quem entrega, para a nota fiscal"], ["/parametros/contrato", "Contrato", "O modelo, a assinatura e a segurança"]]],
  ["Funil e clientes", [["/parametros/funil", "Etapas do funil", "Por onde a venda passa antes do pedido"], ["/parametros/mensagens", "Modelos de mensagem", "Textos prontos de e-mail"], ["/parametros/cadencias", "Cadências", "Sequências de e-mails e tarefas"], ["/parametros/automacoes", "Lembretes automáticos", "Orçamento parado, parcela vencendo"]]],
  ["Comunicação", [["/parametros/email", "E-mail", "Caixa de saída, texto da nota e respostas dos clientes"], ["/parametros/whatsapp", "WhatsApp", "A conta oficial da empresa na Meta"], ["/parametros/telefonia", "Telefonia", "Ligação pelo sistema"], ["/parametros/assistente", "Assistente", "Conexão com o Claude e inteligência artificial"]]],
  ["Financeiro e fiscal", [["/parametros/fiscal", "Fiscal e certificado", "Quem emite a nota e o certificado digital"], ["/parametros/categorias-de-contas", "Categorias de contas", "Como as contas a pagar são agrupadas"], ["/parametros/despesas-fixas", "Despesas fixas", "O que a empresa paga todo mês"]]],
  ["Equipe e sistemas", [["/parametros/usuarios", "Usuários e perfis", "Quem entra e o que cada um vê"], ["/parametros/producao", "Etapas da produção", "Por onde cada ordem passa na fábrica"], ["/parametros/integracoes", "Integrações", "Chaves e avisos para outros sistemas"]]],
];

export default async function ParametrosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);

  // One part at a time: the way to every register of the company, the price rule, the company's own data, the approval rules.
  const query = await searchParams;
  const asked = Array.isArray(query.ver) ? query.ver[0] : query.ver;
  // A link that names a line is a link to the price rule of that line.
  const tab = TABS.find(([key]) => key === asked)?.[0] ?? (query[LINE_PARAM] !== undefined ? "precos" : "inicio");
  // Each product line has its own parameters: the screen shows and saves one line at a time.
  const lines = await listLines(conn);
  const line = pickLine(lines, query[LINE_PARAM]);
  const [params, costs, logoVersion] = await Promise.all([loadParams(conn, line.id), listProductCosts(conn, line.id), loadLogoVersion(conn)]);
  const commissionDay = await loadCommissionDay(conn);
  const proposal = await loadProposalSettings(conn);
  const policy = await loadApprovalPolicy(conn);
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
      <nav aria-label="Partes dos parâmetros" className="mt-2 flex flex-wrap gap-x-1 border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/parametros?ver=${key}`}
            aria-current={key === tab ? "page" : undefined}
            className={`inline-flex min-h-[var(--control)] items-center border-b-2 px-3 text-sm font-medium ${key === tab ? "border-brand text-brand" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "inicio" && (
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {GROUPS.map(([title, links]) => (
            <section key={title} className="rounded-lg border border-slate-200 bg-white p-3" aria-label={title}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</h2>
              <ul className="mt-1 grid grid-cols-2 gap-x-2 md:grid-cols-1">
                {links.map(([href, label, hint]) => (
                  <li key={href}>
                    <Link href={href} className="flex min-h-[var(--control)] flex-col justify-center rounded px-1 py-1 hover:bg-slate-50">
                      <span className="font-medium text-brand">{label}</span>
                      <span className="text-xs text-slate-600 max-md:hidden">{hint}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {tab === "precos" && (
        <>
      <LineTabs lines={lines} current={line.id} path="/parametros" />
      {lines.length > 1 && <p className="mt-2 text-sm text-slate-600">Parâmetros da linha <strong>{line.name}</strong>. Logo, dia da comissão e regras de aprovação valem para a empresa toda.</p>}
          <div className="mt-3 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0">
            <ParamsForm key={line.id} lineId={line.id} imported={line.imported} saved={form} action={saveParamsAction} />
            </div>
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
                          <input type="hidden" name="lineId" value={line.id} />
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
      )}
      {tab === "empresa" && (
        <div className="mt-3 flex max-w-3xl flex-col gap-4">
          <LogoForm
            company={session.tenant.name}
            logo={logoVersion ? `/empresa/logo?v=${logoVersion.getTime()}` : null}
            save={saveLogoAction}
            remove={removeLogoAction}
          />
          <section className="rounded-lg border border-slate-200 bg-white p-5" aria-labelledby="dia-comissao">
            <h2 id="dia-comissao" className="text-sm font-semibold uppercase tracking-wide">
              Pagamento da comissão
            </h2>
            <ActionForm action={saveCommissionDayAction} className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="commission-day" className="block text-sm font-medium">
                  Dia do mês seguinte
                </label>
                <input
                  key={commissionDay}
                  id="commission-day"
                  name="day"
                  type="text"
                  inputMode="numeric"
                  defaultValue={commissionDay}
                  className="mt-1 w-20 rounded border border-slate-300 bg-white px-3 py-2 text-right outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                Salvar dia
              </button>
              <p className="basis-full text-xs text-slate-500">
                De 1 a 28. O que é recebido num mês é pago neste dia do mês seguinte. Vale para as comissões geradas daqui em diante.
              </p>
            </ActionForm>
          </section>
          <section className="rounded-lg border border-slate-200 bg-white p-5" aria-labelledby="dados-proposta">
            <h2 id="dados-proposta" className="text-sm font-semibold uppercase tracking-wide">
              Proposta
            </h2>
            <p className="mt-1 text-sm text-slate-600">No orçamento em PDF, o gerente comercial assina no rodapé, ao lado do cliente e do vendedor, e o local vai junto da data por extenso. Em branco, não aparecem.</p>
            <ActionForm action={saveProposalSettingsAction} className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="managerName" className="block text-sm font-medium">
                  Gerente comercial
                </label>
                <input key={proposal.managerName ?? ""} id="managerName" name="managerName" type="text" defaultValue={proposal.managerName ?? ""} autoComplete="off" className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div>
                <label htmlFor="place" className="block text-sm font-medium">
                  Local de emissão (cidade/UF)
                </label>
                <input key={proposal.place ?? ""} id="place" name="place" type="text" defaultValue={proposal.place ?? ""} placeholder="Ex.: Votuporanga/SP" autoComplete="off" className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
                  Salvar dados da proposta
                </button>
              </div>
            </ActionForm>
          </section>
        </div>
      )}
      {tab === "aprovacao" && (
        <div className="mt-3 max-w-3xl">
          <section className="rounded-lg border border-slate-200 bg-white p-5" aria-labelledby="regras-aprovacao">
            <h2 id="regras-aprovacao" className="text-sm font-semibold uppercase tracking-wide">
              Regras de aprovação
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Desconto acima do livre, entrada abaixo da política e pedido com prejuízo sempre pedem aprovação. O resto é escolha da empresa.
            </p>
            <ActionForm action={saveApprovalPolicyAction} className="mt-3 flex flex-col gap-3 text-sm">
              <label className="flex items-start gap-2">
                <input key={String(policy.belowTarget)} type="checkbox" name="belowTarget" value="sim" defaultChecked={policy.belowTarget} className="mt-1" />
                Pedido com lucro abaixo da meta precisa de aprovação
              </label>
              <label className="flex items-start gap-2">
                <input key={String(policy.freight)} type="checkbox" name="freight" value="sim" defaultChecked={policy.freight} className="mt-1" />
                Pedido com frete por nossa conta precisa de aprovação
              </label>
              <label className="flex items-start gap-2">
                <input
                  key={String(policy.directorSelfApproves)}
                  type="checkbox"
                  name="directorSelfApproves"
                  value="sim"
                  defaultChecked={policy.directorSelfApproves}
                  className="mt-1"
                />
                Quando a diretoria fecha um pedido fora da política, ele já fica aprovado
              </label>
              <div>
                <label htmlFor="managerLimit" className="block font-medium">
                  O gerente comercial aprova sozinho
                </label>
                <select
                  key={policy.managerLimit}
                  id="managerLimit"
                  name="managerLimit"
                  defaultValue={policy.managerLimit}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand sm:w-auto"
                >
                  <option value="lucro">qualquer pedido que ainda dê lucro</option>
                  <option value="meta">só pedido com lucro na meta; o resto vai para a diretoria</option>
                </select>
              </div>
              <div>
                <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-2 font-medium hover:bg-slate-50">
                  Salvar regras
                </button>
              </div>
            </ActionForm>
          </section>
        </div>
      )}
    </>
  );
}

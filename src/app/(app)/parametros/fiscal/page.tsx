import { LineTabs } from "@/components/LineTabs";
import { FitRows } from "@/components/FitRows";
import { cookies } from "next/headers";
import { rowsPerPage } from "@/lib/rows";
import { PasswordField } from "@/components/PasswordField";
import { loadFiscalRules, listPaymentCodes, missingFiscalRules, PAYMENT_CODES } from "@/lib/db/fiscal-rules";
import { listNumberVoids } from "@/lib/db/invoices";
import { listLines } from "@/lib/db/product-lines";
import { LINE_PARAM, pickLine } from "@/lib/lines-view";
import Link from "next/link";
import { CARD, DANGER, DANGER_OUTLINE, INPUT, LABEL, PRIMARY, SECONDARY, PageHeader, Pager, pageOf } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { formatDocument } from "@/lib/customer";
import { loadCertificateInfo, loadDanfeReformDate, loadFiscalSettings, missingFiscalData, TAX_REGIMES } from "@/lib/db/fiscal";
import { tenantDb } from "@/lib/db/pool";
import { formatPercent, isoDate, showDate, showDateTime } from "@/lib/format";
import { UF_NAMES } from "@/lib/order-form";
import { parseDate } from "@/lib/pricing/payment";
import { UFS } from "@/lib/pricing/states";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { completeFiscalCompanyAction, completePaymentCodesAction, prepareSaleOperationAction, removeCertificateAction, saveCertificateAction, saveDanfeReformDateAction, saveFiscalRulesAction, saveFiscalSettingsAction, savePaymentCodeAction, voidNumbersAction } from "./actions";

export const metadata = { title: "Fiscal · ERP" };
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const HERE = "/parametros/fiscal";
const PAYMENT_ROWS_COOKIE = "erp_linhas_pagamentos_fiscais";

export default async function FiscalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const settings = await loadFiscalSettings(conn);
  const certificate = await loadCertificateInfo(conn);
  const missing = missingFiscalData(settings);
  // The rules of the invoice are of one product line: imported and national goods are taxed differently.
  const lines = await listLines(conn);
  const query = await searchParams;
  const line = pickLine(lines, query[LINE_PARAM]);
  const rules = await loadFiscalRules(line.id, conn);
  const missingRules = missingFiscalRules(rules);
  const paymentCodes = await listPaymentCodes(conn);
  const voids = await listNumberVoids(conn);
  const reformFrom = await loadDanfeReformDate(conn);
  const simples = settings.taxRegime === 1;
  const ruleFields = [
    ["operationNature", "Natureza da operação", rules.operationNature, "Ex.: Venda de mercadoria", "sm:col-span-2"],
    ["cfopInternal", "CFOP dentro do estado", rules.cfopInternal, "Ex.: 5102", ""],
    ["cfopInterstate", "CFOP para contribuinte de outro estado", rules.cfopInterstate, "Ex.: 6102", ""],
    ["cfopInterstateNonTaxpayer", "CFOP para não contribuinte de outro estado", rules.cfopInterstateNonTaxpayer, "Ex.: 6108", ""],
    ["icmsCode", simples ? "CSOSN do ICMS (Simples Nacional)" : "CST do ICMS", rules.icmsCode, simples ? "Ex.: 102" : "Ex.: 00", ""],
    ["ipiCst", "CST do IPI (obrigatório quando há IPI no pedido)", rules.ipiCst, "Ex.: 50", ""],
    ["ipiFrameCode", "Código de enquadramento do IPI", rules.ipiFrameCode, "999", ""],
    ["pisCst", "CST do PIS", rules.pisCst, "Ex.: 01", ""],
    ["pisRate", "Alíquota do PIS (%)", formatPercent(rules.pisRate), "Ex.: 0,65", ""],
    ["cofinsCst", "CST da COFINS", rules.cofinsCst, "Ex.: 01", ""],
    ["cofinsRate", "Alíquota da COFINS (%)", formatPercent(rules.cofinsRate), "Ex.: 3", ""],
    ["ibsCbsCst", "CST do IBS/CBS (reforma tributária)", rules.ibsCbsCst, "Ex.: 000", ""],
    ["ibsCbsClass", "Classificação tributária do IBS/CBS (cClassTrib)", rules.ibsCbsClass, "Ex.: 000001", ""],
    ["ibsStateRate", "Alíquota do IBS estadual (%)", formatPercent(rules.ibsStateRate), "0,1 em 2026", ""],
    ["ibsCityRate", "Alíquota do IBS municipal (%)", formatPercent(rules.ibsCityRate), "0 em 2026", ""],
    ["cbsRate", "Alíquota da CBS (%)", formatPercent(rules.cbsRate), "0,9 em 2026", ""],
  ] as const;
  // One part at a time: the certificate, who issues, the rules of the invoice of each line and its numbering.
  const TABS = [
    ["consulta", "Consultar CNPJ"],
    ["certificado", certificate ? "Certificado" : "Certificado · falta"],
    ["emitente", missing.length > 0 ? "Emitente · falta" : "Emitente"],
    ["regras", missingRules.length > 0 ? "Regras da nota · falta" : "Regras da nota"],
    ["pagamentos", "Pagamentos"],
    ["numeracao", "Numeração"],
  ] as const;
  const asked = query.ver;
  const tab = TABS.find(([key]) => key === (Array.isArray(asked) ? asked[0] : asked))?.[0] ?? TABS[0][0];
  const paymentSize = rowsPerPage((await cookies()).get(PAYMENT_ROWS_COOKIE)?.value ?? "1", 1);
  const paymentPage = pageOf(paymentCodes, typeof query.pagina === "string" ? query.pagina : undefined, paymentSize);
  const today = isoDate(new Date());
  const daysLeft = certificate ? Math.round((parseDate(isoDate(certificate.validUntil)) - parseDate(today)) / DAY_MS) : null;

  const fields = [
    ["legalName", "Razão social", settings.legalName, "sm:col-span-2"],
    ["cnpj", "CNPJ", settings.cnpj ? formatDocument(settings.cnpj) : "", ""],
    ["stateRegistration", "Inscrição estadual", settings.stateRegistration, ""],
    ["street", "Endereço", settings.street, ""],
    ["streetNumber", "Número", settings.streetNumber, ""],
    ["district", "Bairro", settings.district, ""],
    ["cep", "CEP", settings.cep, ""],
    ["city", "Cidade", settings.city, ""],
    ["cityCode", "Código IBGE da cidade (em branco: acha pelo nome)", settings.cityCode, ""],
  ] as const;

  return (
    <>
      <PageHeader title="Fiscal" hint="Preparação da nota." actions={
        <Link href={menuItem("parametros").href} className={SECONDARY}>← {menuItem("parametros").label}</Link>
      } />

      <details key={tab} className="mt-3 sm:hidden">
        <summary className="min-h-[var(--control)] cursor-pointer py-3 font-medium text-brand">{TABS.find(([key]) => key === tab)?.[1]} · trocar</summary>
        <nav aria-label="Partes do fiscal no celular" className="grid grid-cols-2 gap-1">
          {TABS.map(([key, label]) => <Link key={key} href={key === TABS[0][0] ? HERE : `${HERE}?ver=${key}`} aria-current={key === tab ? "page" : undefined} className={SECONDARY}>{label}</Link>)}
        </nav>
      </details>
      <nav aria-label="Partes do fiscal" className="mt-4 hidden flex-wrap gap-x-1 border-b border-slate-200 sm:flex">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={key === TABS[0][0] ? HERE : `${HERE}?ver=${key}`}
            aria-current={key === tab ? "page" : undefined}
            className={`inline-flex min-h-[var(--control)] items-center border-b-2 px-3 text-sm font-medium ${key === tab ? "border-brand text-brand" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "certificado" && (
        <section className={`${CARD} mt-4 p-5`} aria-labelledby="certificado">
          <h2 id="certificado" className="text-sm font-semibold uppercase tracking-wide">
            Certificado digital A1
          </h2>
          {certificate ? (
            <div className="mt-3 text-sm">
              <p className="text-base font-semibold">{certificate.subject}</p>
              <p className="text-slate-700">
                {certificate.holderCnpj ? `CNPJ ${formatDocument(certificate.holderCnpj)} · ` : ""}válido até {showDate(certificate.validUntil)}
              </p>
              <p className={`mt-1 ${daysLeft !== null && daysLeft <= 30 ? "font-medium text-red-700" : "text-slate-600"}`}>
                {daysLeft !== null && daysLeft < 0 ? "Vencido: envie o novo." : `Faltam ${daysLeft} dias para vencer.`}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Enviado por {certificate.uploadedBy} em {showDateTime(certificate.uploadedAt)} · identificação {certificate.fingerprint.slice(0, 16)}…
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-700">Nenhum certificado enviado.</p>
          )}
          <p className="mt-3 max-w-3xl text-xs text-slate-500">
            O arquivo e a senha ficam guardados cifrados e não são mostrados nem baixados de volta por ninguém. Para trocar, envie o novo: ele
            substitui o anterior.
          </p>
          <ActionForm action={saveCertificateAction} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="certificate" className={LABEL}>
                Arquivo (.pfx ou .p12)
              </label>
              {/* No `accept`: on an iPhone a file whose kind the phone does not recognise (a .pfx saved from WhatsApp or e-mail) shows greyed out and cannot be chosen. What is sent is checked on the server. */}
              <input id="certificate" name="certificate" type="file" className="mt-1 w-full text-sm file:mr-3 file:min-h-[var(--control)] file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-4 file:font-medium" />
            </div>
            <div>
              <label htmlFor="password" className={LABEL}>
                Senha do certificado
              </label>
              <PasswordField id="password" name="password" className={INPUT} />
            </div>
            <button type="submit" className={PRIMARY}>
              {certificate ? "Trocar certificado" : "Enviar certificado"}
            </button>
          </ActionForm>
          {certificate && (
            <ActionForm action={removeCertificateAction} className="mt-3">
              <ConfirmButton label="Remover certificado" confirmLabel="Confirmar: remover" className={DANGER} />
            </ActionForm>
          )}
        </section>
      )}

      {tab === "consulta" && (
        <section className={`${CARD} mt-3 p-4`} aria-labelledby="consulta">
          <h2 id="consulta" className="text-sm font-semibold uppercase tracking-wide">Completar cadastro pelo CNPJ</h2>
          <ActionForm action={completeFiscalCompanyAction} className="mt-3 space-y-3">
            <div>
              <label htmlFor="lookupCnpj" className={LABEL}>CNPJ da empresa</label>
              <input id="lookupCnpj" name="lookupCnpj" defaultValue={settings.cnpj ? formatDocument(settings.cnpj) : ""} readOnly={Boolean(settings.cnpj)} autoComplete="off" className={INPUT} />
            </div>
            <label className="flex min-h-[var(--control)] items-start gap-2 py-2 text-sm">
              <input type="checkbox" name="applyRegime" value="sim" className="mt-1" />
              <span>Completar também o regime tributário, quando informado e ainda vazio.</span>
            </label>
            <button type="submit" className={PRIMARY}>Consultar e completar</button>
          </ActionForm>
          <details className="mt-2 text-sm text-slate-600">
            <summary className="min-h-[var(--control)] cursor-pointer py-3 text-brand">Ver fonte e limites da consulta</summary>
            <p>Preenche apenas campos vazios e preserva os dados cadastrados. Consulta BrasilAPI e, se indisponível, CNPJ.ws, com dados públicos da Receita. Confirme sublimite do Simples com a contabilidade. MEI e o tratamento fiscal dos produtos não são definidos automaticamente.</p>
          </details>
        </section>
      )}

      {tab === "emitente" && (
        <section className={`${CARD} mt-4 p-5`} aria-labelledby="emitente">
          <h2 id="emitente" className="text-sm font-semibold uppercase tracking-wide">
            Quem emite a nota
          </h2>
          {missing.length > 0 && (
            <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">Para emitir, faltam: {missing.join(", ")}.</p>
          )}
          <ActionForm action={saveFiscalSettingsAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            {fields.map(([key, label, value, span]) => (
              <div key={key} className={span}>
                <label htmlFor={key} className={LABEL}>
                  {label}
                </label>
                <input id={key} name={key} type="text" defaultValue={value ?? ""} autoComplete="off" className={INPUT} />
              </div>
            ))}
            <div>
              <label htmlFor="uf" className={LABEL}>
                UF
              </label>
              <select key={settings.uf ?? ""} id="uf" name="uf" defaultValue={settings.uf ?? ""} className={INPUT}>
                <option value="">—</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf} — {UF_NAMES[uf]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="taxRegime" className={LABEL}>
                Regime tributário
              </label>
              <select key={settings.taxRegime ?? ""} id="taxRegime" name="taxRegime" defaultValue={settings.taxRegime ?? ""} className={INPUT}>
                <option value="">—</option>
                {TAX_REGIMES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="series" className={LABEL}>
                Série da nota
              </label>
              <input id="series" name="series" type="text" inputMode="numeric" defaultValue={settings.series} className={INPUT} />
            </div>
            <div>
              <label htmlFor="nextNumber" className={LABEL}>
                Próximo número da nota
              </label>
              <input id="nextNumber" name="nextNumber" type="text" inputMode="numeric" defaultValue={settings.nextNumber} className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="environment" className={LABEL}>
                Ambiente
              </label>
              <select key={settings.environment} id="environment" name="environment" defaultValue={settings.environment} className={INPUT}>
                <option value="homologacao">Homologação (testes, sem valor fiscal)</option>
                <option value="producao">Produção (notas valendo)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className={PRIMARY}>
                Salvar dados fiscais
              </button>
            </div>
          </ActionForm>
        </section>
      )}

      {tab === "regras" && (
        <>
          <section className={`${CARD} mt-4 p-5`} aria-labelledby="regras">
            <h2 id="regras" className="text-sm font-semibold uppercase tracking-wide">
              Regras fiscais da nota{lines.length > 1 ? ` · linha ${line.name}` : ""}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              O que o contador define para a venda desta linha. Os exemplos são só o formato: nenhum código vem preenchido pelo sistema. As
              alíquotas de ICMS e o IPI vêm dos Parâmetros da linha.
            </p>
            <LineTabs lines={lines} current={line.id} path={HERE} others={{ ver: "regras" }} />
            <ActionForm action={prepareSaleOperationAction} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="lineId" value={line.id} />
              <div className="min-w-0 flex-1">
                <label htmlFor="operation" className={LABEL}>Operação comum desta linha</label>
                <select id="operation" name="operation" defaultValue="" className={INPUT}>
                  <option value="">— escolher com a contabilidade —</option>
                  <option value="revenda">Revenda de mercadoria de terceiros</option>
                  <option value="producao">Venda de produção própria</option>
                </select>
              </div>
              <button type="submit" className={SECONDARY}>Completar CFOPs vazios</button>
            </ActionForm>
            {missingRules.length > 0 && (
              <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Para emitir nota desta linha, faltam: {missingRules.join(", ")}.
              </p>
            )}
            <ActionForm key={line.id} action={saveFiscalRulesAction} className="mt-4 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="lineId" value={line.id} />
              {ruleFields.map(([key, label, value, placeholder, span]) => (
                <div key={key} className={span}>
                  <label htmlFor={key} className={LABEL}>
                    {label}
                  </label>
                  <input id={key} name={key} type="text" defaultValue={value ?? ""} placeholder={placeholder} autoComplete="off" className={INPUT} />
                </div>
              ))}
              <label className="flex min-h-[var(--control)] items-start gap-2 py-2.5 text-sm sm:col-span-2">
                <input type="checkbox" name="finalConsumer" value="sim" defaultChecked={rules.finalConsumer} className="mt-1" />
                <span>
                  O cliente é consumidor final (usa o equipamento, não revende). É o que leva o DIFAL para a nota quando ele não é contribuinte e
                  está em outro estado.
                </span>
              </label>
              <label className="flex min-h-[var(--control)] items-start gap-2 py-2.5 text-sm sm:col-span-2">
                <input type="checkbox" name="ipiInIcmsBase" value="sim" defaultChecked={rules.ipiInIcmsBase} className="mt-1" />
                <span>Na venda para consumidor final, o IPI entra na base de cálculo do ICMS.</span>
              </label>
              <label className="flex min-h-[var(--control)] items-start gap-2 py-2.5 text-sm sm:col-span-2">
                <input type="checkbox" name="icmsOutOfContributions" value="sim" defaultChecked={rules.icmsOutOfContributions} className="mt-1" />
                <span>O ICMS destacado na nota sai da base de cálculo do PIS e da COFINS (Lei 14.592/2023). Desmarque só se o contador pedir.</span>
              </label>
              <div className="sm:col-span-2">
                <label htmlFor="additionalInfo" className={LABEL}>
                  Informações complementares (texto fixo da nota)
                </label>
                <textarea id="additionalInfo" name="additionalInfo" rows={3} defaultValue={rules.additionalInfo ?? ""} className={`${INPUT} py-2`} />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className={PRIMARY}>
                  Salvar regras fiscais
                </button>
              </div>
            </ActionForm>
          </section>

        </>
      )}

      {tab === "pagamentos" && (
          <section className={`${CARD} mt-4`} aria-labelledby="pagamento-na-nota">
            <h2 id="pagamento-na-nota" className="border-b border-slate-200 px-5 py-2 text-sm font-semibold uppercase tracking-wide">
              Forma de pagamento na nota
            </h2>
            <ActionForm action={completePaymentCodesAction} className="px-5 pt-3">
              <button type="submit" className={PRIMARY}>Completar códigos conhecidos</button>
            </ActionForm>
            <ul id="pagamentos-fiscais" className="px-5 pb-3">
              {paymentPage.rows.map((method) => (
                <li key={method.id} data-row className="border-t border-slate-200 py-3 first:border-t-0">
                  <ActionForm action={savePaymentCodeAction} className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="id" value={method.id} />
                    <span className="min-w-0 flex-1 font-medium">
                      {method.label}
                      {!method.active && <span className="ml-2 text-xs font-normal text-slate-500">desligada</span>}
                    </span>
                    <select key={method.code ?? ""} name="code" defaultValue={method.code ?? ""} aria-label={`Forma na nota de ${method.label}`} className="min-h-[var(--control)] w-full min-w-0 rounded border border-slate-300 bg-white px-3 sm:w-auto">
                      <option value="">— escolher —</option>
                      {PAYMENT_CODES.map(([code, label]) => (
                        <option key={code} value={code}>
                          {code} · {label}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className={SECONDARY}>
                      Salvar
                    </button>
                  </ActionForm>
                </li>
              ))}
            </ul>
            <Pager {...paymentPage} noun={["forma", "formas"]} hrefFor={(page) => `${HERE}?ver=pagamentos&pagina=${page}`} />
            <FitRows listId="pagamentos-fiscais" shown={paymentSize} minimum={1} cookieName={PAYMENT_ROWS_COOKIE} />
          </section>
      )}

      {tab === "numeracao" && (
        <>
          <section className={`${CARD} mt-4 p-5`} aria-labelledby="danfe-reforma">
            <h2 id="danfe-reforma" className="text-sm font-semibold uppercase tracking-wide">
              DANFE da reforma tributária
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              A partir desta data de emissão, o DANFE sai no leiaute novo (Nota Técnica 2026.010): regime tributário do emitente, bloco &quot;Total do IBS / CBS / IS&quot; e
              os tributos da reforma em cada item. A SEFAZ tornou o leiaute obrigatório em 01/12/2026; pode ser adiantado para conferir. Só o papel muda: o XML da
              nota é o mesmo.
            </p>
            <ActionForm action={saveDanfeReformDateAction} className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="reformFrom" className={LABEL}>
                  Leiaute novo para notas emitidas a partir de
                </label>
                <input key={reformFrom} id="reformFrom" name="reformFrom" type="date" defaultValue={reformFrom} className={INPUT} />
              </div>
              <button type="submit" className={PRIMARY}>
                Salvar data
              </button>
            </ActionForm>
          </section>

          <section className={`${CARD} mt-6 p-5`} aria-labelledby="inutilizar">
            <h2 id="inutilizar" className="text-sm font-semibold uppercase tracking-wide">
              Inutilizar numeração
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Para número de nota que foi pulado e nunca será emitido. A SEFAZ registra e não tem volta. Vale para o ambiente atual (
              {settings.environment === "producao" ? "produção" : "homologação"}); o próximo número da empresa é o {settings.nextNumber}.
            </p>
            <ActionForm action={voidNumbersAction} className="mt-4 grid gap-4 sm:grid-cols-3">
              {(
                [
                  ["void-series", "series", "Série", String(settings.series)],
                  ["void-first", "first", "Do número", ""],
                  ["void-last", "last", "Até o número", ""],
                ] as const
              ).map(([id, name, label, value]) => (
                <div key={id}>
                  <label htmlFor={id} className={LABEL}>
                    {label}
                  </label>
                  <input id={id} name={name} type="text" inputMode="numeric" defaultValue={value} autoComplete="off" className={INPUT} />
                </div>
              ))}
              <div className="sm:col-span-3">
                <label htmlFor="void-reason" className={LABEL}>
                  Motivo (15 a 255 letras)
                </label>
                <input id="void-reason" name="reason" type="text" autoComplete="off" placeholder="Ex.: Numeração pulada por falha na emissão." className={INPUT} />
              </div>
              <div className="sm:col-span-3">
                <ConfirmButton label="Inutilizar numeração" confirmLabel="Confirmar: inutilizar na SEFAZ" className={DANGER_OUTLINE} />
              </div>
            </ActionForm>
            {voids.length > 0 && (
              <ul className="mt-4 text-sm">
                {voids.map((item) => (
                  <li key={item.id} className="border-t border-slate-200 py-2">
                    <strong>
                      Série {item.series}, {item.first} a {item.last}
                    </strong>
                    {item.environment === "homologacao" && " · homologação"} · protocolo {item.protocol} · {showDateTime(item.createdAt)} · {item.reason}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

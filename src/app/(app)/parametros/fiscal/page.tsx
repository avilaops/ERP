import { LineTabs } from "@/components/LineTabs";
import { PasswordField } from "@/components/PasswordField";
import { loadFiscalRules, listPaymentCodes, missingFiscalRules, PAYMENT_CODES } from "@/lib/db/fiscal-rules";
import { listNumberVoids } from "@/lib/db/invoices";
import { listLines } from "@/lib/db/product-lines";
import { LINE_PARAM, pickLine } from "@/lib/lines-view";
import Link from "next/link";
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
import { removeCertificateAction, saveCertificateAction, saveDanfeReformDateAction, saveFiscalRulesAction, saveFiscalSettingsAction, savePaymentCodeAction, voidNumbersAction } from "./actions";

export const metadata = { title: "Fiscal · ERP" };
export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-slate-200 bg-white";
const INPUT = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";
const LABEL = "block text-sm font-medium";
const DAY_MS = 86_400_000;

export default async function FiscalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const settings = await loadFiscalSettings(conn);
  const certificate = await loadCertificateInfo(conn);
  const missing = missingFiscalData(settings);
  // The rules of the invoice are of one product line: imported and national goods are taxed differently.
  const lines = await listLines(conn);
  const line = pickLine(lines, (await searchParams)[LINE_PARAM]);
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
    ["ipiCst", "CST do IPI (em branco: nota sem IPI)", rules.ipiCst, "Ex.: 50", ""],
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
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className="text-brand underline">
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Fiscal</h1>
      <p className="mt-1 max-w-3xl text-slate-600">
        Os dados de quem emite a nota e o certificado digital. É a base da nota fiscal eletrônica: a emissão ainda não está ligada, e
        nada aqui gera nota.
      </p>

      <section className={`${CARD} mt-6 p-5`} aria-labelledby="certificado">
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
            <input id="certificate" name="certificate" type="file" className="mt-1 w-full text-sm" />
          </div>
          <div>
            <label htmlFor="password" className={LABEL}>
              Senha do certificado
            </label>
            <PasswordField id="password" name="password" className={INPUT} />
          </div>
          <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
            {certificate ? "Trocar certificado" : "Enviar certificado"}
          </button>
        </ActionForm>
        {certificate && (
          <ActionForm action={removeCertificateAction} className="mt-3">
            <ConfirmButton label="Remover certificado" confirmLabel="Confirmar: remover" className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50" />
          </ActionForm>
        )}
      </section>

      <section className={`${CARD} mt-6 p-5`} aria-labelledby="emitente">
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
            <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
              Salvar dados fiscais
            </button>
          </div>
        </ActionForm>
      </section>

      <section className={`${CARD} mt-6 p-5`} aria-labelledby="regras">
        <h2 id="regras" className="text-sm font-semibold uppercase tracking-wide">
          Regras fiscais da nota{lines.length > 1 ? ` · linha ${line.name}` : ""}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          O que o contador define para a venda desta linha. Os exemplos são só o formato: nenhum código vem preenchido pelo sistema. As
          alíquotas de ICMS e o IPI vêm dos Parâmetros da linha.
        </p>
        <LineTabs lines={lines} current={line.id} path="/parametros/fiscal" />
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
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="finalConsumer" value="sim" defaultChecked={rules.finalConsumer} className="mt-1" />
            <span>
              O cliente é consumidor final (usa o equipamento, não revende). É o que leva o DIFAL para a nota quando ele não é contribuinte e
              está em outro estado.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="ipiInIcmsBase" value="sim" defaultChecked={rules.ipiInIcmsBase} className="mt-1" />
            <span>Na venda para consumidor final, o IPI entra na base de cálculo do ICMS.</span>
          </label>
          <div className="sm:col-span-2">
            <label htmlFor="additionalInfo" className={LABEL}>
              Informações complementares (texto fixo da nota)
            </label>
            <textarea id="additionalInfo" name="additionalInfo" rows={3} defaultValue={rules.additionalInfo ?? ""} className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
              Salvar regras fiscais
            </button>
          </div>
        </ActionForm>
      </section>

      <section className={`${CARD} mt-6 p-5`} aria-labelledby="danfe-reforma">
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
          <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
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
            <ConfirmButton label="Inutilizar numeração" confirmLabel="Confirmar: inutilizar na SEFAZ" className="rounded border border-red-300 bg-white px-4 py-2 font-medium text-red-700 hover:bg-red-50" />
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

      <section className={`${CARD} mt-6`} aria-labelledby="pagamento-na-nota">
        <h2 id="pagamento-na-nota" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
          Forma de pagamento na nota
        </h2>
        <p className="px-5 pt-3 text-sm text-slate-600">Como cada forma de pagamento da empresa aparece na nota fiscal.</p>
        <ul className="px-5 pb-3">
          {paymentCodes.map((method) => (
            <li key={method.id} className="border-t border-slate-200 py-3 first:border-t-0">
              <ActionForm action={savePaymentCodeAction} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={method.id} />
                <span className="min-w-0 flex-1 font-medium">
                  {method.label}
                  {!method.active && <span className="ml-2 text-xs font-normal text-slate-500">desligada</span>}
                </span>
                <select key={method.code ?? ""} name="code" defaultValue={method.code ?? ""} aria-label={`Forma na nota de ${method.label}`} className="rounded border border-slate-300 bg-white px-3 py-2">
                  <option value="">— escolher —</option>
                  {PAYMENT_CODES.map(([code, label]) => (
                    <option key={code} value={code}>
                      {code} · {label}
                    </option>
                  ))}
                </select>
                <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                  Salvar
                </button>
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

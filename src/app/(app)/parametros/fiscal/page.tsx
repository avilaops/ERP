import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { formatDocument } from "@/lib/customer";
import { loadCertificateInfo, loadFiscalSettings, missingFiscalData, TAX_REGIMES } from "@/lib/db/fiscal";
import { tenantDb } from "@/lib/db/pool";
import { isoDate, showDate, showDateTime } from "@/lib/format";
import { UF_NAMES } from "@/lib/order-form";
import { parseDate } from "@/lib/pricing/payment";
import { UFS } from "@/lib/pricing/states";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { removeCertificateAction, saveCertificateAction, saveFiscalSettingsAction } from "./actions";

export const metadata = { title: "Fiscal · ERP" };
export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-slate-200 bg-white";
const INPUT = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";
const LABEL = "block text-sm font-medium";
const DAY_MS = 86_400_000;

export default async function FiscalPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const settings = await loadFiscalSettings(conn);
  const certificate = await loadCertificateInfo(conn);
  const missing = missingFiscalData(settings);
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
    ["cityCode", "Código IBGE da cidade (7 dígitos)", settings.cityCode, ""],
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
            <input id="certificate" name="certificate" type="file" accept=".pfx,.p12,application/x-pkcs12" className="mt-1 w-full text-sm" />
          </div>
          <div>
            <label htmlFor="password" className={LABEL}>
              Senha do certificado
            </label>
            <input id="password" name="password" type="password" autoComplete="off" className={INPUT} />
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
    </>
  );
}

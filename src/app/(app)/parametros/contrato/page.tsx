import { FormSteps } from "@/components/FormSteps";
import Link from "next/link";
import { CARD, INPUT, PRIMARY, SECONDARY, SectionDisclosure, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { CONTRACT_WORDS, DEFAULT_CONTRACT_BODY, DEFAULT_CONTRACT_TITLE } from "@/lib/contract/text";
import { DEFAULT_CONTRACT_MAIL_BODY, DEFAULT_CONTRACT_MAIL_SUBJECT, loadContractSettings } from "@/lib/db/contracts";
import { smsAvailable } from "@/lib/contract/sms";
import { loadCertificateInfo } from "@/lib/db/fiscal";
import { defaultMailbox, loadMailInfo } from "@/lib/db/mail";
import { showDate } from "@/lib/format";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { importContractModelAction, saveContractSettingsAction } from "./actions";

export const metadata = { title: "Contrato · ERP" };
export const dynamic = "force-dynamic";

const LABEL = "block text-xs font-medium text-slate-600";

export default async function ContractSettingsPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const settings = await loadContractSettings(conn);
  // What each protection depends on, said next to its switch: a switch that cannot work is not a surprise later.
  const certificate = await loadCertificateInfo(conn);
  const now = new Date();
  const certificateValid = certificate !== null && certificate.validUntil.getTime() > now.getTime();
  const hasSms = smsAvailable(process.env);
  const hasMailbox = (await loadMailInfo(conn)).own !== null || defaultMailbox(process.env) !== null;

  return (
    <>
      <PageHeader title="Contrato" actions={<Link href={menuItem("parametros").href} className={SECONDARY}>← Configurações</Link>} />
      <SectionDisclosure title="Ajuda e importação" className="mt-2">
      <details className="mt-1 max-w-3xl text-sm text-slate-600"><summary className="inline-flex min-h-[var(--control)] cursor-pointer items-center text-brand">Como funciona</summary><p className="pb-3">
        Depois que o pedido é fechado, o contrato sai deste modelo, preenchido com os dados do pedido, e vai para o cliente assinar por um link no e-mail. O
        cliente confirma com nome, CPF e um código enviado ao e-mail dele; o sistema guarda data, hora e endereço de rede de cada passo e junta esse
        registro ao PDF assinado.
      </p></details>


      <SectionDisclosure title="Importar um modelo de contrato" className="mt-3">
        <h2 id="arquivo" className="text-sm font-semibold uppercase tracking-wide">
          Já tem o contrato em Word?
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Envie o arquivo (.docx ou .txt) e o texto dele vira o modelo abaixo. Negrito, fontes e imagens não vêm: o contrato sai no padrão do sistema, com a sua
          logo. Depois é só marcar onde entram os dados do pedido, com os campos entre chaves.
        </p>
        <ActionForm action={importContractModelAction} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="file" className={LABEL}>
              Arquivo do contrato
            </label>
            <input id="file" name="file" type="file" accept=".docx,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className={INPUT} />
          </div>
          {settings.body ? (
            <ConfirmButton label="Usar este arquivo como modelo" confirmLabel="Confirmar: trocar o texto atual" className={SECONDARY} />
          ) : (
            <button type="submit" className={SECONDARY}>
              Usar este arquivo como modelo
            </button>
          )}
        </ActionForm>
      </SectionDisclosure>
      </SectionDisclosure>

      <ActionForm action={saveContractSettingsAction} className="mt-3 flex flex-col gap-2">
        <FormSteps steps={[{ title: "Título do modelo", content: (<section key="modelo" className={`${CARD} p-5`} aria-labelledby="modelo">
          <h2 id="modelo" className="sr-only">
            Modelo do contrato
          </h2>

          <div className="grid gap-3">
            <div>
              <label htmlFor="title" className={LABEL}>
                Título
              </label>
              <input key={settings.title ?? ""} id="title" name="title" type="text" defaultValue={settings.title ?? ""} placeholder={DEFAULT_CONTRACT_TITLE} autoComplete="off" className={INPUT} />
            </div>
          </div>
        </section>) },
{ title: "Texto do contrato", content: (<section key="texto" className={`${CARD} p-5`} aria-label="Texto do contrato">
            <div>
              <label htmlFor="body" className={LABEL}>
                Texto do contrato
              </label>
              <textarea key={settings.body ?? ""} id="body" name="body" rows={3} defaultValue={settings.body ?? ""} placeholder={DEFAULT_CONTRACT_BODY} className={`${INPUT} py-2 font-mono text-sm`} />
            </div>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer font-medium text-brand">Campos que o sistema preenche ({CONTRACT_WORDS.length})</summary>
            <p className="mt-2">Comece uma linha por “# ” para título de seção ou por “- ” para item de lista.</p>
<p className="mt-1 max-w-3xl text-sm text-slate-600">
            Em branco, vale o texto padrão que aparece em cinza: ele só identifica as partes, o que é vendido, o valor e o prazo, e traz a cláusula em que as
            partes aceitam a assinatura eletrônica. As cláusulas da sua empresa (garantia, multa, foro, entrega) entram aqui, com o texto do seu advogado. Mantenha
            a cláusula da assinatura eletrônica.
          </p>
            <p className="mt-2 text-slate-600">Escreva o campo entre chaves no texto. O que o pedido não tiver fica em branco, e a tela do pedido avisa antes de enviar.</p>
            <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {CONTRACT_WORDS.map(([word, meaning]) => (
                <div key={word} className="flex gap-2">
                  <dt className="shrink-0 font-mono text-slate-900">{`{${word}}`}</dt>
                  <dd className="text-slate-600">{meaning}</dd>
                </div>
              ))}
            </dl>
          </details>
        </section>) },
{ title: "Envio ao cliente", content: (<section key="envio" className={`${CARD} p-4`} aria-labelledby="envio">
{!hasMailbox && (
        <p className="mt-3 max-w-3xl rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Ainda não há caixa de saída de e-mail: sem ela o contrato não é enviado. Veja{" "}
          <Link href="/parametros/email" className="underline">
            E-mail das notas
          </Link>
          .
        </p>
      )}
          <h2 id="envio" className="sr-only">
            Envio ao cliente
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <div>
              <label htmlFor="linkDays" className={LABEL}>
                Validade do link (dias)
              </label>
              <input key={settings.linkDays} id="linkDays" name="linkDays" type="text" inputMode="numeric" defaultValue={settings.linkDays} autoComplete="off" className={INPUT} />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="mailSubject" className={LABEL}>
                Assunto do e-mail
              </label>
              <input key={settings.mailSubject ?? ""} id="mailSubject" name="mailSubject" type="text" defaultValue={settings.mailSubject ?? ""} placeholder={DEFAULT_CONTRACT_MAIL_SUBJECT} autoComplete="off" className={INPUT} />
            </div>
          </div>
        </section>) },
{ title: "Mensagem do e-mail", content: (<section key="mensagem" className={`${CARD} p-5`} aria-label="Mensagem do e-mail">
            <div>
              <label htmlFor="mailBody" className={LABEL}>
                Texto do e-mail: {"{empresa}"}, {"{cliente}"}, {"{pedido}"}, {"{validade}"} e {"{link}"} (obrigatório) são trocados pelos dados do contrato
              </label>
              <textarea key={settings.mailBody ?? ""} id="mailBody" name="mailBody" rows={4} defaultValue={settings.mailBody ?? ""} placeholder={DEFAULT_CONTRACT_MAIL_BODY} className={`${INPUT} py-2`} />
            </div>
        </section>) },
{ title: "Segurança", content: (<section key="seguranca" className={`${CARD} p-5`} aria-labelledby="seguranca">
          <h2 id="seguranca" className="sr-only">
            Segurança
          </h2>
          <div className="flex flex-col gap-3">
            <div className="sm:max-w-xs">
              <label htmlFor="downloadDays" className={LABEL}>
                Depois de assinado, o link do cliente entrega o PDF por (dias)
              </label>
              <input key={settings.downloadDays} id="downloadDays" name="downloadDays" type="text" inputMode="numeric" defaultValue={settings.downloadDays} autoComplete="off" className={INPUT} />
              <p className="mt-1 text-xs text-slate-600">Passado o prazo, ou se o link venceu sem assinatura, o endereço não entrega mais nada. A empresa continua baixando pelo pedido.</p>
            </div>
          </div>
        </section>) },
{ title: "Selo digital", content: (<section key="selo" className={`${CARD} p-4`} aria-label="Selo digital">
            <label className="flex items-start gap-3">
              <input type="hidden" name="seal" value="sim" /><span className="mt-1 shrink-0 whitespace-nowrap text-sm font-semibold text-brand">Obrigatório</span>
              <span className="text-sm">
                <span className="block font-semibold">Selar o contrato assinado com o certificado digital da empresa</span>
                <span className="block text-slate-600">
                  O PDF assinado sai com a assinatura digital do certificado A1 (ICP-Brasil), o mesmo das notas fiscais. Qualquer alteração no arquivo aparece no
                  leitor de PDF como assinatura inválida. Vale como assinatura da empresa em todo contrato assinado pelo cliente.
                </span>
                <span className={`mt-1 block ${certificateValid ? "text-emerald-800" : "text-amber-900"}`}>
                  {certificateValid
                    ? `Certificado em vigor: ${certificate.subject}, válido até ${showDate(certificate.validUntil)}.`
                    : certificate
                      ? "O certificado enviado está vencido: a assinatura do contrato fica bloqueada até a renovação."
                      : "Ainda não há certificado: envie o A1 em Parâmetros → Fiscal. Sem ele, não é possível concluir a assinatura do contrato."}
                </span>
              </span>
            </label>
        </section>) },
{ title: "Código por SMS", content: (<section key="sms" className={`${CARD} p-5`} aria-label="Código por SMS">
            <label className="flex items-start gap-3">
              <input key={String(settings.secondFactor)} type="checkbox" name="secondFactor" value="sim" defaultChecked={settings.secondFactor} className="mt-1 h-5 w-5" />
              <span className="text-sm">
                <span className="block font-semibold">Pedir um segundo código, enviado por SMS ao celular de quem assina</span>
                <span className="block text-slate-600">
                  Além do código do e-mail, o cliente digita outro, que chega no celular informado ao enviar o contrato. Quem tiver só o acesso ao e-mail não
                  consegue assinar. Cada SMS tem custo no serviço de envio.
                </span>
                <span className={`mt-1 block ${hasSms ? "text-emerald-800" : "text-amber-900"}`}>
                  {hasSms ? "Serviço de SMS configurado neste servidor." : "O serviço de SMS ainda não está configurado neste servidor: com a opção ligada, o contrato não é enviado. Peça à Ávila Ops para ligar."}
                </span>
              </span>
            </label>
        </section>) }]} />

        <div>
          <button type="submit" className={PRIMARY}>
            Salvar modelo
          </button>
        </div>
      </ActionForm>
    </>
  );
}

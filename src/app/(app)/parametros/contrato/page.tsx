import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { CONTRACT_WORDS, DEFAULT_CONTRACT_BODY, DEFAULT_CONTRACT_TITLE } from "@/lib/contract/text";
import { DEFAULT_CONTRACT_MAIL_BODY, DEFAULT_CONTRACT_MAIL_SUBJECT, loadContractSettings } from "@/lib/db/contracts";
import { defaultMailbox, loadMailInfo } from "@/lib/db/mail";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { saveContractSettingsAction } from "./actions";

export const metadata = { title: "Contrato · ERP" };
export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-slate-200 bg-white";
const INPUT = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";
const LABEL = "block text-xs font-medium text-slate-600";
const BUTTON = "rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90";

export default async function ContractSettingsPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const settings = await loadContractSettings(conn);
  const hasMailbox = (await loadMailInfo(conn)).own !== null || defaultMailbox(process.env) !== null;

  return (
    <>
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className="text-brand underline">
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Contrato</h1>
      <p className="mt-1 max-w-3xl text-slate-600">
        Depois que o pedido é fechado, o contrato sai deste modelo, preenchido com os dados do pedido, e vai para o cliente assinar por um link no e-mail. O
        cliente confirma com nome, CPF e um código enviado ao e-mail dele; o sistema guarda data, hora e endereço de rede de cada passo e junta esse
        registro ao PDF assinado.
      </p>
      {!hasMailbox && (
        <p className="mt-3 max-w-3xl rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Ainda não há caixa de saída de e-mail: sem ela o contrato não é enviado. Veja{" "}
          <Link href="/parametros/email" className="underline">
            E-mail das notas
          </Link>
          .
        </p>
      )}

      <ActionForm action={saveContractSettingsAction} className="mt-6 flex flex-col gap-6">
        <section className={`${CARD} p-5`} aria-labelledby="modelo">
          <h2 id="modelo" className="text-sm font-semibold uppercase tracking-wide">
            Modelo do contrato
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Em branco, vale o texto padrão que aparece em cinza: ele só identifica as partes, o que é vendido, o valor e o prazo, e traz a cláusula em que as
            partes aceitam a assinatura eletrônica. As cláusulas da sua empresa (garantia, multa, foro, entrega) entram aqui, com o texto do seu advogado. Mantenha
            a cláusula da assinatura eletrônica.
          </p>
          <div className="mt-4 grid gap-4">
            <div>
              <label htmlFor="title" className={LABEL}>
                Título
              </label>
              <input key={settings.title ?? ""} id="title" name="title" type="text" defaultValue={settings.title ?? ""} placeholder={DEFAULT_CONTRACT_TITLE} autoComplete="off" className={INPUT} />
            </div>
            <div>
              <label htmlFor="body" className={LABEL}>
                Texto (linha começada por “# ” vira título de seção; por “- ”, item de lista)
              </label>
              <textarea key={settings.body ?? ""} id="body" name="body" rows={22} defaultValue={settings.body ?? ""} placeholder={DEFAULT_CONTRACT_BODY} className={`${INPUT} font-mono text-sm`} />
            </div>
          </div>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium text-brand">Campos que o sistema preenche ({CONTRACT_WORDS.length})</summary>
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
        </section>

        <section className={`${CARD} p-5`} aria-labelledby="envio">
          <h2 id="envio" className="text-sm font-semibold uppercase tracking-wide">
            Envio ao cliente
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
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
            <div className="sm:col-span-4">
              <label htmlFor="mailBody" className={LABEL}>
                Texto do e-mail: {"{empresa}"}, {"{cliente}"}, {"{pedido}"}, {"{validade}"} e {"{link}"} (obrigatório) são trocados pelos dados do contrato
              </label>
              <textarea key={settings.mailBody ?? ""} id="mailBody" name="mailBody" rows={9} defaultValue={settings.mailBody ?? ""} placeholder={DEFAULT_CONTRACT_MAIL_BODY} className={INPUT} />
            </div>
          </div>
        </section>

        <div>
          <button type="submit" className={BUTTON}>
            Salvar modelo
          </button>
        </div>
      </ActionForm>
    </>
  );
}

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { DEFAULT_NFE_BODY, DEFAULT_NFE_SUBJECT, defaultMailbox, loadInboxInfo, loadMailInfo } from "@/lib/db/mail";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { showDateTime } from "@/lib/format";
import { removeInboxAction, removeOwnMailboxAction, saveInboxAction, saveMailTextsAction, saveOwnMailboxAction, testMailAction } from "./actions";

export const metadata = { title: "E-mail das notas · ERP" };
export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-slate-200 bg-white";
const INPUT = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";
const LABEL = "block text-xs font-medium text-slate-600";
const BUTTON = "rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90";

const TABS = [["saida", "Por onde sai"], ["mensagem", "Mensagem"], ["caixa", "Caixa da empresa"], ["entrada", "Respostas"]] as const;

export default async function EmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("parametros");
  const asked = (await searchParams).ver;
  const tab = TABS.find(([key]) => key === (Array.isArray(asked) ? asked[0] : asked))?.[0] ?? "saida";
  const conn = tenantDb(session.tenant.slug);
  const info = await loadMailInfo(conn);
  const inbox = await loadInboxInfo(conn);
  const standard = defaultMailbox(process.env);
  const leavesBy = info.own ? `pela caixa da empresa (${info.own.from})` : standard ? `pela caixa da Ávila Ops (${standard.from})` : null;

  return (
    <>
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className="text-brand underline">
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold">E-mail das notas</h1>
      <p className="mt-1 max-w-3xl text-slate-600">
        Quando uma nota fiscal é autorizada, o cliente recebe o XML e o DANFE por e-mail. A mensagem sai com o nome da sua empresa. Se a nota for
        cancelada, quem recebeu a nota recebe o aviso do cancelamento.
      </p>

      {/* One part at a time: each is a decision of its own. */}
      <nav aria-label="Partes do e-mail" className="mt-4 flex flex-wrap gap-x-1 border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/parametros/email?ver=${key}`}
            aria-current={key === tab ? "page" : undefined}
            className={`inline-flex min-h-[var(--control)] items-center border-b-2 px-3 text-sm font-medium ${key === tab ? "border-brand text-brand" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "saida" && (
      <section className={`${CARD} mt-3 p-5`} aria-labelledby="saida">
        <h2 id="saida" className="text-sm font-semibold uppercase tracking-wide">
          Por onde sai
        </h2>
        <p className="mt-2 text-sm">
          {leavesBy ? (
            <>Hoje as mensagens saem {leavesBy}.</>
          ) : (
            <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">
              Ainda não há caixa de saída: nenhum e-mail é enviado. Cadastre a caixa da empresa abaixo, ou peça à Ávila Ops para ligar a caixa padrão.
            </span>
          )}
        </p>
        {leavesBy ? (
          <ActionForm action={testMailAction} className="mt-3">
            <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
              Enviar mensagem de teste para {session.email}
            </button>
          </ActionForm>
        ) : null}
      </section>
      )}

      {tab === "mensagem" && (
      <section className={`${CARD} mt-3 p-5`} aria-labelledby="mensagem">
        <h2 id="mensagem" className="text-sm font-semibold uppercase tracking-wide">
          Mensagem
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Em branco, vale o texto padrão que aparece em cinza. No texto, {"{numero}"}, {"{serie}"}, {"{empresa}"}, {"{cliente}"} e {"{chave}"} são trocados pelos dados
          da nota.
        </p>
        <ActionForm action={saveMailTextsAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="subject" className={LABEL}>
              Assunto
            </label>
            <input key={info.subject ?? ""} id="subject" name="subject" type="text" defaultValue={info.subject ?? ""} placeholder={DEFAULT_NFE_SUBJECT} autoComplete="off" className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="body" className={LABEL}>
              Texto
            </label>
            <textarea key={info.body ?? ""} id="body" name="body" rows={8} defaultValue={info.body ?? ""} placeholder={DEFAULT_NFE_BODY} className={INPUT} />
          </div>
          <div>
            <label htmlFor="replyTo" className={LABEL}>
              Responder para (o e-mail da sua empresa que recebe a resposta do cliente)
            </label>
            <input key={info.replyTo ?? ""} id="replyTo" name="replyTo" type="email" defaultValue={info.replyTo ?? ""} autoComplete="off" className={INPUT} />
          </div>
          <div>
            <label htmlFor="autoSend" className={LABEL}>
              Enviar sozinho quando a nota é autorizada
            </label>
            <select key={String(info.autoSend)} id="autoSend" name="autoSend" defaultValue={info.autoSend ? "sim" : "nao"} className={INPUT}>
              <option value="sim">Sim, para o e-mail do cadastro do cliente</option>
              <option value="nao">Não, só quando eu clicar em Enviar por e-mail na nota</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className={BUTTON}>
              Salvar mensagem
            </button>
          </div>
        </ActionForm>
      </section>
      )}

      {tab === "caixa" && (
      <section className={`${CARD} mt-3 p-5`} aria-labelledby="caixa">
        <h2 id="caixa" className="text-sm font-semibold uppercase tracking-wide">
          Caixa da empresa (opcional)
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Para a nota sair com o e-mail do seu domínio. Os dados são os do seu provedor de e-mail (servidor de saída, SMTP). Ao salvar, uma mensagem de teste
          vai para {session.email}: se não sair, nada é gravado. A senha fica guardada cifrada e não aparece mais em tela nenhuma.
        </p>
        {info.own ? (
          <p className="mt-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Caixa cadastrada: <strong>{info.own.from}</strong>, usuário {info.own.username}, servidor {info.own.host}, porta {info.own.port}. Para trocar, preencha de
            novo abaixo.
          </p>
        ) : null}
        <ActionForm action={saveOwnMailboxAction} className="mt-4 grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor="host" className={LABEL}>
              Servidor de saída (SMTP)
            </label>
            <input key={info.own?.host ?? ""} id="host" name="host" type="text" defaultValue={info.own?.host ?? ""} placeholder="smtp.suaempresa.com.br" autoComplete="off" className={INPUT} />
          </div>
          <div>
            <label htmlFor="port" className={LABEL}>
              Porta
            </label>
            <input key={info.own?.port ?? ""} id="port" name="port" type="text" inputMode="numeric" defaultValue={info.own?.port ?? "465"} autoComplete="off" className={INPUT} />
          </div>
          <div>
            <label htmlFor="from" className={LABEL}>
              Remetente (e-mail)
            </label>
            <input key={info.own?.from ?? ""} id="from" name="from" type="email" defaultValue={info.own?.from ?? ""} autoComplete="off" className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="username" className={LABEL}>
              Usuário da caixa
            </label>
            <input key={info.own?.username ?? ""} id="username" name="username" type="text" defaultValue={info.own?.username ?? ""} autoComplete="off" className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="password" className={LABEL}>
              Senha da caixa
            </label>
            <input id="password" name="password" type="password" autoComplete="new-password" className={INPUT} />
          </div>
          <div className="sm:col-span-4">
            <button type="submit" className={BUTTON}>
              Testar e salvar caixa da empresa
            </button>
          </div>
        </ActionForm>
        {info.own ? (
          <ActionForm action={removeOwnMailboxAction} className="mt-3">
            <ConfirmButton label="Remover caixa da empresa" confirmLabel="Confirmar: remover a caixa" className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50" />
          </ActionForm>
        ) : null}
      </section>
      )}

      {tab === "entrada" && (
      <section className={`${CARD} mt-3 p-5`} aria-labelledby="entrada">
        <h2 id="entrada" className="text-sm font-semibold uppercase tracking-wide">
          Receber as respostas dos clientes
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Com a caixa de entrada cadastrada, o ERP lê o que chega a cada 5 minutos e guarda, na oportunidade, as mensagens de quem é contato dela. A resposta
          para a cadência e vira tarefa para o vendedor. O resto da caixa não é guardado, e nada é apagado nem marcado como lido no servidor.
        </p>
        {inbox ? (
          <p className={`mt-3 rounded border px-3 py-2 text-sm ${inbox.problem ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
            Lendo a caixa de <strong>{inbox.username}</strong>, servidor {inbox.host}, porta {inbox.port}.{" "}
            {inbox.problem ? `A última leitura não deu certo: ${inbox.problem}` : inbox.checkedAt ? `Última leitura em ${showDateTime(inbox.checkedAt)}.` : ""} Para trocar, preencha de novo abaixo.
          </p>
        ) : null}
        <ActionForm action={saveInboxAction} className="mt-4 grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-3">
            <label htmlFor="imapHost" className={LABEL}>
              Servidor de entrada (IMAP)
            </label>
            <input key={inbox?.host ?? ""} id="imapHost" name="imapHost" type="text" defaultValue={inbox?.host ?? ""} placeholder="imap.suaempresa.com.br" autoComplete="off" className={INPUT} />
          </div>
          <div>
            <label htmlFor="imapPort" className={LABEL}>
              Porta
            </label>
            <input key={inbox?.port ?? ""} id="imapPort" name="imapPort" type="text" inputMode="numeric" defaultValue={inbox?.port ?? "993"} autoComplete="off" className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="imapUsername" className={LABEL}>
              Usuário da caixa
            </label>
            <input key={inbox?.username ?? ""} id="imapUsername" name="imapUsername" type="text" defaultValue={inbox?.username ?? ""} autoComplete="off" className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="imapPassword" className={LABEL}>
              Senha da caixa
            </label>
            <input id="imapPassword" name="imapPassword" type="password" autoComplete="new-password" className={INPUT} />
          </div>
          <div className="sm:col-span-4">
            <button type="submit" className={BUTTON}>
              Testar e salvar caixa de entrada
            </button>
          </div>
        </ActionForm>
        {inbox ? (
          <ActionForm action={removeInboxAction} className="mt-3">
            <ConfirmButton label="Parar de ler as respostas" confirmLabel="Confirmar: parar de ler" className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50" />
          </ActionForm>
        ) : null}
      </section>
      )}
    </>
  );
}

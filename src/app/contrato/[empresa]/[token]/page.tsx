import type { Metadata } from "next";
import { headers } from "next/headers";
import { clientIp, openSigning } from "@/lib/contract/public";
import { contractNumber, maskedEmail } from "@/lib/contract/text";
import { CODE_MINUTES } from "@/lib/contract/token";
import { formatDocument } from "@/lib/customer";
import { isOpen, markViewed } from "@/lib/db/contracts";
import { showDateTime } from "@/lib/format";
import { refuseAction, requestCodeAction, signAction } from "./actions";
import { PublicForm } from "./PublicForm";

/**
 * Where a customer reads and signs the contract of an order. No account: the
 * secret in the address is the only key, and it opens this contract alone.
 * The page is never cached nor indexed, and sends no referrer on.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Assinatura de contrato", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ empresa: string; token: string }> };

const INPUT = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:ring-2 focus:ring-brand";
const LABEL = "block text-sm font-medium text-slate-700";
const PRIMARY = "w-full rounded bg-brand px-4 py-3 text-base font-semibold text-white hover:opacity-90";

/** The text of the contract as paragraphs, headings and items of a list: the same reading as the PDF. */
function Body({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-slate-800">
      {text.split("\n").map((raw, index) => {
        const line = raw.trim();
        if (line === "") return null;
        if (line.startsWith("# ")) return <h3 key={index} className="mt-3 text-sm font-semibold uppercase tracking-wide text-slate-900">{line.slice(2)}</h3>;
        if (line.startsWith("- ")) return <p key={index} className="pl-4">• {line.slice(2)}</p>;
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}

function Shell({ company, children }: { company: string | null; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 bg-slate-50 px-4 py-6">
      {company && <p className="text-lg font-semibold text-slate-900">{company}</p>}
      {children}
      <p className="mt-auto pt-6 text-xs text-slate-500">Assinatura eletrônica registrada pelo sistema da empresa vendedora.</p>
    </main>
  );
}

export default async function SigningPage({ params }: Props) {
  const { empresa, token } = await params;
  const signing = await openSigning(empresa, token);
  // One answer for every address that opens nothing: nobody learns whether a company or a contract exists.
  if (!signing || signing.contract.status === "cancelado") {
    return (
      <Shell company={null}>
        <h1 className="text-xl font-semibold">Este endereço não vale mais</h1>
        <p className="text-slate-700">O contrato foi retirado ou o endereço está incompleto. Peça à empresa que lhe enviou o contrato um novo link.</p>
      </Shell>
    );
  }

  const { contract, tenant } = signing;
  const now = new Date();
  const number = contractNumber(contract.orderNumber, contract.sequence);
  const pdf = `/contrato/${tenant.slug}/${token}/pdf`;
  const hidden = (
    <>
      <input type="hidden" name="empresa" value={tenant.slug} />
      <input type="hidden" name="token" value={token} />
    </>
  );
  const heading = (
    <>
      <h1 className="text-xl font-semibold">
        {contract.title} nº {number}
      </h1>
      <p className="text-sm text-slate-600">
        Pedido nº {contract.orderNumber} · para {contract.recipientName}
      </p>
    </>
  );

  if (contract.status === "assinado") {
    return (
      <Shell company={tenant.name}>
        {heading}
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
          <p className="font-semibold">Contrato assinado.</p>
          <p className="mt-1 text-sm">
            Assinado por {contract.signerName}, CPF {formatDocument(contract.signerDocument ?? "")}, em {showDateTime(contract.signedAt!)} (horário de Brasília). Uma cópia
            vai para {maskedEmail(contract.recipientEmail)}; se não chegar, baixe o contrato aqui.
          </p>
        </div>
        <a href={pdf} target="_blank" rel="noopener" className={`${PRIMARY} text-center`}>
          Baixar o contrato assinado (PDF)
        </a>
      </Shell>
    );
  }
  if (contract.status === "recusado") {
    return (
      <Shell company={tenant.name}>
        {heading}
        <p className="rounded-lg border border-slate-300 bg-white p-4 text-slate-800">A recusa deste contrato foi registrada em {showDateTime(contract.refusedAt!)}. Se foi engano, fale com a empresa.</p>
      </Shell>
    );
  }
  if (!isOpen(contract, now)) {
    return (
      <Shell company={tenant.name}>
        {heading}
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">O prazo para assinar por este endereço terminou em {showDateTime(contract.expiresAt)}. Peça à empresa um novo link.</p>
      </Shell>
    );
  }

  await markViewed(contract.id, clientIp(await headers()), signing.conn);

  return (
    <Shell company={tenant.name}>
      {heading}
      <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="texto">
        <h2 id="texto" className="sr-only">
          Texto do contrato
        </h2>
        {contract.fileName ? (
          // The company sent the contract ready: the text is in the file, and the way to it is the first thing on the page.
          <>
            <p className="text-sm text-slate-800">O contrato está em arquivo PDF. Abra e leia o arquivo antes de assinar.</p>
            <a href={pdf} target="_blank" rel="noopener" className={`${PRIMARY} mt-3 block text-center`}>
              Abrir o contrato (PDF)
            </a>
          </>
        ) : (
          <>
            <Body text={contract.body} />
            <p className="mt-4 border-t border-slate-200 pt-3 text-sm">
              <a href={pdf} target="_blank" rel="noopener" className="font-medium text-brand underline">
                Abrir o contrato em PDF
              </a>
            </p>
          </>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="assinar">
        <h2 id="assinar" className="text-base font-semibold">
          Assinar
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          1. Informe o seu nome e CPF. 2. Enviamos um código para {maskedEmail(contract.recipientEmail)}. 3. Digite o código para assinar. O prazo para assinar
          vai até {showDateTime(contract.expiresAt)}.
        </p>
        <PublicForm action={requestCodeAction} className="mt-4 flex flex-col gap-4">
          {hidden}
          <div>
            <label htmlFor="name" className={LABEL}>
              Nome completo de quem assina
            </label>
            <input id="name" name="name" type="text" defaultValue={contract.pendingName ?? contract.recipientName} autoComplete="name" className={INPUT} />
          </div>
          <div>
            <label htmlFor="document" className={LABEL}>
              CPF de quem assina
            </label>
            <input id="document" name="document" type="text" inputMode="numeric" placeholder="000.000.000-00" autoComplete="off" className={INPUT} />
          </div>
          <label className="flex items-start gap-3 text-sm text-slate-800">
            <input type="checkbox" name="accepted" value="sim" className="mt-1 h-5 w-5" />
            <span>{contract.fileName ? "Abri e li o contrato em PDF e concordo com ele." : "Li o contrato acima e concordo com ele."} Aceito assiná-lo por meio eletrônico, com o código enviado ao meu e-mail.</span>
          </label>
          <button type="submit" className={PRIMARY}>
            {contract.codePending ? "Enviar outro código" : "Receber o código por e-mail"}
          </button>
        </PublicForm>

        {contract.codePending && (
          <PublicForm action={signAction} className="mt-6 flex flex-col gap-4 border-t border-slate-200 pt-4">
            {hidden}
            <div>
              <label htmlFor="code" className={LABEL}>
                Código de 6 números que chegou no e-mail (vale {CODE_MINUTES} minutos)
              </label>
              <input id="code" name="code" type="text" inputMode="numeric" maxLength={6} autoComplete="one-time-code" className={`${INPUT} text-center text-2xl tracking-[0.4em]`} />
            </div>
            <button type="submit" className={PRIMARY}>
              Assinar contrato
            </button>
          </PublicForm>
        )}
      </section>

      <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">Não concordo com o contrato</summary>
        <PublicForm action={refuseAction} className="mt-3 flex flex-col gap-3">
          {hidden}
          <div>
            <label htmlFor="reason" className={LABEL}>
              O que precisa mudar (opcional)
            </label>
            <textarea id="reason" name="reason" rows={3} maxLength={500} className={INPUT} />
          </div>
          <button type="submit" className="rounded border border-red-300 bg-white px-4 py-3 font-medium text-red-700 hover:bg-red-50">
            Recusar contrato
          </button>
        </PublicForm>
      </details>
    </Shell>
  );
}

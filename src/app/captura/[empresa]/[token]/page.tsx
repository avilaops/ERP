import type { Metadata } from "next";
import { PublicForm } from "@/app/contrato/[empresa]/[token]/PublicForm";
import { captureConsent } from "@/lib/db/capture";
import { openCapture } from "@/lib/marketing/public";
import { submitCaptureAction } from "./actions";

/**
 * A capture form of a company: a visitor leaves name and contact, and it
 * becomes an opportunity in the funnel. No account; nothing of the company is
 * shown beyond its name and the texts it wrote for this page.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fale conosco", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ empresa: string; token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const INPUT = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:ring-2 focus:ring-brand";
const LABEL = "block text-sm font-medium text-slate-700";

export default async function CapturePage({ params, searchParams }: Props) {
  const { empresa, token } = await params;
  const open = await openCapture(empresa, token);
  // One answer for every address that opens nothing: nobody learns whether a company or a form exists.
  if (!open) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 bg-slate-50 px-4 py-6">
        <h1 className="text-xl font-semibold">Este formulário não está mais disponível</h1>
        <p className="text-slate-700">O endereço está incompleto ou o formulário foi encerrado.</p>
      </main>
    );
  }
  const { tenant, form } = open;
  const sent = (await searchParams).enviado === "1";

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 bg-slate-50 px-4 py-6">
      <p className="text-lg font-semibold text-slate-900">{tenant.name}</p>
      <h1 className="text-xl font-semibold">{form.title}</h1>
      {sent ? (
        <p role="status" className="rounded border border-emerald-300 bg-emerald-50 px-3 py-3 text-emerald-900">
          Recebemos o seu contato. Alguém da nossa equipe vai falar com você em breve.
        </p>
      ) : (
        <>
          {form.intro && <p className="whitespace-pre-line text-slate-700">{form.intro}</p>}
          <PublicForm action={submitCaptureAction} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <input type="hidden" name="empresa" value={tenant.slug} />
            <input type="hidden" name="token" value={form.token} />
            <div>
              <label htmlFor="nome" className={LABEL}>
                Seu nome
              </label>
              <input id="nome" name="nome" type="text" autoComplete="name" maxLength={120} className={INPUT} />
            </div>
            <div>
              <label htmlFor="empresa_nome" className={LABEL}>
                Empresa (se houver)
              </label>
              <input id="empresa_nome" name="empresa_nome" type="text" autoComplete="organization" maxLength={120} className={INPUT} />
            </div>
            <div>
              <label htmlFor="email" className={LABEL}>
                E-mail
              </label>
              <input id="email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} className={INPUT} />
            </div>
            <div>
              <label htmlFor="telefone" className={LABEL}>
                Telefone ou WhatsApp
              </label>
              <input id="telefone" name="telefone" type="tel" inputMode="tel" autoComplete="tel" maxLength={25} className={INPUT} />
            </div>
            <div>
              <label htmlFor="mensagem" className={LABEL}>
                Como podemos ajudar?
              </label>
              <textarea id="mensagem" name="mensagem" rows={4} maxLength={2000} className={INPUT} />
            </div>
            {/* Not for people: hidden from sight and from screen readers. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label htmlFor="site">Site</label>
              <input id="site" name="site" type="text" tabIndex={-1} autoComplete="off" />
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" name="aceite" value="sim" className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{captureConsent(tenant.name)}</span>
            </label>
            <button type="submit" className="w-full rounded bg-brand px-4 py-3 text-base font-semibold text-white hover:opacity-90">
              Enviar
            </button>
          </PublicForm>
        </>
      )}
    </main>
  );
}

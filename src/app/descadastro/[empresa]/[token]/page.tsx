import type { Metadata } from "next";
import { PublicForm } from "@/app/contrato/[empresa]/[token]/PublicForm";
import { isOptedOut } from "@/lib/db/optout";
import { openUnsubscribe } from "@/lib/marketing/public";
import { unsubscribeAction } from "./actions";

/**
 * Where who received an automatic e-mail of a company asks for no more. No
 * account: the link stands for one address, and all it does is take it off.
 * Opening the page changes nothing; the button does.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Não receber mais e-mails", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ empresa: string; token: string }> };

/** `jo***@dominio.com.br`: enough for the person to know which address it is. */
const masked = (email: string) => {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}${"*".repeat(Math.max(3, user.length - 2))}@${domain}`;
};

export default async function UnsubscribePage({ params }: Props) {
  const { empresa, token } = await params;
  const open = await openUnsubscribe(empresa, token);
  const shell = "mx-auto flex min-h-screen max-w-xl flex-col gap-4 bg-slate-50 px-4 py-6";
  if (!open) {
    return (
      <main className={shell}>
        <h1 className="text-xl font-semibold">Este endereço não vale mais</h1>
        <p className="text-slate-700">O link está incompleto. Abra de novo a partir do e-mail que você recebeu.</p>
      </main>
    );
  }
  const done = await isOptedOut(open.email, open.conn);

  return (
    <main className={shell}>
      <p className="text-lg font-semibold text-slate-900">{open.tenant.name}</p>
      {done ? (
        <>
          <h1 className="text-xl font-semibold">Pronto</h1>
          <p role="status" className="rounded border border-emerald-300 bg-emerald-50 px-3 py-3 text-emerald-900">
            {masked(open.email)} não recebe mais e-mails automáticos de {open.tenant.name}.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold">Não receber mais e-mails</h1>
          <p className="text-slate-700">
            Ao confirmar, {masked(open.email)} deixa de receber as campanhas e as mensagens automáticas de {open.tenant.name}.
          </p>
          <PublicForm action={unsubscribeAction} className="flex flex-col gap-3">
            <input type="hidden" name="empresa" value={open.tenant.slug} />
            <input type="hidden" name="token" value={open.token} />
            <button type="submit" className="w-full rounded bg-brand px-4 py-3 text-base font-semibold text-white hover:opacity-90">
              Confirmar
            </button>
          </PublicForm>
        </>
      )}
    </main>
  );
}

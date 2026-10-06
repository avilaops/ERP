import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sem acesso · ERP Ludus" };

export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Sem acesso</h1>
      <p>
        O seu e-mail não tem acesso a esta parte do ERP da Ludus Equipamentos, ou ainda não foi
        cadastrado no sistema.
      </p>
      <p>
        Para liberar o acesso, fale com a diretoria da Ludus ou com a Ávila Ops, pelo telefone
        (17) 99781-1471.
      </p>
      {/* Plain link: a full navigation re-runs the access check on the server. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="text-brand underline">
        Voltar ao início
      </a>
    </main>
  );
}

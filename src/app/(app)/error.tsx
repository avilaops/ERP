"use client";

import Link from "next/link";
import { PageHeader, PRIMARY, SECONDARY } from "@/components/ui";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section role="alert">
      <PageHeader
        title="Não foi possível carregar esta consulta"
        hint="A busca e os filtros continuam no endereço. Você pode tentar novamente sem perder o contexto."
      />
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={reset} className={PRIMARY}>Tentar novamente</button>
        <Link href="/" className={SECONDARY}>Voltar ao início</Link>
      </div>
    </section>
  );
}

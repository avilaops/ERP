"use client";

import { PRIMARY } from "@/components/ui";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section role="alert" className="rounded-xl border border-red-300 bg-red-50 p-5 text-red-900">
    <h1 className="text-lg font-semibold">Não foi possível carregar esta consulta.</h1>
    <p className="mt-1 text-sm">A busca e os filtros continuam no endereço. Tente novamente.</p>
    <button type="button" onClick={reset} className={`${PRIMARY} mt-4`}>Tentar novamente</button>
  </section>;
}

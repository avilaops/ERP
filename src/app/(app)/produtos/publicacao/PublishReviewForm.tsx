"use client";

import { useActionState, useState } from "react";
import { PRIMARY } from "@/components/ui";
import { IDLE_PUBLISH } from "@/lib/price-table";
import type { PublishState } from "@/lib/price-table";

export function PublishReviewForm({ action, lineId, expected, revision }: {
  action: (state: PublishState, data: FormData) => Promise<PublishState>;
  lineId: number;
  expected: number;
  revision: string;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_PUBLISH);
  const [confirming, setConfirming] = useState(false);
  return <form action={formAction} className="flex flex-wrap items-center gap-2">
    <input type="hidden" name="lineId" value={lineId} />
    <input type="hidden" name="expected" value={expected} />
    <input type="hidden" name="revision" value={revision} />
    {confirming ? <>
      <span>Publicar a v{expected} para toda a equipe?</span>
      <button type="submit" disabled={pending} className={PRIMARY}>{pending ? "Publicando…" : `Confirmar publicação v${expected}`}</button>
      <button type="button" onClick={() => setConfirming(false)} className="min-h-[var(--control)] px-3">Cancelar</button>
    </> : <button type="button" onClick={() => setConfirming(true)} className={PRIMARY}>Publicar v{expected}</button>}
    {state.status === "error" && <p role="alert" className="basis-full text-sm text-red-700">Nada foi publicado. {state.message}</p>}
    {state.status === "published" && <p role="status" className="basis-full text-sm text-emerald-800">{state.message}</p>}
  </form>;
}

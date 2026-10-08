"use client";

import { lineWords } from "@/lib/line-words";
import { useActionState } from "react";
import { IDLE_PASTE } from "@/lib/advisory-paste";
import type { Change, InvalidLine, PasteState } from "@/lib/advisory-paste";

type PasteAction = (state: PasteState, formData: FormData) => Promise<PasteState>;

/** Current → new. What does not change shows once, in grey. */
function ChangeCell({ value }: { value: Change }) {
  return (
    <td className="whitespace-nowrap px-3 py-2 text-right">
      {value.changed ? (
        <>
          <span className="text-slate-500">{value.from}</span> → <span className="font-semibold">{value.to}</span>
        </>
      ) : (
        <span className="text-slate-500">{value.to}</span>
      )}
    </td>
  );
}

function InvalidLines({ lines }: { lines: InvalidLine[] }) {
  return (
    <ul className="mt-2 flex flex-col gap-1 text-sm">
      {lines.map(({ line, text, reason }) => (
        <li key={line}>
          <span className="font-medium">Linha {line}:</span> {reason}{" "}
          <code className="break-all rounded bg-slate-100 px-1 text-xs text-slate-700">{text}</code>
        </li>
      ))}
    </ul>
  );
}

/**
 * The box of "Colar custos da assessoria". Conferir shows what would change and
 * saves nothing; Aplicar only appears with at least one valid line. Every figure
 * comes as text from the server.
 */
export function PasteCostsForm({ action, onClose, imported }: { action: PasteAction; onClose: () => void; imported: boolean }) {
  const words = lineWords(imported);
  const [state, formAction, pending] = useActionState(action, IDLE_PASTE);
  const preview = state.status === "preview";

  return (
    <form id="colar-custos" action={formAction} noValidate className="mt-4 rounded-lg border border-slate-200 bg-white">
      <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
        {words.pasteButton}
      </h2>
      <div className="flex flex-col gap-4 p-5">
        <p id="colar-ajuda" className="max-w-3xl text-sm text-slate-600">
          Copie as linhas da planilha e cole aqui, uma por equipamento, com as colunas nesta ordem:{" "}
          <strong>código do equipamento</strong>, <strong>{words.pasteColumn}</strong>, crédito % (opcional) e embalagem R$
          (opcional). Números com vírgula, como 8.146,64 e 28,11565. Coluna opcional em branco mantém o valor atual. O
          código precisa já estar cadastrado: a colagem não cria equipamento.
        </p>

        {state.status === "error" && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
            <span className="font-semibold">Nada foi gravado.</span> {state.message}
          </p>
        )}
        {state.status === "applied" && (
          <div role="status" className="rounded border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">{state.message}</p>
            {state.invalid.length > 0 && <InvalidLines lines={state.invalid} />}
          </div>
        )}

        <textarea
          name="text"
          rows={8}
          defaultValue={state.text}
          aria-label="Planilha da assessoria"
          aria-describedby="colar-ajuda"
          placeholder={"LD-B001\t8.146,64\t28,11565\nLD-B002\t8.738,77"}
          spellCheck={false}
          className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-brand"
        />
        {/* What was checked: applying a different text only checks it again. */}
        {preview && <input type="hidden" name="checked" value={state.text} />}

        {preview && (
          <div className="flex flex-col gap-4" aria-live="polite">
            {state.message && (
              <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {state.message}
              </p>
            )}
            {state.headerSkipped && <p className="text-sm text-slate-600">A primeira linha foi lida como cabeçalho e ignorada.</p>}

            {state.rows.length > 0 ? (
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full text-sm">
                  <caption className="border-b border-slate-200 px-3 py-2 text-left font-semibold">
                    Conferência: nada foi gravado ainda
                  </caption>
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">
                        Equipamento
                      </th>
                      {[words.cost, "Crédito imp.", "Embalagem R$"].map((column) => (
                        <th key={column} scope="col" className="px-3 py-2 text-right font-semibold">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {state.rows.map((row) => (
                      <tr key={row.code} className="border-t border-slate-200">
                        <td className="px-3 py-2">
                          <span className="font-medium">{row.code}</span> · {row.name}
                          {row.inactive && (
                            <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700">inativo</span>
                          )}
                        </td>
                        <ChangeCell value={row.cost} />
                        <ChangeCell value={row.credit} />
                        <ChangeCell value={row.packaging} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm font-medium text-red-900">Nenhuma linha válida para aplicar.</p>
            )}

            {state.invalid.length > 0 && (
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
                <p className="text-sm font-semibold">
                  {state.invalid.length === 1 ? "1 linha não será aplicada" : `${state.invalid.length} linhas não serão aplicadas`}
                </p>
                <InvalidLines lines={state.invalid} />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {/* First submit button: Enter never applies. */}
          <button
            type="submit"
            name="intent"
            value="check"
            disabled={pending}
            className="rounded border border-slate-300 bg-white px-4 py-2 font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            Conferir
          </button>
          {preview && state.rows.length > 0 && (
            <button
              key="apply"
              type="submit"
              name="intent"
              value="apply"
              disabled={pending}
              className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {state.rows.length === 1 ? "Aplicar 1 custo" : `Aplicar ${state.rows.length} custos`}
            </button>
          )}
          <button key="close" type="button" onClick={onClose} className="rounded px-4 py-2 hover:bg-slate-100">
            Fechar
          </button>
        </div>
      </div>
    </form>
  );
}

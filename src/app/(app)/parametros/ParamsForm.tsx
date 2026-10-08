"use client";

import { useActionState } from "react";
import { lineWords } from "@/lib/line-words";
import { IDLE_FORM_STATE, PARAM_SECTIONS, STATE_RATE_COLUMNS } from "@/lib/params-form";
import type { ParamField, ParamsFormState, ParamsFormValues, StateRateKey } from "@/lib/params-form";
import { UFS } from "@/lib/pricing/states";

/** The names of the columns of the rates by state, short enough to sit on top of a narrow field. */
const SHORT: Record<string, string> = { icms: "Interno", fcp: "FCP", saida: "Saída" };

const UNIT: Record<ParamField["kind"], string> = { rate: "%", days: "dias", money: "R$" };

type SaveAction = (state: ParamsFormState, formData: FormData) => Promise<ParamsFormState>;

/**
 * Only reads and shows text: every figure comes calculated from the server.
 * `saved` is what the database holds, formatted. After an error the fields keep
 * what was typed; otherwise they follow `saved`, which the page refreshes after
 * a save and after the "usar" button.
 */
export function ParamsForm({ saved, action, lineId, imported }: { saved: ParamsFormValues; action: SaveAction; lineId: number; imported: boolean }) {
  // The fields whose name depends on where the line is bought.
  const words = lineWords(imported);
  const worded: Partial<Record<string, { label?: string; help?: string }>> = {
    safetyMargin: { label: words.safetyLabel, help: words.safetyHelp },
    minDownPayment: { help: words.downPaymentHelp },
    ipi: { help: words.ipiHelp },
    icmsInterstate: { label: words.interstateLabel },
  };
  const [state, formAction, pending] = useActionState(action, IDLE_FORM_STATE);
  const values = state.status === "error" && state.values ? state.values : saved;

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {/* The product line these parameters belong to. */}
      <input type="hidden" name="lineId" value={lineId} />
      {state.status === "error" && (
        <div role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Nada foi gravado.</p>
          <ul className="mt-1 list-disc pl-5">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {state.status === "saved" && (
        <p role="status" className="rounded border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          Parâmetros gravados. O quadro Resultado já mostra a conta nova.
        </p>
      )}

      {PARAM_SECTIONS.map((section) => (
        <fieldset key={section.title} className="rounded-lg border border-slate-200 bg-white">
          <legend className="sr-only">{section.title}</legend>
          <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
            {section.title}
          </h2>
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            {section.fields.map((plain) => {
              const field = { ...plain, ...worded[plain.key] };
              const invalid = state.invalid.includes(field.key);
              return (
                <div key={field.key}>
                  <label htmlFor={field.key} className="block text-sm font-medium">
                    {field.label}
                  </label>
                  <div
                    className={`mt-1 flex items-center rounded border bg-white focus-within:ring-2 focus-within:ring-brand ${
                      invalid ? "border-red-500" : "border-slate-300"
                    }`}
                  >
                    {field.kind === "money" && <span className="pl-3 text-sm text-slate-500">{UNIT.money}</span>}
                    <input
                      id={field.key}
                      name={field.key}
                      type="text"
                      inputMode={field.kind === "days" ? "numeric" : "decimal"}
                      autoComplete="off"
                      defaultValue={values[field.key]}
                      aria-invalid={invalid || undefined}
                      aria-describedby={field.help ? `${field.key}-ajuda` : undefined}
                      className="w-full min-w-0 bg-transparent px-3 py-2 text-right outline-none"
                    />
                    {field.kind !== "money" && <span className="pr-3 text-sm text-slate-500">{UNIT[field.kind]}</span>}
                  </div>
                  {field.help && (
                    <p id={`${field.key}-ajuda`} className="mt-1 text-xs text-slate-500">
                      {field.help}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      <fieldset className="rounded-lg border border-slate-200 bg-white">
        <legend className="sr-only">ICMS por estado de destino</legend>
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
          ICMS por estado de destino
        </h2>
        <div className="p-5">
          <p className="max-w-3xl text-xs text-slate-500">
            Alíquota interna de cada estado e o Fundo de Combate à Pobreza (FCP). Na venda para cliente não contribuinte
            de outro estado, o DIFAL que fica com a empresa é a alíquota interna do destino menos a interestadual, mais o
            FCP. O ICMS de saída é o que a venda para aquele estado paga na origem: em branco vale o ICMS interestadual
            geral; produto nacional usa 7% ou 12% conforme o destino. Confirme os números com o contador; se a lei mudar,
            é aqui que se altera.
          </p>
          {/* The names of the columns once, on top of each block of nine states: the rows are only the numbers. */}
          <p className="mt-4 text-xs font-medium text-slate-600">Em %: Interno = ICMS interno do estado · FCP · Saída = ICMS de saída para o estado</p>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 9, 18].map((start) => (
              <table key={start} className="w-full min-w-0 table-fixed border-separate border-spacing-x-1.5 border-spacing-y-1.5 text-sm">
                <thead>
                  <tr className="text-xs font-medium text-slate-500">
                    <th scope="col" className="w-8 text-left font-medium">
                      UF
                    </th>
                    {STATE_RATE_COLUMNS.map(({ prefix, label }) => (
                      <th key={prefix} scope="col" title={label} className="whitespace-nowrap pr-2 text-right font-medium">
                        {SHORT[prefix]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {UFS.slice(start, start + 9).map((uf) => (
                    <tr key={uf}>
                      <th scope="row" className="text-left font-semibold">
                        {uf}
                      </th>
                      {STATE_RATE_COLUMNS.map(({ prefix, label }) => {
                        const key = `${prefix}-${uf}` as StateRateKey;
                        const invalid = state.invalid.includes(key);
                        return (
                          <td key={key}>
                            <input
                              name={key}
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              size={1}
                              defaultValue={values[key]}
                              aria-label={`${label} de ${uf}`}
                              aria-invalid={invalid || undefined}
                              className={`w-full min-w-0 rounded border bg-white px-2 py-1 text-right text-slate-900 outline-none focus:ring-2 focus:ring-brand ${
                                invalid ? "border-red-500" : "border-slate-300"
                              }`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </div>
      </fieldset>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? "Gravando…" : "Salvar parâmetros"}
        </button>
      </div>
    </form>
  );
}

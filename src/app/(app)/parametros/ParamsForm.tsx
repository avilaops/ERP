"use client";

import { useActionState } from "react";
import { IDLE_FORM_STATE, PARAM_SECTIONS, STATE_RATE_COLUMNS } from "@/lib/params-form";
import type { ParamField, ParamsFormState, ParamsFormValues, StateRateKey } from "@/lib/params-form";
import { UFS } from "@/lib/pricing/states";

const UNIT: Record<ParamField["kind"], string> = { rate: "%", days: "dias", money: "R$" };

type SaveAction = (state: ParamsFormState, formData: FormData) => Promise<ParamsFormState>;

/**
 * Only reads and shows text: every figure comes calculated from the server.
 * `saved` is what the database holds, formatted. After an error the fields keep
 * what was typed; otherwise they follow `saved`, which the page refreshes after
 * a save and after the "usar" button.
 */
export function ParamsForm({ saved, action }: { saved: ParamsFormValues; action: SaveAction }) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM_STATE);
  const values = state.status === "error" && state.values ? state.values : saved;

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
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
            {section.fields.map((field) => {
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
            FCP. Confirme os números com o contador; se a lei mudar, é aqui que se altera.
          </p>
          <div className="mt-4 grid gap-x-10 gap-y-2 md:grid-cols-2">
            {UFS.map((uf) => (
              <div key={uf} className="flex items-center gap-2">
                <span className="w-8 font-semibold">{uf}</span>
                {STATE_RATE_COLUMNS.map(({ prefix, label }) => {
                  const key = `${prefix}-${uf}` as StateRateKey;
                  const invalid = state.invalid.includes(key);
                  return (
                    <label key={key} className="flex items-center gap-1 whitespace-nowrap text-xs text-slate-500">
                      {label}
                      <span
                        className={`flex items-center rounded border bg-white focus-within:ring-2 focus-within:ring-brand ${
                          invalid ? "border-red-500" : "border-slate-300"
                        }`}
                      >
                        <input
                          name={key}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          size={1}
                          defaultValue={values[key]}
                          aria-label={`${label} de ${uf}`}
                          aria-invalid={invalid || undefined}
                          className="w-14 min-w-0 bg-transparent px-2 py-1 text-right text-sm text-slate-900 outline-none"
                        />
                        <span className="pr-2">%</span>
                      </span>
                    </label>
                  );
                })}
              </div>
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

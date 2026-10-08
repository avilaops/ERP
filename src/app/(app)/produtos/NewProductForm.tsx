"use client";

import { useActionState } from "react";
import { EMPTY_NEW_PRODUCT, fieldLabel, IDLE_NEW_PRODUCT, NEW_PRODUCT_FIELDS } from "@/lib/product-form";
import type { NewProductKey, NewProductState } from "@/lib/product-form";

type CreateAction = (state: NewProductState, formData: FormData) => Promise<NewProductState>;

const UNIT: Partial<Record<NewProductKey, string>> = {
  supplierPriceUsd: "US$",
  advisoryCost: "R$",
  taxCredit: "%",
  packaging: "R$",
};

const HELP: Partial<Record<NewProductKey, string>> = {
  code: "Ex.: LD-B001. Pode ficar para depois.",
  advisoryCost: "Em branco, o equipamento entra como sem custo.",
};

/**
 * The form "+ Equipamento" opens in the page itself. After an error the fields
 * keep what was typed; after a save they come back blank, ready for the next one.
 */
export function NewProductForm({ action, onClose, lineId, imported }: { action: CreateAction; onClose: () => void; lineId: number; imported: boolean }) {
  const [state, formAction, pending] = useActionState(action, IDLE_NEW_PRODUCT);
  const values = state.status === "error" && state.values ? state.values : EMPTY_NEW_PRODUCT;

  return (
    <form
      id="novo-equipamento"
      action={formAction}
      noValidate
      className="mt-4 rounded-lg border border-slate-200 bg-white"
    >
      {/* The product line the equipment is created in: the one the list shows. */}
      <input type="hidden" name="lineId" value={lineId} />
      <input type="hidden" name="wording" value={imported ? "importada" : "nacional"} />
      <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
        Novo equipamento
      </h2>
      <div className="flex flex-col gap-5 p-5">
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
            Equipamento cadastrado. Ele já aparece na lista.
          </p>
        )}

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {NEW_PRODUCT_FIELDS.map((key) => {
            const invalid = state.invalid.includes(key);
            const id = `novo-${key}`;
            const numeric = key in UNIT;
            return (
              <div key={key} className={key === "name" ? "sm:col-span-2" : undefined}>
                <label htmlFor={id} className="block text-sm font-medium">
                  {fieldLabel(key, imported)}
                </label>
                <input
                  id={id}
                  name={key}
                  type="text"
                  inputMode={numeric ? "decimal" : undefined}
                  autoComplete="off"
                  required={key === "name"}
                  defaultValue={values[key]}
                  aria-invalid={invalid || undefined}
                  aria-describedby={HELP[key] ? `${id}-ajuda` : undefined}
                  className={`mt-1 w-full min-w-0 rounded border bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand ${
                    numeric ? "text-right" : ""
                  } ${invalid ? "border-red-500" : "border-slate-300"}`}
                />
                {HELP[key] && (
                  <p id={`${id}-ajuda`} className="mt-1 text-xs text-slate-500">
                    {HELP[key]}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {pending ? "Gravando…" : "Salvar equipamento"}
          </button>
          <button type="button" onClick={onClose} className="rounded px-4 py-2 hover:bg-slate-100">
            Fechar
          </button>
        </div>
      </div>
    </form>
  );
}

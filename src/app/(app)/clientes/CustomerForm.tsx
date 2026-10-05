"use client";

import { useActionState } from "react";
import type { CustomerKind } from "@/lib/customer";
import { CUSTOMER_FIELDS, IDLE_CUSTOMER } from "@/lib/customer-form";
import type { CustomerFieldKey, CustomerFormState, CustomerFormValues } from "@/lib/customer-form";
import { UFS } from "@/lib/pricing/states";

type SaveAction = (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;

const INPUT = "mt-1 w-full min-w-0 rounded border bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600";

/**
 * The record of a customer. Only reads and shows text: what is required, the
 * note about the CEP and what is saved come from the server. After an error the
 * fields keep what was typed; otherwise they follow `saved`.
 */
export function CustomerForm({
  kind,
  id,
  saved,
  required,
  cepNote,
  action,
}: {
  kind: CustomerKind;
  /** `null` for a new customer. */
  id: number | null;
  saved: CustomerFormValues;
  /** The fields marked with *: what an order needs to be closed. */
  required: CustomerFieldKey[];
  /** `Pelo CEP, o estado é RS. …`, or `null`. */
  cepNote: string | null;
  action: SaveAction;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_CUSTOMER);
  const values = state.status === "error" && state.values ? state.values : saved;
  const { main, address } = CUSTOMER_FIELDS[kind];

  const field = ({ key, label, help, wide }: (typeof main)[number]) => {
    const invalid = state.invalid.includes(key);
    const border = invalid ? "border-red-500" : "border-slate-300";
    const locked = key === "document" && id !== null;
    return (
      <div key={key} className={wide ? "sm:col-span-2" : undefined}>
        <label htmlFor={key} className="block text-sm font-medium">
          {label}
          {required.includes(key) && <span className="text-red-700"> *</span>}
        </label>
        {key === "uf" ? (
          // The key remounts the list when the saved state changes: a select keeps its first default otherwise.
          <select
            key={values[key] ?? ""}
            id={key}
            name={key}
            defaultValue={values[key] ?? ""}
            aria-invalid={invalid || undefined}
            className={`${INPUT} ${border}`}
          >
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={key}
            name={key}
            type={key === "email" ? "email" : "text"}
            inputMode={key === "phone" || key === "cep" ? "numeric" : undefined}
            autoComplete="off"
            readOnly={locked}
            defaultValue={values[key] ?? ""}
            aria-invalid={invalid || undefined}
            aria-describedby={help ? `${key}-ajuda` : undefined}
            className={`${INPUT} ${border} ${locked ? "bg-slate-100 text-slate-600" : ""}`}
          />
        )}
        {help && (
          <p id={`${key}-ajuda`} className="mt-1 text-xs text-slate-500">
            {help}
          </p>
        )}
      </div>
    );
  };

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      {id !== null && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="kind" value={kind} />

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
          Cliente gravado.
        </p>
      )}

      <fieldset className="rounded-lg border border-slate-200 bg-white">
        <legend className="sr-only">{kind === "PJ" ? "Empresa" : "Pessoa física"}</legend>
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
          {kind === "PJ" ? "Empresa (CNPJ)" : "Pessoa física (CPF)"}
        </h2>
        <div className="grid gap-5 p-5 sm:grid-cols-2">{main.map(field)}</div>
        {kind === "PF" && <p className="px-5 pb-5 text-xs text-slate-500">Pessoa física é sempre não contribuinte do ICMS.</p>}
      </fieldset>

      <fieldset className="rounded-lg border border-slate-200 bg-white">
        <legend className="sr-only">Endereço</legend>
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">Endereço</h2>
        <div className="grid gap-5 p-5 sm:grid-cols-3">{address.map(field)}</div>
        {cepNote && <p className="px-5 pb-5 text-xs text-slate-500">{cepNote}</p>}
      </fieldset>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {pending ? "Gravando…" : "Salvar cliente"}
        </button>
        <p className="text-xs text-slate-500">
          Campos com <span className="text-red-700">*</span> são exigidos para fechar o pedido.
        </p>
      </div>
    </form>
  );
}

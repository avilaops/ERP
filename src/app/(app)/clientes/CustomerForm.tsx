"use client";

import { useActionState, useState } from "react";
import { INPUT as SHARED_INPUT, PRIMARY, SECONDARY } from "@/components/ui";
import type { CustomerKind } from "@/lib/customer";
import { CUSTOMER_FIELDS, IDLE_CUSTOMER } from "@/lib/customer-form";
import type { CustomerFieldKey, CustomerFormState, CustomerFormValues } from "@/lib/customer-form";
import { UFS } from "@/lib/pricing/states";

type SaveAction = (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;

const INPUT = SHARED_INPUT;

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
  hidden,
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
  /** Fixed values that go with the record, such as the order it is being saved from. */
  hidden?: Record<string, string>;
  action: SaveAction;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_CUSTOMER);
  const values = state.status === "error" && state.values ? state.values : saved;
  const { main, address } = CUSTOMER_FIELDS[kind];
  const [step, setStep] = useState(0);
  const groups = [
    { title: kind === "PJ" ? "Identificação da empresa" : "Identificação pessoal", fields: main.filter((item) => !["phone", "email", "contactName", "tradeName", "stateRegistration"].includes(item.key)) },
    ...(kind === "PJ" ? [{ title: "Dados da empresa", fields: main.filter((item) => ["tradeName", "stateRegistration"].includes(item.key)) }] : []),
    { title: "Contato", fields: main.filter((item) => ["phone", "email", "contactName"].includes(item.key)) },
    { title: "Endereço", fields: address.filter((item) => ["cep", "street", "streetNumber"].includes(item.key)) },
    { title: "Bairro e complemento", fields: address.filter((item) => ["complement", "district"].includes(item.key)) },
    { title: "Cidade e estado", fields: address.filter((item) => ["city", "uf"].includes(item.key)) },
  ];
  const showAll = state.status === "error";

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
    <form action={formAction} noValidate className="flex flex-col gap-3">
      {id !== null && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="kind" value={kind} />
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

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

      {!showAll && <label className="block text-sm font-medium"><span className="sr-only">Etapa do cadastro</span>
        <select value={step} onChange={(event) => setStep(Number(event.target.value))} className={SHARED_INPUT}>
          {groups.map((group, index) => <option key={group.title} value={index}>{index + 1} de {groups.length} · {group.title}</option>)}
        </select>
      </label>}
      {groups.map((group, index) => (
        <fieldset key={group.title} hidden={!showAll && step !== index} className="rounded-xl border border-slate-200 bg-white">
          <legend className="sr-only">{group.title}</legend>
          {showAll && <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">{group.title}</h2>}
          <div className="grid gap-3 p-4 sm:grid-cols-2">{group.fields.map(field)}</div>
          {index === groups.length - 1 && cepNote && <p className="px-4 pb-4 text-sm text-slate-600">{cepNote}</p>}
        </fieldset>
      ))}

      {/* On the customer's own screen the button stays in reach at the bottom of a phone. Inside an order, the order has its own bar. */}
      <div className={`flex flex-wrap items-center gap-2 ${hidden === undefined ? "sticky bottom-[var(--tabbar)] z-10 -mx-4 border-t border-slate-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:static md:mx-0 md:border-0 md:bg-transparent md:p-0" : ""}`}>
        {!showAll && step > 0 && <button type="button" className={SECONDARY} onClick={() => setStep(step - 1)}>Voltar</button>}
        {!showAll && step < groups.length - 1 && <button type="submit" className={PRIMARY} onClick={(event) => { event.preventDefault(); setStep(step + 1); }}>Continuar</button>}
        <button
          type="submit"
          disabled={pending}
          className={!showAll && step < groups.length - 1 ? SECONDARY : PRIMARY}
        >
          {pending ? "Gravando…" : "Salvar cliente"}
        </button>
      </div>
        {showAll && <p className="text-xs text-slate-500">Campos com * são exigidos para fechar o pedido.</p>}
    </form>
  );
}

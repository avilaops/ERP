"use client";

import { useActionState, useState } from "react";
import { fieldLabel, IDLE_ROW } from "@/lib/product-form";
import type { ProductFormValues, RowKey, RowState } from "@/lib/product-form";

/** One line of the list, with every figure already calculated and formatted on the server. */
export type ProductRowData = {
  id: number;
  active: boolean;
  /** What the database holds, as text for the fields. */
  values: ProductFormValues<RowKey>;
  /** Whether there is a photo: the list shows it small, served by its own route. */
  hasPhoto: boolean;
  /** `DHZ · SM5001 · US$ 605`, or empty. */
  supplier: string;
  realCost: string;
  table: string;
  /** `null` when there is no table price. */
  tableWithIpi: string | null;
  maxSp: string;
  maxTaxpayer: string;
};

type RowAction = (state: RowState, formData: FormData) => Promise<RowState>;

const INPUT = "w-full min-w-0 rounded border bg-white px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand";
const LINK = "rounded px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-60";

/**
 * Only reads and shows text. The fields sit in different cells, so they point
 * to the row's form by id; Enter in any of them saves the row. After an error
 * they keep what was typed; otherwise they follow what the server sent.
 */
export function ProductRow({
  row,
  save,
  setActive,
  remove,
}: {
  row: ProductRowData;
  save: RowAction;
  setActive: RowAction;
  remove: RowAction;
}) {
  const [confirming, setConfirming] = useState(false);
  // One state for the three actions of the row: the button pressed says which one runs.
  const [state, formAction, pending] = useActionState(async (previous: RowState, formData: FormData) => {
    const intent = formData.get("intent");
    if (intent === "delete") return remove(previous, formData);
    if (intent === "deactivate" || intent === "reactivate") {
      formData.set("active", intent === "reactivate" ? "true" : "false");
      return setActive(previous, formData);
    }
    return save(previous, formData);
  }, IDLE_ROW);

  const form = `produto-${row.id}`;
  const values = state.status === "error" && state.values ? state.values : row.values;
  const name = row.values.name;

  const field = (key: RowKey, className: string, inputMode?: "decimal") => (
    <input
      form={form}
      name={key}
      type="text"
      size={1}
      inputMode={inputMode}
      autoComplete="off"
      defaultValue={values[key]}
      aria-label={`${fieldLabel(key)} de ${name}`}
      aria-invalid={state.invalid.includes(key) || undefined}
      className={`${INPUT} ${className} ${state.invalid.includes(key) ? "border-red-500" : "border-slate-300"}`}
    />
  );

  return (
    <>
      <tr className="border-t border-slate-200 align-top">
        <td className="px-2 py-3 pl-4">
          <form id={form} action={formAction} noValidate>
            <input type="hidden" name="id" value={row.id} />
          </form>
          <div className="flex gap-3">
            {/* The photo opens the screen of the equipment: photo, description, supplier and fiscal data. */}
            <a
              href={`/produtos/${row.id}`}
              aria-label={`Abrir ${name}`}
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white text-[10px] text-slate-400 hover:border-brand"
            >
              {row.hasPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element -- served by the app itself, per company and per session
                <img src={`/api/produtos/${row.id}/foto`} alt="" loading="lazy" className="h-full w-full object-contain" />
              ) : (
                "sem foto"
              )}
            </a>
            <div className="min-w-0 flex-1">
              {field("name", "font-medium")}
              <div className="mt-1.5 flex items-center gap-2">
                {field("code", "max-w-28 shrink-0")}
                {row.supplier && <span className="whitespace-nowrap text-xs text-slate-500">{row.supplier}</span>}
                <a href={`/produtos/${row.id}`} className="whitespace-nowrap text-xs font-medium text-brand underline">
                  abrir
                </a>
              </div>
            </div>
          </div>
        </td>
        <td className="px-2 py-3">{field("advisoryCost", "text-right", "decimal")}</td>
        <td className="px-2 py-3">{field("taxCredit", "text-right", "decimal")}</td>
        <td className="px-2 py-3">{field("packaging", "text-right", "decimal")}</td>
        <td className="whitespace-nowrap px-2 py-4 text-right">{row.realCost}</td>
        <td className="whitespace-nowrap px-2 py-3 text-right">
          <span className="font-semibold">{row.table}</span>
          {row.tableWithIpi && <span className="block text-xs text-slate-500">c/IPI {row.tableWithIpi}</span>}
        </td>
        <td className="whitespace-nowrap px-2 py-4 text-right">{row.maxSp}</td>
        <td className="whitespace-nowrap px-2 py-4 text-right">{row.maxTaxpayer}</td>
        <td className="sticky right-0 whitespace-nowrap bg-white px-2 py-3 pr-4 text-right">
          {/* First submit button of the form: it is the one Enter presses. */}
          <button
            form={form}
            type="submit"
            name="intent"
            value="save"
            disabled={pending}
            className="rounded bg-brand px-3 py-1 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {pending ? "Salvando…" : "Salvar"}
          </button>
          {/* The keys matter: without them React would turn the pressed "Excluir" into "Confirmar" in place, and the same click would submit the deletion. */}
          <div className="mt-1 text-sm">
            {confirming ? (
              <>
                <span className="block">Excluir de vez?</span>
                <button key="confirm" form={form} type="submit" name="intent" value="delete" disabled={pending} className={`${LINK} font-medium text-red-700`}>
                  Confirmar
                </button>
                <button key="cancel" type="button" onClick={() => setConfirming(false)} className={LINK}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button
                  key="toggle"
                  form={form}
                  type="submit"
                  name="intent"
                  value={row.active ? "deactivate" : "reactivate"}
                  disabled={pending}
                  className={LINK}
                >
                  {row.active ? "Desativar" : "Reativar"}
                </button>
                <button key="delete" type="button" onClick={() => setConfirming(true)} className={`${LINK} text-red-700`}>
                  Excluir
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {state.status === "error" && (
        <tr>
          <td colSpan={9} className="px-4 pb-3">
            <div role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
              <span className="font-semibold">Nada foi gravado em {name}.</span> {state.errors.join(" ")}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

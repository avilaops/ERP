"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { fieldLabel, IDLE_ROW } from "@/lib/product-form";
import type { NewProductKey, ProductFormValues, ProductScreenResult, RowState } from "@/lib/product-form";

type Save = (formData: FormData) => Promise<ProductScreenResult>;
type RowAction = (state: RowState, formData: FormData) => Promise<RowState>;

const LIST = "/produtos";
const INPUT = "mt-1 w-full rounded-lg border bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand";
const MAIN: NewProductKey[] = ["name", "code", "advisoryCost"];
const MORE: NewProductKey[] = ["supplierName", "supplierModel", "supplierPriceUsd", "taxCredit", "packaging"];
const HELP: Partial<Record<NewProductKey, string>> = {
  code: "Ex.: LD-B001. Pode ficar para depois.",
  advisoryCost: "Em branco, o equipamento entra como sem custo.",
};
const NUMERIC: NewProductKey[] = ["supplierPriceUsd", "advisoryCost", "taxCredit", "packaging"];

/**
 * One equipment on one screen: photo, the three fields that matter, the rest
 * folded away, and the buttons always in reach at the bottom. It only collects
 * what was typed: the server checks and saves, and the photo goes by its own
 * route, which is the only way a photo enters the system.
 */
export function ProductScreen({
  id,
  saved,
  photo,
  active,
  save,
  setActive,
  remove,
  lines,
  lineId,
}: {
  id: number | null;
  saved: ProductFormValues<NewProductKey> | null;
  /** Address of the photo already stored, or `null`. */
  photo: string | null;
  active: boolean;
  save: Save;
  setActive: RowAction;
  remove: RowAction;
  /** The product lines of the company and the one of this equipment. */
  lines: { id: number; name: string; imported: boolean }[];
  lineId: number;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  // The cost is called by what the line chosen buys: it follows the select.
  const [chosenLine, setChosenLine] = useState(lineId);
  const imported = lines.find((line) => line.id === chosenLine)?.imported ?? true;
  const [invalid, setInvalid] = useState<NewProductKey[]>([]);
  const [preview, setPreview] = useState<string | null>(photo);
  const [file, setFile] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  const [pending, start] = useTransition();

  /** Saves the fields, then the photo when one was chosen, and goes on to the list or to a blank screen. */
  function submit(then: "list" | "another") {
    if (!form.current) return;
    const data = new FormData(form.current);
    start(async () => {
      const result = await save(data);
      if (!result.ok) {
        setErrors(result.errors);
        setInvalid(result.invalid);
        return;
      }
      if (file) {
        const sent = await fetch(`/api/produtos/${result.id}/foto`, { method: "PUT", body: file });
        if (!sent.ok) {
          setErrors([`O equipamento foi salvo, mas a foto não: ${await sent.text()}`]);
          setInvalid([]);
          if (id === null) router.replace(`${LIST}/${result.id}`);
          return;
        }
      }
      if (then === "another") {
        form.current?.reset();
        setFile(null);
        setPreview(null);
        setErrors([]);
        setInvalid([]);
        router.replace(`${LIST}/novo?salvo=1`);
        router.refresh();
      } else {
        router.push(LIST);
        router.refresh();
      }
    });
  }

  /** Desativar, Reativar and Excluir use the same actions as the list. */
  function act(action: RowAction, fields: Record<string, string>, after: () => void) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    start(async () => {
      const result = await action(IDLE_ROW, data);
      if (result.status === "error") {
        setErrors(result.errors);
        setRemoving(false);
        return;
      }
      after();
      router.refresh();
    });
  }

  const field = (key: NewProductKey) => (
    <div key={key}>
      <label htmlFor={key} className="block font-medium">
        {fieldLabel(key, imported)}
        {key === "name" && <span className="font-normal text-slate-500"> (obrigatório)</span>}
      </label>
      <input
        id={key}
        name={key}
        type="text"
        inputMode={NUMERIC.includes(key) ? "decimal" : undefined}
        defaultValue={saved?.[key] ?? ""}
        autoComplete="off"
        aria-invalid={invalid.includes(key) || undefined}
        className={`${INPUT} ${invalid.includes(key) ? "border-red-500" : "border-slate-300"}`}
      />
      {HELP[key] && <p className="mt-1 text-xs text-slate-500">{HELP[key]}</p>}
    </div>
  );

  return (
    <form
      ref={form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit("list");
      }}
      className="mx-auto flex max-w-xl flex-col gap-5"
    >
      {id !== null && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="wording" value={imported ? "importada" : "nacional"} />
      {lines.length > 1 ? (
        <div>
          <label htmlFor="lineId" className="block font-medium">
            Linha de produto
          </label>
          <select id="lineId" name="lineId" value={chosenLine} onChange={(event) => setChosenLine(Number(event.target.value))} className={`${INPUT} border-slate-300`}>
            {lines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-slate-500">Define os parâmetros e a tabela de preços em que o equipamento entra.</p>
        </div>
      ) : (
        <input type="hidden" name="lineId" value={lineId} />
      )}

      <div className="flex items-center gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-slate-300 bg-white text-xs text-slate-500">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview or the photo served by the app itself
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            "sem foto"
          )}
        </div>
        <label className="cursor-pointer rounded-lg bg-brand-soft px-4 py-2.5 font-medium text-brand">
          {preview ? "Trocar foto" : "Adicionar foto"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const chosen = event.target.files?.[0] ?? null;
              setFile(chosen);
              setPreview(chosen ? URL.createObjectURL(chosen) : photo);
            }}
          />
        </label>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}

      {MAIN.map(field)}

      <details className="rounded-lg border border-slate-200 bg-white" open={invalid.some((key) => MORE.includes(key)) || undefined}>
        <summary className="cursor-pointer px-4 py-3 font-medium">Mais dados: fornecedor, crédito e embalagem</summary>
        <div className="flex flex-col gap-5 border-t border-slate-200 p-4">{MORE.map(field)}</div>
      </details>

      {id !== null && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            disabled={pending}
            onClick={() => act(setActive, { id: String(id), active: String(!active) }, () => router.push(LIST))}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium"
          >
            {active ? "Desativar" : "Reativar"}
          </button>
          {removing ? (
            <>
              <button
                key="confirm"
                type="button"
                disabled={pending}
                onClick={() => act(remove, { id: String(id) }, () => router.push(LIST))}
                className="rounded-lg border border-red-300 bg-white px-4 py-2.5 font-medium text-red-700"
              >
                Confirmar exclusão
              </button>
              <button key="cancel" type="button" onClick={() => setRemoving(false)} className="px-2 py-2.5 text-slate-600">
                Cancelar
              </button>
            </>
          ) : (
            <button key="ask" type="button" onClick={() => setRemoving(true)} className="px-2 py-2.5 font-medium text-red-700">
              Excluir
            </button>
          )}
        </div>
      )}

      {/* Always in reach: the buttons stay at the bottom of the screen while the fields scroll. */}
      <div className="sticky bottom-0 -mx-4 mt-2 flex flex-col gap-2 border-t border-slate-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:static md:mx-0 md:flex-row md:border-0 md:bg-transparent md:px-0">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-4 py-3.5 text-base font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
          {pending ? "Salvando…" : "Salvar equipamento"}
        </button>
        {id === null && (
          <button
            type="button"
            disabled={pending}
            onClick={() => submit("another")}
            className="rounded-lg bg-brand-soft px-4 py-3.5 text-base font-semibold text-brand disabled:opacity-60"
          >
            Salvar e adicionar outro
          </button>
        )}
      </div>
    </form>
  );
}

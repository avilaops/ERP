"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { DANGER, DANGER_OUTLINE, SECONDARY } from "@/components/ui";
import { fieldLabel, IDLE_ROW } from "@/lib/product-form";
import type { NewProductKey, ProductFormValues, ProductScreenResult, RowState } from "@/lib/product-form";

type Save = (formData: FormData) => Promise<ProductScreenResult>;
type RowAction = (state: RowState, formData: FormData) => Promise<RowState>;

const LIST = "/produtos";
const INPUT = "mt-1 w-full rounded-lg border bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand";
const IDENTIFICATION: NewProductKey[] = ["name", "code", "supplierName", "supplierModel"];
const COSTS: NewProductKey[] = ["supplierPriceUsd", "advisoryCost", "taxCredit", "packaging"];
const HELP: Partial<Record<NewProductKey, string>> = {
  code: "Ex.: LD-B001. Pode ficar para depois.",
  advisoryCost: "Em branco, o equipamento entra como sem custo.",
};
const NUMERIC: NewProductKey[] = ["supplierPriceUsd", "advisoryCost", "taxCredit", "packaging"];

/**
 * One equipment on one screen: identification and costs remain visible, with
 * the buttons always in reach at the bottom. It only collects
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
  const feedback = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [persistedId, setPersistedId] = useState(id);
  // The cost is called by what the line chosen buys: it follows the select.
  const [chosenLine, setChosenLine] = useState(lineId);
  const imported = lines.find((line) => line.id === chosenLine)?.imported ?? true;
  const [invalid, setInvalid] = useState<NewProductKey[]>([]);
  const [preview, setPreview] = useState<string | null>(photo);
  const [file, setFile] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (errors.length === 0) return;
    requestAnimationFrame(() => feedback.current?.focus());
  }, [errors]);

  /** Saves the fields, then the photo when one was chosen, and goes on to the list or to a blank screen. */
  function submit(then: "list" | "another") {
    if (!form.current) return;
    const data = new FormData(form.current);
    start(async () => {
      let result: ProductScreenResult;
      try {
        result = await save(data);
      } catch {
        setErrors(["Não foi possível salvar o equipamento. Confira a conexão e tente novamente."]);
        setInvalid([]);
        return;
      }
      if (!result.ok) {
        setErrors(result.errors);
        setInvalid(result.invalid);
        return;
      }
      setPersistedId(result.id);
      if (file) {
        let sent: Response;
        try {
          sent = await fetch(`/api/produtos/${result.id}/foto`, { method: "PUT", body: file });
        } catch {
          setErrors(["O equipamento foi salvo, mas a foto não foi enviada. Confira a conexão e tente salvar novamente."]);
          setInvalid([]);
          return;
        }
        if (!sent.ok) {
          const detail = await sent.text().catch(() => "");
          setErrors([`O equipamento foi salvo, mas a foto não foi enviada.${detail ? ` ${detail}` : ""} Tente salvar novamente.`]);
          setInvalid([]);
          return;
        }
      }
      if (then === "another") {
        form.current?.reset();
        setFile(null);
        setPreview(null);
        setErrors([]);
        setInvalid([]);
        setPersistedId(null);
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
      {persistedId !== null && <input type="hidden" name="id" value={persistedId} />}
      <input type="hidden" name="wording" value={imported ? "importada" : "nacional"} />
      <section id="product-identification" aria-labelledby="product-identification-title" className="flex scroll-mt-4 flex-col gap-5 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 id="product-identification-title" className="text-lg font-semibold">Identificação e foto</h2>
          <p className="mt-1 text-sm text-slate-600">O nome identifica o equipamento. Os demais dados podem ser completados depois.</p>
        </div>
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

        {IDENTIFICATION.map(field)}
      </section>

      {errors.length > 0 && (
        <div ref={feedback} role="alert" tabIndex={-1} className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}

      <section id="product-costs" aria-labelledby="product-costs-title" className="flex scroll-mt-4 flex-col gap-5 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 id="product-costs-title" className="text-lg font-semibold">Custos e formação do preço</h2>
          <p className="mt-1 text-sm text-slate-600">Valores usados no cálculo da tabela. Em branco, o equipamento fica sinalizado para revisão.</p>
        </div>
        {COSTS.map(field)}
      </section>

      {id !== null && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            disabled={pending}
            onClick={() => act(setActive, { id: String(id), active: String(!active) }, () => router.push(LIST))}
            className={SECONDARY}
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
                className={DANGER_OUTLINE}
              >
                Confirmar exclusão
              </button>
              <button key="cancel" type="button" onClick={() => setRemoving(false)} className="inline-flex min-h-[var(--control)] items-center px-2 text-slate-600">
                Cancelar
              </button>
            </>
          ) : (
            <button key="ask" type="button" onClick={() => setRemoving(true)} className={DANGER}>
              Excluir
            </button>
          )}
        </div>
      )}

      {/* Always in reach: the buttons stay at the bottom of the screen while the fields scroll. */}
      <div className="sticky bottom-[var(--tabbar)] -mx-4 mt-2 flex flex-col gap-2 border-t border-slate-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:static md:mx-0 md:flex-row md:border-0 md:bg-transparent md:px-0">
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

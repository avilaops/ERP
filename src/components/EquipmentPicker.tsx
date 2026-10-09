"use client";

import { useState } from "react";

export type EquipmentChoice = { id: number; name: string; code: string | null; price: string };

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** How many results a search shows: what fits under the field without pushing the next action away. */
const SHOWN = 5;

/**
 * One equipment, chosen by searching its name or code instead of going through
 * the whole catalogue. Filters the list the server sent (name, code and the
 * published price, as text) and keeps the one chosen in a hidden field of the
 * form around it. Nothing is calculated here.
 */
export function EquipmentPicker({ items, chosen, name }: { items: EquipmentChoice[]; chosen: number; name: string }) {
  const [selected, setSelected] = useState(chosen);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const current = items.find((item) => item.id === selected) ?? items[0];
  const words = fold(search).split(/\s+/).filter(Boolean);
  const found = items.filter((item) => words.every((word) => fold(`${item.name} ${item.code ?? ""}`).includes(word)));

  return (
    <div>
      <input type="hidden" name={name} value={current.id} />
      {!searching ? (
        <div className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white p-3">
          <p className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-slate-600">Equipamento</span>
            <span className="block font-medium leading-snug">{current.name}</span>
            <span className="block text-sm text-slate-600">
              {current.code ?? "sem código"} · {current.price}
            </span>
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSearching(true);
            }}
            className="inline-flex min-h-[var(--control)] shrink-0 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50"
          >
            Trocar
          </button>
        </div>
      ) : (
        <div>
          <label htmlFor="busca-equipamento" className="block text-sm font-medium text-slate-700">
            Buscar equipamento por nome ou código
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="busca-equipamento"
              type="search"
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              // Enter here chooses the first result; it never sends the form half filled.
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (found[0]) {
                  setSelected(found[0].id);
                  setSearching(false);
                }
              }}
              placeholder="Ex.: supino ou LD-A001"
              autoComplete="off"
              className="block min-h-[var(--control)] w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-brand"
            />
            <button type="button" onClick={() => setSearching(false)} className="inline-flex min-h-[var(--control)] shrink-0 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50">
              Cancelar
            </button>
          </div>
          <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white" aria-label="Resultados da busca">
            {found.slice(0, SHOWN).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(item.id);
                    setSearching(false);
                  }}
                  className="flex min-h-[var(--control)] w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-slate-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug">{item.name}</span>
                    <span className="block text-xs text-slate-500">{item.code ?? "sem código"}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-sm font-semibold">{item.price}</span>
                </button>
              </li>
            ))}
            {found.length === 0 && <li className="px-3 py-3 text-sm text-slate-600">Nenhum equipamento com esse nome ou código.</li>}
          </ul>
          <p className="mt-1 text-xs text-slate-600" aria-live="polite">
            {found.length > SHOWN ? `${found.length} encontrados; mostrando ${SHOWN}. Digite mais para afinar.` : found.length === 1 ? "1 encontrado" : `${found.length} encontrados`}
          </p>
        </div>
      )}
    </div>
  );
}

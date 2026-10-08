"use client";

import { useState } from "react";
import type { ActionState } from "@/lib/order-form";
import { ActionForm } from "./ActionForm";

export type EquipmentOption = { id: number; name: string; code: string | null; price: string };

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * "Buscar equipamento por nome ou código": filters the list the server sent
 * (name, code and the published price, nothing else) and opens the order with
 * the one chosen. The price shown is text: nothing is calculated here.
 */
export function EquipmentSearch({
  items,
  version,
  action,
}: {
  items: EquipmentOption[];
  version: number;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [search, setSearch] = useState("");
  const words = fold(search).split(/\s+/).filter(Boolean);
  const found = items.filter((item) => words.every((word) => fold(`${item.name} ${item.code ?? ""}`).includes(word)));

  return (
    <div className="p-5">
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar equipamento por nome ou código…"
        aria-label="Buscar equipamento por nome ou código"
        autoFocus
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
      />
      <p className="mt-2 text-xs text-slate-600">
        {found.length} de {items.length} · toque no equipamento para abrir o pedido com ele; quantidade e os outros itens vêm na tela seguinte.
      </p>
      {found.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-600">Nenhum equipamento com esse nome ou código.</p>
      ) : (
        <ul className="mt-3 max-h-[28rem] divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200">
          {found.map((item) => (
            <li key={item.id}>
              <ActionForm action={action}>
                <input type="hidden" name="version" value={version} />
                <input type="hidden" name="productId" value={item.id} />
                <input type="hidden" name="quantity" value="1" />
                <button type="submit" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block font-medium">{item.name}</span>
                    <span className="block text-xs text-slate-500">{item.code ?? "sem código"}</span>
                  </span>
                  <span className="shrink-0 font-semibold">{item.price}</span>
                </button>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

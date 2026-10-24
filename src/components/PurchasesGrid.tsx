"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Pill } from "@/components/ui";
import type { PurchaseStatus } from "@/lib/db/purchases";

export type PurchaseGridRow = {
  id: number;
  supplier: string;
  kind: string;
  status: PurchaseStatus;
  statusLabel: string;
  orderedOn: string;
  arrival: string;
  pieces: string;
  total: string;
  detail: string;
};

type Key = "supplier" | "kind" | "status" | "orderedOn" | "arrival" | "pieces" | "total";
type Preferences = { order: Key[]; widths: Partial<Record<Key, number>> };
type Props = { rows: PurchaseGridRow[]; sortHrefs: Record<Key, string>; sort: string; direction: "asc" | "desc" };

const KEYS: Key[] = ["supplier", "kind", "status", "orderedOn", "arrival", "pieces", "total"];
const EMPTY: Preferences = { order: [], widths: {} };
const STORE = "erp:compras:tabela:v1";
const TONE = { pedido: "neutral", em_transito: "warn", recebida: "good", cancelada: "neutral" } as const;
let cache: Preferences | null = null;
const listeners = new Set<() => void>();

const read = (): Preferences => {
  try {
    const value = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Partial<Preferences>;
    return { order: (value.order ?? []).filter((key): key is Key => KEYS.includes(key as Key)), widths: value.widths ?? {} };
  } catch {
    return EMPTY;
  }
};
const snapshot = () => { if (typeof window === "undefined") return EMPTY; cache ??= read(); return cache; };
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === STORE) { cache = null; listener(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
};
const save = (value: Preferences) => {
  cache = value;
  try { localStorage.setItem(STORE, JSON.stringify(value)); } catch { /* Persistence is optional. */ }
  listeners.forEach((listener) => listener());
};
const clamp = (value: number) => Math.max(112, Math.min(640, Math.round(value)));

export function PurchasesGrid({ rows, sortHrefs, sort, direction }: Props) {
  const saved = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const preferences = useMemo(() => ({ order: [...new Set(saved.order), ...KEYS.filter((key) => !saved.order.includes(key))], widths: saved.widths }), [saved]);
  const [dragging, setDragging] = useState<Key | null>(null);
  const columns: Record<Key, { label: string; sort: string; width: number; right?: boolean }> = {
    supplier: { label: "Fornecedor", sort: "fornecedor", width: 260 },
    kind: { label: "Tipo", sort: "tipo", width: 170 },
    status: { label: "Situação", sort: "situacao", width: 160 },
    orderedOn: { label: "Pedido em", sort: "pedido", width: 150 },
    arrival: { label: "Chegada", sort: "chegada", width: 170 },
    pieces: { label: "Peças", sort: "pecas", width: 120, right: true },
    total: { label: "Total", sort: "total", width: 170, right: true },
  };
  const width = (key: Key) => clamp(preferences.widths[key] ?? columns[key].width);
  const resize = (key: Key, value: number) => save({ ...preferences, widths: { ...preferences.widths, [key]: clamp(value) } });
  const move = (from: Key, to: Key) => {
    if (from === to) return;
    const order = preferences.order.filter((key) => key !== from);
    order.splice(order.indexOf(to), 0, from);
    save({ ...preferences, order });
  };
  const cell = (row: PurchaseGridRow, key: Key) => {
    if (key === "supplier") return <><Link href={`/compras/${row.id}`} className="break-words font-medium text-brand underline">{row.supplier}</Link>{row.detail && <span className="block text-xs text-slate-500">{row.detail}</span>}</>;
    if (key === "status") return <Pill tone={TONE[row.status]}>{row.statusLabel}</Pill>;
    return row[key];
  };

  return <div className="hidden overflow-x-auto md:block" aria-label="Tabela de compras personalizável">
    <p className="px-3 py-2 text-xs text-slate-600">Clique no título para ordenar. Arraste o ícone para mover a coluna e a borda para ajustar a largura.</p>
    <table className="w-max min-w-full table-fixed text-sm">
      <colgroup>{preferences.order.map((key) => <col key={key} style={{ width: width(key) }} />)}</colgroup>
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{preferences.order.map((key) => { const column = columns[key]; const current = sort === column.sort; return <th key={key} scope="col" className={`relative px-3 py-2 ${column.right ? "text-right" : "text-left"}`} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragging) move(dragging, key); setDragging(null); }}><span className={`flex items-center gap-1 ${column.right ? "justify-end" : ""}`}><button type="button" draggable aria-label={`Mover coluna ${column.label}`} className="inline-flex min-h-[var(--control)] min-w-[var(--control)] cursor-grab items-center justify-center rounded text-base normal-case text-slate-500 hover:bg-slate-200" onDragStart={(event) => { setDragging(key); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragging(null)}>⠿</button><Link href={sortHrefs[key]} aria-current={current ? "true" : undefined} className="inline-flex min-h-[var(--control)] items-center gap-1 hover:text-brand">{column.label}{current && <span aria-label={direction === "asc" ? "crescente" : "decrescente"}>{direction === "asc" ? "↑" : "↓"}</span>}</Link></span><span role="separator" tabIndex={0} aria-label={`Ajustar largura de ${column.label}`} aria-orientation="vertical" className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none hover:bg-brand/30 focus:bg-brand/30" onPointerDown={(event) => { event.preventDefault(); const start = event.clientX; const original = width(key); const moving = (next: PointerEvent) => resize(key, original + next.clientX - start); const stop = () => { window.removeEventListener("pointermove", moving); window.removeEventListener("pointerup", stop); }; window.addEventListener("pointermove", moving); window.addEventListener("pointerup", stop, { once: true }); }} onKeyDown={(event) => { if (event.key === "ArrowLeft") resize(key, width(key) - 16); if (event.key === "ArrowRight") resize(key, width(key) + 16); }} /></th>; })}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-200 align-top">{preferences.order.map((key) => <td key={key} className={`px-3 py-3 ${columns[key].right ? "text-right" : ""}`}>{cell(row, key)}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

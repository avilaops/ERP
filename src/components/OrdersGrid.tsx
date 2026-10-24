"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Pill } from "@/components/ui";
import type { OrderRow } from "@/lib/orders-view";

type ColumnKey = "customer" | "seller" | "discount" | "total" | "status" | "updated";
type Preferences = { order: ColumnKey[]; widths: Partial<Record<ColumnKey, number>> };
type Column = { key: ColumnKey; label: string; align?: "left" | "right"; defaultWidth: number; sortHref: string; sortCurrent: boolean; sortDirection: "asc" | "desc" };
type Props = { rows: OrderRow[]; showSeller: boolean; sortHrefs: Record<ColumnKey, string>; sort: string; direction: "asc" | "desc" };

const STORAGE_KEY = "erp:pedidos:tabela:v1";
const EMPTY: Preferences = { order: [], widths: {} };
const tone = { em_negociacao: "neutral", aguardando_aprovacao: "warn", fechado: "good", perdido: "bad", cancelado: "neutral" } as const;
let stored: Preferences | null = null;
const listeners = new Set<() => void>();
const clamp = (value: number) => Math.max(112, Math.min(640, Math.round(value)));
const read = (): Preferences => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Preferences>;
    return { order: [...new Set((parsed.order ?? []).filter((key): key is ColumnKey => typeof key === "string"))], widths: parsed.widths ?? {} };
  } catch { return EMPTY; }
};
const snapshot = () => { if (typeof window === "undefined") return EMPTY; stored ??= read(); return stored; };
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const storage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) { stored = null; listener(); } };
  window.addEventListener("storage", storage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", storage); };
};
const save = (next: Preferences) => {
  stored = next;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Restricted storage only disables persistence. */ }
  listeners.forEach((listener) => listener());
};

export function OrdersGrid({ rows, showSeller, sortHrefs, sort, direction }: Props) {
  const available = useMemo<ColumnKey[]>(() => ["customer", ...(showSeller ? ["seller" as const] : []), "discount", "total", "status", "updated"], [showSeller]);
  const saved = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const preferences = useMemo(() => ({ order: [...new Set(saved.order.filter((key) => available.includes(key))), ...available.filter((key) => !saved.order.includes(key))], widths: saved.widths }), [available, saved]);
  const [dragging, setDragging] = useState<ColumnKey | null>(null);
  const columns = useMemo<Record<ColumnKey, Column>>(() => ({
    customer: { key: "customer", label: "Cliente", defaultWidth: 320, sortHref: sortHrefs.customer, sortCurrent: sort === "cliente", sortDirection: direction },
    seller: { key: "seller", label: "Vendedor", defaultWidth: 180, sortHref: sortHrefs.seller, sortCurrent: sort === "vendedor", sortDirection: direction },
    discount: { key: "discount", label: "Desconto", align: "right", defaultWidth: 132, sortHref: sortHrefs.discount, sortCurrent: sort === "desconto", sortDirection: direction },
    total: { key: "total", label: "Total com IPI", align: "right", defaultWidth: 164, sortHref: sortHrefs.total, sortCurrent: sort === "total", sortDirection: direction },
    status: { key: "status", label: "Situação", defaultWidth: 154, sortHref: sortHrefs.status, sortCurrent: sort === "situacao", sortDirection: direction },
    updated: { key: "updated", label: "Atualizado", defaultWidth: 174, sortHref: sortHrefs.updated, sortCurrent: sort === "atualizacao", sortDirection: direction },
  }), [direction, sort, sortHrefs]);
  const ordered = preferences.order.map((key) => columns[key]);
  const width = (key: ColumnKey) => clamp(preferences.widths[key] ?? columns[key].defaultWidth);
  const setWidth = (key: ColumnKey, value: number) => save({ ...preferences, widths: { ...preferences.widths, [key]: clamp(value) } });
  const move = (from: ColumnKey, to: ColumnKey) => { if (from === to) return; const order = preferences.order.filter((key) => key !== from); order.splice(order.indexOf(to), 0, from); save({ ...preferences, order }); };
  const cell = (row: OrderRow, key: ColumnKey) => {
    if (key === "customer") return <><Link href={`/pedidos/${row.number}`} className="break-words font-medium text-brand underline">{row.customer}</Link><span className="block break-words text-xs text-slate-500">{[row.detail, row.document].filter(Boolean).join(" · ")}</span></>;
    if (key === "seller") return row.seller;
    if (key === "discount") return row.discount;
    if (key === "total") return row.total;
    if (key === "status") return <Pill tone={tone[row.status]}>{row.statusLabel}</Pill>;
    return row.updated;
  };
  return <div className="hidden overflow-x-auto md:block" aria-label="Tabela de pedidos personalizável">
    <p className="px-3 py-2 text-xs text-slate-600">Clique no título para ordenar. Arraste o ícone para mover a coluna e a borda para ajustar a largura.</p>
    <table className="w-max min-w-full table-fixed text-sm">
      <colgroup>{ordered.map((column) => <col key={column.key} style={{ width: `${width(column.key)}px` }} />)}</colgroup>
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{ordered.map((column) => <th key={column.key} scope="col" className={`relative select-none px-3 py-2 ${column.align === "right" ? "text-right" : "text-left"}`} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragging) move(dragging, column.key); setDragging(null); }}>
        <span className={`flex items-center gap-1 ${column.align === "right" ? "justify-end" : "justify-start"}`}>
          <button type="button" draggable aria-label={`Mover coluna ${column.label}`} title={`Arraste para mover ${column.label}`} className="inline-flex min-h-[var(--control)] min-w-[var(--control)] cursor-grab items-center justify-center rounded text-base normal-case text-slate-500 hover:bg-slate-200" onDragStart={(event) => { setDragging(column.key); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragging(null)}>⠿</button>
          <Link href={column.sortHref} aria-current={column.sortCurrent ? "true" : undefined} className="inline-flex min-h-[var(--control)] items-center gap-1 text-left hover:text-brand">{column.label}{column.sortCurrent && <span aria-label={direction === "asc" ? "crescente" : "decrescente"}>{direction === "asc" ? "↑" : "↓"}</span>}</Link>
        </span>
        <span role="separator" tabIndex={0} aria-label={`Ajustar largura de ${column.label}`} aria-orientation="vertical" className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none hover:bg-brand/30 focus:bg-brand/30" onPointerDown={(event) => { event.preventDefault(); const startX = event.clientX; const startWidth = width(column.key); const resize = (next: PointerEvent) => setWidth(column.key, startWidth + next.clientX - startX); const stop = () => { window.removeEventListener("pointermove", resize); window.removeEventListener("pointerup", stop); }; window.addEventListener("pointermove", resize); window.addEventListener("pointerup", stop, { once: true }); }} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); setWidth(column.key, width(column.key) - 16); } if (event.key === "ArrowRight") { event.preventDefault(); setWidth(column.key, width(column.key) + 16); } }} />
      </th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.number} className="border-t border-slate-200 align-top">{ordered.map((column) => <td key={column.key} className={`px-3 py-3 ${column.align === "right" ? "text-right" : ""} ${column.key === "total" ? "whitespace-nowrap font-semibold" : ""}`}>{cell(row, column.key)}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

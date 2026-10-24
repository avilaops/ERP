"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Pill } from "@/components/ui";

export type CustomerGridRow = { id: number; name: string; tradeName: string | null; document: string; city: string; phone: string; purchases: string; purchaseCount: string; lastPurchase: string; complete: boolean; completeness: string; taxpayer: string };
type Key = "customer" | "document" | "city" | "phone" | "purchases" | "lastPurchase" | "registration";
type Preferences = { order: Key[]; widths: Partial<Record<Key, number>> };
type Props = { rows: CustomerGridRow[]; sortHrefs: Record<Key, string>; sort: string; direction: "asc" | "desc" };
const STORE = "erp:clientes:tabela:v1";
const EMPTY: Preferences = { order: [], widths: {} };
const keys: Key[] = ["customer", "document", "city", "phone", "purchases", "lastPurchase", "registration"];
let cache: Preferences | null = null;
const listeners = new Set<() => void>();
const read = () => { try { const value = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Partial<Preferences>; return { order: (value.order ?? []).filter((key): key is Key => keys.includes(key as Key)), widths: value.widths ?? {} }; } catch { return EMPTY; } };
const snapshot = () => { if (typeof window === "undefined") return EMPTY; cache ??= read(); return cache; };
const subscribe = (listener: () => void) => { listeners.add(listener); const onStorage = (event: StorageEvent) => { if (event.key === STORE) { cache = null; listener(); } }; window.addEventListener("storage", onStorage); return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); }; };
const save = (value: Preferences) => { cache = value; try { localStorage.setItem(STORE, JSON.stringify(value)); } catch { /* Persistence is optional. */ } listeners.forEach((listener) => listener()); };
const clamp = (value: number) => Math.max(112, Math.min(640, Math.round(value)));

export function CustomersGrid({ rows, sortHrefs, sort, direction }: Props) {
  const saved = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const preferences = useMemo(() => ({ order: [...new Set(saved.order), ...keys.filter((key) => !saved.order.includes(key))], widths: saved.widths }), [saved]);
  const [dragging, setDragging] = useState<Key | null>(null);
  const columns: Record<Key, { label: string; sort: string; width: number; right?: boolean }> = {
    customer: { label: "Cliente", sort: "nome", width: 280 }, document: { label: "Documento", sort: "documento", width: 180 }, city: { label: "Cidade/UF", sort: "cidade", width: 180 }, phone: { label: "Celular", sort: "celular", width: 150 }, purchases: { label: "Compras", sort: "compras", width: 170, right: true }, lastPurchase: { label: "Última compra", sort: "ultima_compra", width: 160 }, registration: { label: "Cadastro", sort: "completude", width: 190 },
  };
  const width = (key: Key) => clamp(preferences.widths[key] ?? columns[key].width);
  const resize = (key: Key, value: number) => save({ ...preferences, widths: { ...preferences.widths, [key]: clamp(value) } });
  const move = (from: Key, to: Key) => { if (from === to) return; const order = preferences.order.filter((key) => key !== from); order.splice(order.indexOf(to), 0, from); save({ ...preferences, order }); };
  const cell = (row: CustomerGridRow, key: Key) => {
    if (key === "customer") return <><Link href={`/clientes/${row.id}`} className="break-words font-medium text-brand underline">{row.name}</Link>{row.tradeName && <span className="block break-words text-xs text-slate-500">{row.tradeName}</span>}</>;
    if (key === "document") return row.document;
    if (key === "city") return row.city;
    if (key === "phone") return row.phone;
    if (key === "purchases") return row.purchases === "—" ? "—" : <><span className="block font-medium">{row.purchases}</span><span className="text-xs text-slate-500">{row.purchaseCount}</span></>;
    if (key === "lastPurchase") return row.lastPurchase;
    return <><Pill tone={row.complete ? "good" : "warn"}>{row.completeness}</Pill><span className="mt-1 block text-xs text-slate-500">ICMS: {row.taxpayer}</span></>;
  };
  return <div className="hidden overflow-x-auto md:block" aria-label="Tabela de clientes personalizável">
    <p className="px-3 py-2 text-xs text-slate-600">Clique no título para ordenar. Arraste o ícone para mover a coluna e a borda para ajustar a largura.</p>
    <table className="w-max min-w-full table-fixed text-sm"><colgroup>{preferences.order.map((key) => <col key={key} style={{ width: width(key) }} />)}</colgroup>
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{preferences.order.map((key) => { const column = columns[key]; const current = sort === column.sort; return <th key={key} scope="col" className={`relative px-3 py-2 ${column.right ? "text-right" : "text-left"}`} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragging) move(dragging, key); setDragging(null); }}><span className={`flex items-center gap-1 ${column.right ? "justify-end" : ""}`}><button type="button" draggable aria-label={`Mover coluna ${column.label}`} className="inline-flex min-h-[var(--control)] min-w-[var(--control)] cursor-grab items-center justify-center rounded text-base normal-case text-slate-500 hover:bg-slate-200" onDragStart={(event) => { setDragging(key); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragging(null)}>⠿</button><Link href={sortHrefs[key]} aria-current={current ? "true" : undefined} className="inline-flex min-h-[var(--control)] items-center gap-1 hover:text-brand">{column.label}{current && <span aria-label={direction === "asc" ? "crescente" : "decrescente"}>{direction === "asc" ? "↑" : "↓"}</span>}</Link></span><span role="separator" tabIndex={0} aria-label={`Ajustar largura de ${column.label}`} aria-orientation="vertical" className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none hover:bg-brand/30 focus:bg-brand/30" onPointerDown={(event) => { event.preventDefault(); const start = event.clientX; const original = width(key); const moving = (next: PointerEvent) => resize(key, original + next.clientX - start); const stop = () => { window.removeEventListener("pointermove", moving); window.removeEventListener("pointerup", stop); }; window.addEventListener("pointermove", moving); window.addEventListener("pointerup", stop, { once: true }); }} onKeyDown={(event) => { if (event.key === "ArrowLeft") resize(key, width(key) - 16); if (event.key === "ArrowRight") resize(key, width(key) + 16); }} /></th>; })}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-200 align-top">{preferences.order.map((key) => <td key={key} className={`px-3 py-3 ${columns[key].right ? "text-right" : ""}`}>{cell(row, key)}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Pill } from "@/components/ui";

export type ProductGridRow = { id: number; name: string; code: string; supplier: string; model: string; ncm: string; active: boolean };
type Key = "name" | "code" | "supplier" | "model" | "ncm" | "status";
type Prefs = { order: Key[]; widths: Partial<Record<Key, number>> };
type Props = { rows: ProductGridRow[]; hrefs: Record<Key, string>; sort: string; direction: "asc" | "desc" };
const KEYS: Key[] = ["name", "code", "supplier", "model", "ncm", "status"];
const EMPTY: Prefs = { order: [], widths: {} };
const STORE = "erp:produtos:tabela:v1";
let cache: Prefs | null = null;
const listeners = new Set<() => void>();
const snap = () => { if (typeof window === "undefined") return EMPTY; if (!cache) { try { const parsed = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Partial<Prefs>; cache = { order: (parsed.order ?? []).filter((key): key is Key => KEYS.includes(key as Key)), widths: parsed.widths ?? {} }; } catch { cache = EMPTY; } } return cache; };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const save = (next: Prefs) => { cache = next; try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* Persistence is optional. */ } listeners.forEach((listener) => listener()); };
const clamp = (value: number) => Math.max(112, Math.min(640, Math.round(value)));

export function ProductsGrid({ rows, hrefs, sort, direction }: Props) {
  const saved = useSyncExternalStore(subscribe, snap, () => EMPTY);
  const prefs = useMemo(() => ({ order: [...new Set(saved.order), ...KEYS.filter((key) => !saved.order.includes(key))], widths: saved.widths }), [saved]);
  const [dragging, setDragging] = useState<Key | null>(null);
  const meta: Record<Key, { label: string; sort: string; width: number }> = { name: { label: "Equipamento", sort: "nome", width: 300 }, code: { label: "Código", sort: "codigo", width: 150 }, supplier: { label: "Fornecedor", sort: "fornecedor", width: 200 }, model: { label: "Modelo", sort: "modelo", width: 180 }, ncm: { label: "NCM", sort: "ncm", width: 150 }, status: { label: "Situação", sort: "situacao", width: 150 } };
  const width = (key: Key) => clamp(prefs.widths[key] ?? meta[key].width);
  const resize = (key: Key, value: number) => save({ ...prefs, widths: { ...prefs.widths, [key]: clamp(value) } });
  const move = (from: Key, to: Key) => { if (from === to) return; const order = prefs.order.filter((key) => key !== from); order.splice(order.indexOf(to), 0, from); save({ ...prefs, order }); };
  const cell = (row: ProductGridRow, key: Key) => key === "name" ? <Link href={`/produtos/${row.id}`} className="break-words font-medium text-brand underline">{row.name}</Link> : key === "status" ? <Pill tone={row.active ? "good" : "neutral"}>{row.active ? "Ativo" : "Inativo"}</Pill> : row[key];
  return <div className="hidden overflow-x-auto md:block" aria-label="Tabela de produtos personalizável"><p className="px-3 py-2 text-xs text-slate-600">Clique no título para ordenar. Arraste o ícone para mover a coluna e a borda para ajustar a largura.</p><table className="w-max min-w-full table-fixed text-sm"><colgroup>{prefs.order.map((key) => <col key={key} style={{ width: width(key) }} />)}</colgroup><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{prefs.order.map((key) => { const column = meta[key]; const current = sort === column.sort; return <th key={key} className="relative px-3 py-2 text-left" onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragging) move(dragging, key); setDragging(null); }}><span className="flex items-center gap-1"><button type="button" draggable aria-label={`Mover coluna ${column.label}`} className="inline-flex min-h-[var(--control)] min-w-[var(--control)] cursor-grab items-center justify-center rounded text-base normal-case text-slate-500 hover:bg-slate-200" onDragStart={(event) => { setDragging(key); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragging(null)}>⠿</button><Link href={hrefs[key]} aria-current={current ? "true" : undefined} className="inline-flex min-h-[var(--control)] items-center gap-1 hover:text-brand">{column.label}{current && (direction === "asc" ? " ↑" : " ↓")}</Link></span><span role="separator" tabIndex={0} aria-label={`Ajustar largura de ${column.label}`} className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none hover:bg-brand/30 focus:bg-brand/30" onPointerDown={(event) => { event.preventDefault(); const start = event.clientX; const original = width(key); const moving = (next: PointerEvent) => resize(key, original + next.clientX - start); const stop = () => { window.removeEventListener("pointermove", moving); window.removeEventListener("pointerup", stop); }; window.addEventListener("pointermove", moving); window.addEventListener("pointerup", stop, { once: true }); }} onKeyDown={(event) => { if (event.key === "ArrowLeft") resize(key, width(key) - 16); if (event.key === "ArrowRight") resize(key, width(key) + 16); }} /></th>; })}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-200 align-top">{prefs.order.map((key) => <td key={key} className="px-3 py-3">{cell(row, key)}</td>)}</tr>)}</tbody></table></div>;
}

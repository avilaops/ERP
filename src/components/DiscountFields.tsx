"use client";

import { useState } from "react";
import { percentFromTotal, percentFromValue, valueFromPercent } from "@/lib/discount-entry";
import { parsePercent } from "@/lib/format";

const INPUT = "block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-base disabled:bg-slate-100";
const LABEL = "block text-xs font-medium text-slate-600";
/** The right end of the slider and of the bar, as in the prototype. */
const SCALE = 0.6;

const share = (rate: number) => `${Math.max(0, Math.min(1, rate / SCALE)) * 100}%`;
const percentText = (rate: number) => `${(rate * 100).toFixed(1).replace(".", ",").replace(/,0$/, "")}%`;

/**
 * The discount, in % and in reais: typing one fills the other, and so do the
 * slider and "Cliente quer pagar". Only the percentage is sent; the rest are
 * ways of typing it. `free` and `limit` only draw the bar: who may give what is
 * decided on the server, when the order is saved.
 */
export function DiscountFields({
  name,
  form,
  percent,
  tableTotal,
  disabled = false,
  invoiceFactor = 1,
  free = null,
  limit = null,
}: {
  name: string;
  form?: string;
  percent: string;
  tableTotal: number;
  disabled?: boolean;
  /** What the total of the order has over the sale: 1 + IPI. */
  invoiceFactor?: number;
  /** The discount the team gives without approval, as a fraction. */
  free?: number | null;
  /** The largest discount of who is looking, when the server sent it. */
  limit?: number | null;
}) {
  const [rate, setRate] = useState(percent);
  const [value, setValue] = useState(() => valueFromPercent(percent, tableTotal));
  const [target, setTarget] = useState("");

  const applyRate = (next: string) => {
    setRate(next);
    setValue(valueFromPercent(next, tableTotal));
  };
  const current = parsePercent(rate.trim() === "" ? "0" : rate.trim()) ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL}>
          Desconto em %
          <input
            form={form}
            name={name}
            type="text"
            inputMode="decimal"
            value={rate}
            disabled={disabled}
            onChange={(event) => {
              applyRate(event.target.value);
              setTarget("");
            }}
            className={`${INPUT} mt-1`}
          />
        </label>
        <label className={LABEL}>
          Desconto em R$
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={value}
            disabled={disabled || tableTotal <= 0}
            onChange={(event) => {
              setValue(event.target.value);
              setTarget("");
              const next = percentFromValue(event.target.value, tableTotal);
              if (next !== null) setRate(next);
            }}
            className={`${INPUT} mt-1`}
          />
        </label>
      </div>

      {!disabled && (
        <input
          type="range"
          min={0}
          max={SCALE * 100}
          step={0.5}
          value={Math.min(SCALE * 100, current * 100)}
          aria-label="Desconto, de 0 a 60%"
          onChange={(event) => {
            applyRate(event.target.value.replace(".", ","));
            setTarget("");
          }}
          className="w-full accent-brand"
        />
      )}

      {!disabled && tableTotal > 0 && (
        <label className={LABEL}>
          Cliente quer pagar (total do pedido)
          <input
            type="text"
            inputMode="decimal"
            placeholder="R$ — calcula o desconto para você"
            value={target}
            onChange={(event) => {
              setTarget(event.target.value);
              const next = percentFromTotal(event.target.value, tableTotal, invoiceFactor);
              if (next !== null) applyRate(next);
            }}
            className={`${INPUT} mt-1`}
          />
        </label>
      )}

      {free !== null && (
        <div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-red-300" role="img" aria-label="Faixas de desconto">
            {limit !== null && limit > free && <span className="absolute inset-y-0 left-0 bg-amber-300" style={{ width: share(limit) }} />}
            <span className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: share(free) }} />
            <span className="absolute inset-y-0 w-0.5 bg-slate-900" style={{ left: share(current) }} />
          </div>
          <p className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-slate-600">
            <span>
              <strong>Livre</strong> até {percentText(free)}
            </span>
            {limit !== null && limit > free && (
              <span>
                <strong>Sua alçada</strong> até {percentText(limit)}
              </span>
            )}
            <span>
              <strong>Aprovação</strong> acima
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

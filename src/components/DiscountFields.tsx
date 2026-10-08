"use client";

import { useState } from "react";
import { percentFromValue, valueFromPercent } from "@/lib/discount-entry";

const INPUT = "block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-base disabled:bg-slate-100";
const LABEL = "block text-xs font-medium text-slate-600";

/**
 * The discount, in % and in reais: typing one fills the other. Only the
 * percentage is sent; the amount in reais is a way of typing it.
 */
export function DiscountFields({
  name,
  form,
  percent,
  tableTotal,
  disabled = false,
}: {
  name: string;
  form?: string;
  percent: string;
  tableTotal: number;
  disabled?: boolean;
}) {
  const [rate, setRate] = useState(percent);
  const [value, setValue] = useState(() => valueFromPercent(percent, tableTotal));

  return (
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
            setRate(event.target.value);
            setValue(valueFromPercent(event.target.value, tableTotal));
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
            const next = percentFromValue(event.target.value, tableTotal);
            if (next !== null) setRate(next);
          }}
          className={`${INPUT} mt-1`}
        />
      </label>
    </div>
  );
}

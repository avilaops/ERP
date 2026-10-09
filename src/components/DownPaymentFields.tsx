"use client";

import { useState } from "react";
import { sharePercentFromValue, valueFromSharePercent } from "@/lib/discount-entry";

const INPUT = "mt-1 block w-full min-w-0 rounded border border-slate-300 bg-white px-3 py-2 text-right outline-none focus:ring-2 focus:ring-brand disabled:bg-slate-100";

/**
 * The down payment, in reais and in % of the total of the order: typing one
 * fills the other. Only the amount in reais is sent; the percentage is a way of
 * typing it. Whether it reaches the policy is decided on the server, when saved.
 */
export function DownPaymentFields({ name, amount, invoiceTotal, disabled = false }: { name: string; amount: string; invoiceTotal: number; disabled?: boolean }) {
  const [value, setValue] = useState(amount);
  const [rate, setRate] = useState(() => (amount.trim() === "" ? "" : (sharePercentFromValue(amount, invoiceTotal) ?? "")));

  return (
    <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
      <label className="block text-sm font-medium">
        Entrada (R$)
        <input
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={value}
          placeholder="0,00"
          onChange={(event) => {
            setValue(event.target.value);
            setRate(event.target.value.trim() === "" ? "" : (sharePercentFromValue(event.target.value, invoiceTotal) ?? rate));
          }}
          className={INPUT}
        />
      </label>
      <label className="block text-sm font-medium">
        Entrada (%)
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={rate}
          placeholder="0"
          aria-label="Entrada em % do total do pedido"
          onChange={(event) => {
            setRate(event.target.value);
            setValue(event.target.value.trim() === "" ? "" : valueFromSharePercent(event.target.value, invoiceTotal));
          }}
          className={INPUT}
        />
      </label>
    </div>
  );
}

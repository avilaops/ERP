/** Factory finish samples are illustrative; custom colours keep their full name. */
const FINISHES: Record<string, string> = {
  "Piano Black": "#121212",
  "Graphite Black": "#3a3b3d",
  "Light Grey": "#c8cacc",
  "Performance Red": "#b8242a",
  "Titanium Grey": "#5e6367",
  "Hermès Orange": "#e2702a",
  "Apple Green": "#a6ce39",
  "Ocean Blue": "#1f4ea5",
};

export function EquipmentColorPicker({ name, label, current, options }: {
  name: string;
  label: string;
  current?: string | null;
  options: string[];
}) {
  const available = current && !options.includes(current) ? [...options, current] : options;
  return (
    <details className="w-full min-w-0 rounded border border-slate-300 bg-white">
      <summary className="min-h-[var(--control)] cursor-pointer px-3 py-3 text-sm">
        {label}: <strong>{current || "Escolher cor"}</strong>
      </summary>
      <fieldset className="min-w-0 border-t border-slate-200 p-3">
        <legend className="sr-only">{label}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {["", ...available].map((color) => (
            <label key={color} className="flex min-h-[var(--control)] min-w-0 cursor-pointer items-center gap-2 rounded border border-slate-300 p-2 text-sm has-checked:border-brand has-checked:bg-brand-soft">
              <input type="radio" name={name} value={color} defaultChecked={(current ?? "") === color} className="shrink-0 accent-brand" />
              {FINISHES[color] && <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded border border-slate-300" style={{ backgroundColor: FINISHES[color] }} />}
              <span className="min-w-0 break-words">{color || "Não escolhida"}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </details>
  );
}

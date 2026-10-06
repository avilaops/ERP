"use client";

import { useState } from "react";

export type AccessOption = { role: string; label: string; note: string };
export type ScreenOption = { key: string; label: string; roles: readonly string[] };

/**
 * The type of access and, right under it, every screen of the system at once:
 * the ones of the chosen type come ticked, and unticking one takes it away from
 * this person. It only shows and collects the choice. What each type may open
 * comes from the server, and the server checks it again when saving.
 */
export function AccessPicker({
  options,
  screens,
  role: initialRole,
  items: initialItems,
}: {
  options: AccessOption[];
  screens: ScreenOption[];
  role: string;
  /** The screens left to the person, or `null` for all of the type's. */
  items: string[] | null;
}) {
  const [role, setRole] = useState(initialRole);
  // What was unticked for the type on screen. Changing the type starts from all of its screens.
  const [off, setOff] = useState<string[]>(() =>
    initialItems === null ? [] : screens.filter((screen) => screen.roles.includes(initialRole) && !initialItems.includes(screen.key)).map((screen) => screen.key),
  );
  const chosen = options.find((option) => option.role === role);
  const open = screens.filter((screen) => screen.roles.includes(role) && !off.includes(screen.key)).length;

  return (
    <div className="flex flex-col gap-3">
      <fieldset>
        <legend className="font-medium">Tipo de acesso</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {options.map((option) => (
            <label
              key={option.role}
              className="flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-center text-sm font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-white"
            >
              <input
                type="radio"
                name="role"
                value={option.role}
                checked={role === option.role}
                onChange={() => {
                  setRole(option.role);
                  setOff([]);
                }}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
        {/* On a phone the boxes below already say what the type opens. */}
        {chosen && <p className="mt-2 hidden text-sm text-slate-600 md:block">{chosen.note}</p>}
      </fieldset>

      <fieldset>
        <legend className="flex w-full items-baseline justify-between gap-3 font-medium">
          <span>Telas liberadas</span>
          <span className="text-xs font-normal text-slate-500">{open} marcadas · cinza: fora deste tipo</span>
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-x-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5">
          {screens.map((screen) => {
            const possible = screen.roles.includes(role);
            return (
              <label key={screen.key} className={`flex items-center gap-2 py-1.5 text-sm ${possible ? "" : "text-slate-400"}`}>
                <input
                  type="checkbox"
                  name="items"
                  value={screen.key}
                  disabled={!possible}
                  checked={possible && !off.includes(screen.key)}
                  onChange={(event) => setOff(event.target.checked ? off.filter((key) => key !== screen.key) : [...off, screen.key])}
                  className="h-5 w-5 shrink-0"
                />
                <span className="min-w-0 leading-tight">{screen.label}</span>
              </label>
            );
          })}
        </div>
        <p className="mt-1 hidden text-xs text-slate-500 md:block">As telas em cinza não fazem parte deste tipo de acesso. Para liberar, escolha outro tipo.</p>
      </fieldset>
    </div>
  );
}

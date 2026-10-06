"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

/**
 * The frame of the side menu. On a wide screen it is the column on the left,
 * always open. On a phone it is a bar at the top with a "Menu" button, and the
 * menu opens under it. Everything inside comes rendered from the server: this
 * component only knows whether the menu is open. It is open for the page it
 * was opened on, so choosing an item closes it.
 */
export function MobileMenu({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;

  return (
    <aside className="sticky top-0 z-20 flex shrink-0 flex-col border-b border-slate-200 bg-white md:static md:min-h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-4 md:pb-0 md:pt-4">
        <div className="min-w-0">{brand}</div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="menu-principal"
          onClick={() => setOpenAt(open ? null : pathname)}
          className="rounded border border-slate-300 px-3 py-2 text-sm font-medium md:hidden"
        >
          {open ? "Fechar" : "Menu"}
        </button>
      </div>
      <div
        id="menu-principal"
        className={`${open ? "flex" : "hidden"} max-h-[calc(100dvh-4rem)] flex-1 flex-col gap-4 overflow-y-auto p-4 md:flex md:max-h-none md:overflow-visible`}
      >
        {children}
      </div>
    </aside>
  );
}

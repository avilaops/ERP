"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

/**
 * The frame of the side menu. On a wide screen it is the column on the left,
 * always open. On a phone it is a bar at the top with a "Menu" button, and the
 * menu opens under it and takes the whole screen. Everything inside comes
 * rendered from the server: this component only knows whether the menu is
 * open. It is open for the page it was opened on, so choosing an item closes it.
 *
 * While it is open on a phone the page behind does not move: without that the
 * finger that slides the menu slides the page under it, and a piece of the
 * page shows below the last item.
 */
export function MobileMenu({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;

  useEffect(() => {
    if (!open) return;
    // Only where the menu is a sheet over the page; on a wide screen it is a column and nothing is held.
    const phone = window.matchMedia("(max-width: 767px)");
    const hold = () => {
      document.body.style.overflow = phone.matches ? "hidden" : "";
    };
    hold();
    phone.addEventListener("change", hold);
    return () => {
      phone.removeEventListener("change", hold);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <aside
      className={`${open ? "fixed inset-0 h-dvh" : "sticky top-0"} z-20 flex shrink-0 flex-col border-b border-slate-200 bg-white md:static md:h-auto md:min-h-screen md:w-64 md:border-b-0 md:border-r`}
    >
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
        className={`${open ? "flex" : "hidden"} min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 md:flex md:overflow-visible`}
      >
        {children}
      </div>
    </aside>
  );
}

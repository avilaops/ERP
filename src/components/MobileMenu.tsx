"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export type MenuTab = { href: string; label: string; icon: ReactNode };

/**
 * The frame of the navigation. On a wide screen it is the column on the left,
 * always open, as tall as the window and with its own slide: a long menu never
 * makes the page longer. On a phone it is a slim bar with the brand at the top
 * and, at the bottom, the destinations the person uses most plus "Mais", which
 * opens the whole menu over the screen. Everything inside comes rendered from
 * the server: this component only knows the address and whether the menu is
 * open. It is open for the page it was opened on, so choosing an item closes it.
 *
 * While it is open on a phone the page behind does not move: without that the
 * finger that slides the menu slides the page under it.
 */
export function MobileMenu({ brand, tabs, more, children }: { brand: ReactNode; tabs: MenuTab[]; more: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const menuRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const open = openAt === pathname;

  useEffect(() => {
    if (!open) return;
    const phone = window.matchMedia("(max-width: 1023px)");
    const content = document.getElementById("conteudo");
    const skipLink = document.querySelector<HTMLElement>('a[href="#conteudo"]');
    let active = false;
    let previousOverflow = "";
    let contentWasInert = false;
    let skipLinkWasInert = false;

    const focusable = () => {
      const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
      return [...(menuRef.current?.querySelectorAll<HTMLElement>(selector) ?? []), toggleRef.current].filter(
        (element): element is HTMLElement => Boolean(element && element.getClientRects().length),
      );
    };
    const close = () => {
      setOpenAt(null);
      requestAnimationFrame(() => toggleRef.current?.focus());
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const activate = () => {
      if (active || !phone.matches) return;
      active = true;
      previousOverflow = document.body.style.overflow;
      contentWasInert = content?.inert ?? false;
      skipLinkWasInert = skipLink?.inert ?? false;
      document.body.style.overflow = "hidden";
      if (content) content.inert = true;
      if (skipLink) skipLink.inert = true;
      document.addEventListener("keydown", onKeyDown);
      requestAnimationFrame(() => focusable()[0]?.focus());
    };
    const deactivate = () => {
      if (!active) return;
      active = false;
      document.body.style.overflow = previousOverflow;
      if (content) content.inert = contentWasInert;
      if (skipLink) skipLink.inert = skipLinkWasInert;
      document.removeEventListener("keydown", onKeyDown);
    };
    const respondToViewport = () => {
      if (phone.matches) activate();
      else {
        deactivate();
        setOpenAt(null);
      }
    };

    respondToViewport();
    phone.addEventListener("change", respondToViewport);
    return () => {
      phone.removeEventListener("change", respondToViewport);
      deactivate();
    };
  }, [open]);

  const here = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  // The longest match wins: /pedidos/novo is "Pedidos", not two tabs at once.
  const current = open ? null : tabs.filter((tab) => here(tab.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
  const TAB = "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-medium leading-tight";

  return (
    <>
      <aside
        ref={menuRef}
        role={open ? "dialog" : undefined}
        aria-modal={open ? "true" : undefined}
        aria-label={open ? "Menu principal" : undefined}
        className={`${open ? "fixed inset-0 h-dvh pb-[var(--tabbar)]" : "sticky top-0 h-[var(--topbar)]"} z-20 flex shrink-0 flex-col border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:border-b-0 lg:border-r lg:pb-0`}
      >
        <div className="flex h-[3.25rem] shrink-0 items-center justify-between gap-3 px-4 lg:h-auto lg:pt-4">
          <div className="min-w-0">{brand}</div>
        </div>
        {/* `relative`: what is placed out of the flow inside (texts for screen readers) slides with the menu instead of stretching the page. */}
        <div id="menu-principal" className={`${open ? "flex" : "hidden"} relative min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-3 lg:flex`}>
          {children}
        </div>
      </aside>

      <nav
        aria-label="Atalhos"
        className="fixed inset-x-0 bottom-0 z-30 flex h-[var(--tabbar)] items-stretch border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current === tab.href ? "page" : undefined}
            onClick={() => setOpenAt(null)}
            className={`${TAB} ${current === tab.href ? "text-brand" : "text-slate-600"}`}
          >
            {tab.icon}
            <span className="max-w-full break-words text-center">{tab.label}</span>
          </Link>
        ))}
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls="menu-principal"
          onClick={() => setOpenAt(open ? null : pathname)}
          className={`${TAB} ${open ? "text-brand" : "text-slate-600"}`}
        >
          {more}
          <span>{open ? "Fechar" : "Mais"}</span>
        </button>
      </nav>
    </>
  );
}

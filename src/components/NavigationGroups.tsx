"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavigationGroup } from "@/lib/navigation";

/** Native disclosures retain keyboard support and work before hydration. */
export function NavigationGroups({ groups }: { groups: NavigationGroup[] }) {
  const pathname = usePathname();
  const current = groups.flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label="Menu principal" className="flex min-w-0 flex-col gap-1">
      {groups.map((group) => (
        <details key={`${pathname}:${group.title}`} name="menu-secoes" open={group.items.some((item) => item.href === current)} className="group rounded-lg border border-slate-200">
          <summary className="flex min-h-[var(--control)] cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
            <span>{group.title}</span>
            <span aria-hidden="true" className="shrink-0 group-open:rotate-180">⌄</span>
          </summary>
          <div className="border-t border-slate-200 px-1 py-1">
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} aria-current={item.href === current ? "page" : undefined}
                className={`flex min-h-[var(--control)] items-center rounded-lg px-3 py-2 font-medium ${item.href === current ? "bg-brand-soft text-brand" : "text-slate-700 hover:bg-slate-100"}`}>
                {item.label}
              </Link>
            ))}
          </div>
        </details>
      ))}
    </nav>
  );
}

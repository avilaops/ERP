import Link from "next/link";
import { allows, menuItem } from "@/lib/auth/permissions";
import type { Access } from "@/lib/auth/permissions";

/** Finance shows the source's name without offering a destination the person cannot open. */
export function OrderReference({ access, number, customer }: { access: Access; number: string; customer: string | null }) {
  const name = customer ?? "sem cliente";
  return allows(access, "pedidos") ? (
    <Link href={`${menuItem("pedidos").href}/${number}`} className="inline-flex min-h-[var(--control)] items-center font-medium text-brand underline decoration-brand underline-offset-2">
      {name}
    </Link>
  ) : (
    <span className="font-medium">{name}</span>
  );
}

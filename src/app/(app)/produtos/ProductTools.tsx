"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import type { PasteState } from "@/lib/advisory-paste";
import type { NewProductState } from "@/lib/product-form";
import { NewProductForm } from "./NewProductForm";
import { PasteCostsForm } from "./PasteCostsForm";

type Panel = "paste" | "new";

const BUTTONS: [Panel, string, string][] = [
  ["paste", "Colar custos da assessoria", "colar-custos"],
  ["new", "+ Equipamento", "novo-equipamento"],
];

/** The page heading with its two buttons, and the form each one opens in the page itself. */
export function ProductTools({
  heading,
  create,
  paste,
  lineId,
}: {
  heading: ReactNode;
  create: (state: NewProductState, formData: FormData) => Promise<NewProductState>;
  paste: (state: PasteState, formData: FormData) => Promise<PasteState>;
  /** The product line the list shows: a new equipment is created in it. */
  lineId: number;
}) {
  const [open, setOpen] = useState<Panel | null>(null);
  const close = () => setOpen(null);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>{heading}</div>
        <div className="flex flex-wrap gap-2">
          {BUTTONS.map(([panel, label, controls]) => (
            <button
              key={panel}
              type="button"
              aria-expanded={open === panel}
              aria-controls={controls}
              onClick={() => setOpen(open === panel ? null : panel)}
              className={`rounded border border-slate-300 bg-white px-4 py-2 font-medium hover:bg-slate-50 ${panel === "new" ? "hidden md:block" : ""}`}
            >
              {label}
            </button>
          ))}
          <Link href="/produtos/catalogo-fornecedor" className="rounded border border-slate-300 bg-white px-4 py-2 font-medium hover:bg-slate-50">
            Catálogo do fornecedor
          </Link>
          {/* On a phone a new equipment has a screen of its own. */}
          <Link href={`/produtos/novo?linha=${lineId}`} className="rounded bg-brand px-4 py-2 font-medium text-white md:hidden">
            + Equipamento
          </Link>
        </div>
      </div>

      {open === "paste" && <PasteCostsForm action={paste} onClose={close} />}
      {open === "new" && <NewProductForm action={create} onClose={close} lineId={lineId} />}
    </>
  );
}

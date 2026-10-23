"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { PRIMARY, SECONDARY, SectionDisclosure } from "@/components/ui";
import type { PasteState } from "@/lib/advisory-paste";
import type { NewProductState } from "@/lib/product-form";
import { lineWords } from "@/lib/line-words";
import { NewProductForm } from "./NewProductForm";
import { PasteCostsForm } from "./PasteCostsForm";

type Panel = "paste" | "new";

const buttons = (paste: string): [Panel, string, string][] => [
  ["paste", paste, "colar-custos"],
  ["new", "+ Equipamento", "novo-equipamento"],
];

/** The page heading with its two buttons, and the form each one opens in the page itself. */
export function ProductTools({
  heading,
  create,
  paste,
  lineId,
  imported,
}: {
  heading: ReactNode;
  create: (state: NewProductState, formData: FormData) => Promise<NewProductState>;
  paste: (state: PasteState, formData: FormData) => Promise<PasteState>;
  /** The product line the list shows: a new equipment is created in it. */
  lineId: number;
  /** Whether that line is bought abroad: it is how the cost is called. */
  imported: boolean;
}) {
  const BUTTONS = buttons(lineWords(imported).pasteButton);
  const [open, setOpen] = useState<Panel | null>(null);
  const close = () => setOpen(null);

  return (
    <>
      <div className="product-tools flex flex-wrap items-start justify-between gap-2">
        <div>{heading}</div>
        <div className="flex flex-nowrap items-start gap-2">
          <SectionDisclosure title="Ferramentas">
          <div className="flex flex-wrap gap-2">
          {BUTTONS.map(([panel, label, controls]) => (
            <button
              key={panel}
              type="button"
              aria-expanded={open === panel}
              aria-controls={controls}
              onClick={() => setOpen(open === panel ? null : panel)}
              className={`${SECONDARY} ${panel === "new" ? "hidden md:inline-flex" : ""}`}
            >
              {label}
            </button>
          ))}
          <Link href="/produtos/catalogo-fornecedor" className={SECONDARY}>
            Catálogo do fornecedor
          </Link>
          {/* On a phone a new equipment has a screen of its own. */}
          </div>
          </SectionDisclosure>
          <Link href={`/produtos/novo?linha=${lineId}`} className={PRIMARY}>+ Equipamento</Link>
        </div>
      </div>

      {open === "paste" && <PasteCostsForm action={paste} onClose={close} imported={imported} />}
      {open === "new" && <NewProductForm action={create} onClose={close} lineId={lineId} imported={imported} />}
    </>
  );
}

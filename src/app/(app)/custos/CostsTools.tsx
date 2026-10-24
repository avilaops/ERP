"use client";

import { useState } from "react";
import { SECONDARY } from "@/components/ui";
import type { PasteState } from "@/lib/advisory-paste";
import { lineWords } from "@/lib/line-words";
import { PasteCostsForm } from "../produtos/PasteCostsForm";

export function CostsTools({ action, imported }: { action: (state: PasteState, formData: FormData) => Promise<PasteState>; imported: boolean }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className={SECONDARY} aria-expanded={open} onClick={() => setOpen((value) => !value)}>{lineWords(imported).pasteButton}</button>{open && <PasteCostsForm action={action} onClose={() => setOpen(false)} imported={imported} />}</>;
}

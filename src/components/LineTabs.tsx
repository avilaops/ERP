import Link from "next/link";
import type { ProductLine } from "@/lib/db/product-lines";
import { lineHref } from "@/lib/lines-view";

/**
 * Which product line the screen shows. With one line there is nothing to
 * choose, so nothing is drawn: a company with a single line never sees lines.
 */
export function LineTabs({ lines, current, path }: { lines: ProductLine[]; current: number; path: string }) {
  if (lines.length < 2) return null;
  return (
    <nav aria-label="Linha de produto" className="mt-2 flex flex-wrap gap-2">
      {lines.map((line) => (
        <Link
          key={line.id}
          href={lineHref(path, line.id)}
          aria-current={line.id === current ? "page" : undefined}
          className={`inline-flex min-h-9 items-center rounded-full border px-4 text-sm font-medium ${
            line.id === current ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
          }`}
        >
          {line.name}
        </Link>
      ))}
    </nav>
  );
}

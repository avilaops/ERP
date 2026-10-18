import Link from "next/link";
import { PRIMARY } from "@/components/ui";
import type { PublishNotice } from "@/lib/price-table";

/**
 * The notice of what the team sees, with the button that publishes the draft.
 * Only shows text that came ready from the server. Publishing takes a second
 * click here: a published version is never removed.
 */
export function PublishBanner({ notice, lineId }: { notice: PublishNotice; lineId: number }) {
  return (
    <section
      aria-label="Tabela publicada"
      className={`publish-banner mt-3 rounded-lg border px-3 py-2 text-sm ${
        notice.pending ? "border-amber-300 bg-amber-50 text-amber-950" : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          <span className="sm:hidden">{notice.pending ? "Alterações pendentes." : notice.text}</span>
          <span className="hidden sm:inline">{notice.strong && <strong className="font-semibold">{notice.strong} </strong>}{notice.text}</span>
        </p>

        {notice.next !== null && <Link href={`/produtos/publicacao?linha=${lineId}`} className={PRIMARY}><span className="sm:hidden">Revisar v{notice.next}</span><span className="hidden sm:inline">Revisar publicação v{notice.next}</span></Link>}
      </div>
    </section>
  );
}

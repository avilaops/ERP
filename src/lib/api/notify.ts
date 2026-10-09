import { after } from "next/server";
import { deliverPending, emitEvent } from "@/lib/db/integrations";
import type { WebhookEvent } from "@/lib/db/integrations";
import type { Queryable } from "@/lib/db/pool";
import { vaultKey } from "@/lib/fiscal/certificate";

/**
 * Tells the systems of the company that something happened. The notice is
 * written down now and sent after the answer to the person; a notice that
 * cannot be written or sent never undoes nor delays what was just done. `data`
 * never carries cost, margin or profit.
 */
export async function notify(event: WebhookEvent, data: Record<string, unknown>, conn: Queryable): Promise<void> {
  try {
    const waiting = await emitEvent(event, data, new Date(), conn);
    if (waiting === 0) return;
    after(async () => {
      try {
        await deliverPending(() => vaultKey(process.env.ERP_CERT_KEY), new Date(), conn);
      } catch (error) {
        console.error("[avisos] falha ao entregar:", error instanceof Error ? error.message : error);
      }
    });
  } catch (error) {
    console.error("[avisos] falha ao registrar o aviso:", error instanceof Error ? error.message : error);
  }
}

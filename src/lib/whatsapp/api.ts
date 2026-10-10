import { createHmac, timingSafeEqual } from "node:crypto";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class WhatsappError extends Error {}

export type WhatsappAccount = { phoneNumberId: string; token: string };
export type WhatsappSend = { to: string } & ({ text: string } | { template: { name: string; language: string; /** The values of {{1}}, {{2}}… of the body, in order. */ values?: string[] } });
export type WhatsappSender = (account: WhatsappAccount, message: WhatsappSend) => Promise<{ id: string }>;

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Sends one message by the official WhatsApp API of Meta, in the name of the
 * company's own number. The address is fixed; the access key goes only in the
 * header and never to a log or an error message. `fetcher` is only for the tests.
 */
export function whatsappSender(fetcher: typeof fetch = fetch): WhatsappSender {
  return async (account, message) => {
    const payload = "text" in message
      ? { messaging_product: "whatsapp", recipient_type: "individual", to: message.to, type: "text", text: { preview_url: false, body: message.text } }
      : { messaging_product: "whatsapp", recipient_type: "individual", to: message.to, type: "template", template: { name: message.template.name, language: { code: message.template.language }, ...(message.template.values?.length ? { components: [{ type: "body", parameters: message.template.values.map((text) => ({ type: "text", text })) }] } : {}) } };
    let response: Response;
    try {
      response = await fetcher(`${GRAPH}/${account.phoneNumberId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${account.token}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new WhatsappError("O WhatsApp não respondeu a tempo. Tente de novo.");
    }
    const data = (await response.json().catch(() => null)) as { messages?: { id?: string }[]; error?: { message?: string; code?: number } } | null;
    if (response.status === 401 || data?.error?.code === 190) throw new WhatsappError("A Meta recusou a chave de acesso da conta. Confira em Parâmetros → WhatsApp.");
    if (!response.ok) throw new WhatsappError(`O WhatsApp recusou a mensagem: ${String(data?.error?.message ?? `erro ${response.status}`).replace(/[\r\n]+/g, " ").slice(0, 200)}`);
    const id = data?.messages?.[0]?.id;
    if (typeof id !== "string" || id === "") throw new WhatsappError("O WhatsApp não confirmou a mensagem.");
    return { id };
  };
}

/** Whether a notice really came from Meta: the body signed with the secret of the company's application (`X-Hub-Signature-256`). */
export function signedByMeta(body: string, header: string | null, secret: string): boolean {
  const sent = /^sha256=([0-9a-f]{64})$/.exec(header ?? "")?.[1];
  if (!sent || secret === "") return false;
  const expected = createHmac("sha256", secret).update(body, "utf8").digest();
  return timingSafeEqual(expected, Buffer.from(sent, "hex"));
}

export type WhatsappEvent =
  | { kind: "message"; id: string; from: string; name: string | null; text: string; at: Date }
  | { kind: "status"; id: string; status: "enviada" | "entregue" | "lida" | "falhou"; detail: string | null };

const STATUS = { sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" } as const;

/** What a notice of Meta says, for the number of this company only: the messages that came in and what became of the ones that went out. */
export function eventsOf(payload: unknown, phoneNumberId: string): WhatsappEvent[] {
  const events: WhatsappEvent[] = [];
  const entries = (payload as { entry?: unknown })?.entry;
  for (const entry of Array.isArray(entries) ? entries : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      if (change?.field !== "messages" || value?.metadata?.phone_number_id !== phoneNumberId) continue;
      const names = new Map<string, string>();
      for (const contact of Array.isArray(value.contacts) ? value.contacts : []) if (typeof contact?.wa_id === "string" && typeof contact?.profile?.name === "string") names.set(contact.wa_id, contact.profile.name);
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        if (typeof message?.id !== "string" || typeof message?.from !== "string" || !/^[0-9]{8,15}$/.test(message.from)) continue;
        // What is not text is told as what it is: the file itself is not brought in.
        const text = message.type === "text" && typeof message.text?.body === "string" ? message.text.body : message.type === "button" && typeof message.button?.text === "string" ? message.button.text : `(${{ image: "imagem", audio: "áudio", video: "vídeo", document: "documento", location: "localização", sticker: "figurinha" }[String(message.type)] ?? "mensagem"} recebida; abra no aparelho para ver)`;
        const seconds = Number(message.timestamp);
        events.push({ kind: "message", id: message.id, from: message.from, name: names.get(message.from) ?? null, text: text.slice(0, 4000), at: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date() });
      }
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        const known = STATUS[String(status?.status) as keyof typeof STATUS];
        if (typeof status?.id !== "string" || !known) continue;
        const reason = Array.isArray(status.errors) && typeof status.errors[0]?.title === "string" ? String(status.errors[0].title).slice(0, 200) : null;
        events.push({ kind: "status", id: status.id, status: known, detail: known === "falhou" ? reason : null });
      }
    }
  }
  return events;
}

/**
 * The conference of the invoice against the official layout before it goes to
 * SEFAZ, by the fiscal service of the house (`validar_xml_fiscal`, the XSD of
 * the current package). The service has no address of its own: it is reached
 * through the single MCP of the company (`https://mcp.avilaops.com/mcp`), where
 * its tools carry the `fiscal_` prefix, with a service token that opens only them. It saves a rejection for a field out of the layout.
 * This optional check complements the mandatory local XSD validation in
 * issue-nfe.ts. Failure here never disables or replaces that local validation.
 */
export type LayoutCheck = (signedXml: string) => Promise<string[]>;

type Fetcher = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

const HEADERS = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
const LIMIT = 5;

/** The last message of an answer that may come as JSON or as an event stream. */
function messageOf(body: string): unknown {
  const events = body.split(/\r?\n/).filter((line) => line.startsWith("data: "));
  return JSON.parse(events.length > 0 ? events[events.length - 1].slice(6) : body);
}

/** What the service found, in the words of the screen: field and message, the first few. */
export function layoutProblems(result: unknown): string[] {
  const outcome = result as { valido?: unknown; erros?: unknown } | null;
  if (!outcome || outcome.valido !== false || !Array.isArray(outcome.erros)) return [];
  return outcome.erros
    .slice(0, LIMIT)
    .map((error: { campo?: unknown; mensagem?: unknown }) => [typeof error.campo === "string" ? error.campo : null, typeof error.mensagem === "string" ? error.mensagem : null].filter(Boolean).join(": ").slice(0, 300))
    .filter((line) => line !== "");
}

/**
 * The check, or `null` when the address of the company MCP or the service token
 * of the ERP is missing (`ERP_FISCAL_URL`, https only: the invoice carries the
 * customer's data; `ERP_FISCAL_TOKEN`, sent as `Authorization: Bearer`).
 */
export function layoutCheck(env: { ERP_FISCAL_URL?: string; ERP_FISCAL_TOKEN?: string }, fetcher: Fetcher = fetch): LayoutCheck | null {
  const url = env.ERP_FISCAL_URL?.trim();
  const token = env.ERP_FISCAL_TOKEN?.trim();
  if (!url || !url.startsWith("https://") || !token) return null;
  const headers = { ...HEADERS, Authorization: `Bearer ${token}` };
  const post = (body: unknown, session: string | null) =>
    fetcher(url, { method: "POST", headers: session ? { ...headers, "mcp-session-id": session } : headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8_000) });

  return async (signedXml) => {
    try {
      const opened = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "erp-avila-ops", version: "1" } } }, null);
      const session = opened.headers.get("mcp-session-id");
      if (opened.status !== 200 || !session) throw new Error(`o serviço respondeu ${opened.status} à abertura`);
      const answered = await post({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "fiscal_validar_xml_fiscal", arguments: { xml_content: signedXml, tipo: "nfe" } } }, session);
      if (answered.status !== 200) throw new Error(`o serviço respondeu ${answered.status} à conferência`);
      const message = messageOf(await answered.text()) as { result?: { isError?: boolean; content?: { text?: string }[] } };
      const text = message.result?.content?.[0]?.text;
      if (message.result?.isError || typeof text !== "string") throw new Error("o serviço não devolveu a conferência");
      return layoutProblems(JSON.parse(text));
    } catch (error) {
      // Never the XML: only what kind of failure it was.
      console.error("[nfe] conferência adicional indisponível; validação local obrigatória preservada:", error instanceof Error ? error.message : error);
      return [];
    }
  };
}

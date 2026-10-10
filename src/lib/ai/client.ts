/**
 * The one place that talks to the model. It knows nothing of the ERP: it takes
 * the instructions and the text, and gives back what the model wrote and what
 * it cost in tokens. The key comes from the server's environment and never
 * leaves here: not to a screen, not to a log, not to an error message.
 */
export class AiError extends Error {}

export type AiAnswer = { text: string; model: string; inputTokens: number; outputTokens: number };
export type AiRequest = { system: string; user: string; maxTokens: number };
export type AiCaller = (request: AiRequest) => Promise<AiAnswer>;

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5-5";
const TIMEOUT_MS = 45_000;

/** Whether this server can call the model at all. The company still has to turn the assistant on. */
export const aiConfigured = (env: Record<string, string | undefined> = process.env): boolean => (env.ERP_ANTHROPIC_API_KEY ?? "").trim() !== "";

/** The caller of this server: the key and the model of the environment, over the network. `fetcher` is only for the tests. */
export function aiCaller(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): AiCaller {
  return async ({ system, user, maxTokens }) => {
    const key = (env.ERP_ANTHROPIC_API_KEY ?? "").trim();
    if (key === "") throw new AiError("O assistente não está configurado neste servidor.");
    const model = (env.ERP_AI_MODEL ?? "").trim() || DEFAULT_MODEL;
    let response: Response;
    try {
      response = await fetcher(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AiError("O assistente não respondeu a tempo. Tente de novo.");
    }
    if (response.status === 401 || response.status === 403) throw new AiError("O serviço do assistente recusou a chave deste servidor. Avise o suporte.");
    if (response.status === 429 || response.status === 529) throw new AiError("O assistente está ocupado agora. Tente de novo em instantes.");
    if (!response.ok) throw new AiError(`O assistente não conseguiu responder (erro ${response.status}). Tente de novo.`);
    const data = (await response.json().catch(() => null)) as { content?: { type?: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } } | null;
    const text = (data?.content ?? []).filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text).join("").trim();
    if (text === "") throw new AiError("O assistente respondeu em branco. Tente de novo.");
    return { text, model, inputTokens: Number(data?.usage?.input_tokens ?? 0), outputTokens: Number(data?.usage?.output_tokens ?? 0) };
  };
}

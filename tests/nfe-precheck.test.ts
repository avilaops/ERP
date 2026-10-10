import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutCheck, layoutProblems } from "@/lib/fiscal/precheck";

const reply = (status: number, body: string, session: string | null = "s1") => ({ status, headers: { get: (name: string) => (name === "mcp-session-id" ? session : null) }, text: async () => body });
const event = (payload: unknown) => `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
const verdict = (result: unknown) => event({ jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: JSON.stringify(result) }] } });

test("conferência do leiaute: sem endereço, ou endereço sem https, não há conferência", () => {
  assert.equal(layoutCheck({}), null);
  assert.equal(layoutCheck({ ERP_FISCAL_URL: " " }), null);
  assert.equal(layoutCheck({ ERP_FISCAL_URL: "http://fiscal.local/mcp" }), null);
});

test("conferência do leiaute: abre a sessão, manda o XML assinado e devolve os erros do serviço", async () => {
  const calls: { url: string; headers: Record<string, string>; body: { method: string; params: { name?: string; arguments?: { xml_content: string; tipo: string } } } }[] = [];
  const check = layoutCheck({ ERP_FISCAL_URL: "https://fiscal.teste/mcp" }, async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return calls.length === 1
      ? reply(200, event({ jsonrpc: "2.0", id: 1, result: {} }))
      : reply(200, verdict({ valido: false, erros: [{ campo: "CEP", mensagem: "Element 'CEP': valor fora do padrão.", linha: 1 }, { mensagem: "sem campo" }] }));
  })!;
  assert.deepEqual(await check("<NFe/>"), ["CEP: Element 'CEP': valor fora do padrão.", "sem campo"]);
  assert.deepEqual(calls.map((call) => [call.url, call.body.method, call.headers["mcp-session-id"]]), [["https://fiscal.teste/mcp", "initialize", undefined], ["https://fiscal.teste/mcp", "tools/call", "s1"]]);
  assert.deepEqual([calls[1].body.params.name, calls[1].body.params.arguments], ["validar_xml_fiscal", { xml_content: "<NFe/>", tipo: "nfe" }]);

  const fine = layoutCheck({ ERP_FISCAL_URL: "https://fiscal.teste/mcp" }, async (_url, init) => (JSON.parse(init.body).method === "initialize" ? reply(200, "{}") : reply(200, verdict({ valido: true, erros: [] }))))!;
  assert.deepEqual(await fine("<NFe/>"), []);
});

test("conferência do leiaute: serviço fora do ar, sem sessão ou com resposta estranha não segura a nota", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    for (const fetcher of [
      async () => { throw new Error("rede"); },
      async () => reply(503, ""),
      async () => reply(200, "{}", null),
      async (_url: string, init: { body: string }) => (JSON.parse(init.body).method === "initialize" ? reply(200, "{}") : reply(200, "isto não é JSON")),
      async (_url: string, init: { body: string }) => (JSON.parse(init.body).method === "initialize" ? reply(200, "{}") : reply(200, event({ jsonrpc: "2.0", id: 2, result: { isError: true, content: [{ text: "falhou" }] } }))),
    ]) {
      assert.deepEqual(await layoutCheck({ ERP_FISCAL_URL: "https://fiscal.teste/mcp" }, fetcher as never)!("<NFe/>"), []);
    }
  } finally {
    console.error = quiet;
  }
  assert.deepEqual(layoutProblems(null), []);
  assert.deepEqual(layoutProblems({ valido: true, erros: [{ mensagem: "x" }] }), []);
  assert.equal(layoutProblems({ valido: false, erros: Array.from({ length: 9 }, (_, index) => ({ mensagem: `erro ${index}` })) }).length, 5);
});

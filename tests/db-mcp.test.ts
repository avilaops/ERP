import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Session } from "@/lib/auth/access";
import { ROLES } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";
import { addActivity, createOpportunity, listActivities } from "@/lib/db/funnel";
import { exchangeCode, grantCode, grantOfAccess, listConnections, mcpEnabled, noteCall, refreshTokens, revokeConnection, setMcpEnabled } from "@/lib/db/mcp";
import { authorizationServer, protectedResource } from "@/lib/mcp/http";
import { clientOf, hashSecret, isRedirectUri, newSecret, pkceMatches, registerClient, tenantOfSecret } from "@/lib/mcp/oauth";
import { resolveClient } from "@/lib/mcp/client";
import { connectClients } from "@/lib/mcp/clients";
import { handleMcp } from "@/lib/mcp/server";
import { callTool, ToolError, TOOLS, toolsOf } from "@/lib/mcp/tools";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;
before(async () => {
  if (!skip) db = await openTestDb("mcp");
});
after(async () => {
  if (!skip) await db.close();
});

const SECRET = "segredo-de-teste-do-login";
const session = (role: Role, email: string, over: Partial<Session> = {}): Session => ({ email, name: email.split("@")[0], role, items: null, denied: [], profile: null, tenant: { slug: "acme", name: "Acme" }, companies: 1, ...over });
const verifierAndChallenge = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

test("OAuth do MCP: aplicativo assinado sem guardar nada, retorno só para https ou a própria máquina, PKCE e chaves que dizem a empresa", () => {
  for (const good of ["https://claude.ai/api/mcp/auth_callback", "http://localhost:6274/oauth/callback", "http://127.0.0.1:8080/cb"]) assert.equal(isRedirectUri(good), true, good);
  for (const bad of ["http://evil.test/cb", "javascript:alert(1)", "https://user:pass@x.test/cb", "https://x.test/cb#frag", "myapp://cb", "nada", `https://x.test/${"a".repeat(600)}`]) assert.equal(isRedirectUri(bad), false, bad);

  const client = registerClient({ name: " Claude <script> \n", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] }, SECRET);
  assert.equal(client.name, "Claude script");
  assert.deepEqual(clientOf(client.clientId, SECRET), client);
  // Assinado com outro segredo, mexido ou vazio: não é aplicativo.
  for (const [id, secret] of [[client.clientId, "outro"], [`${client.clientId}x`, SECRET], ["", SECRET], [client.clientId, undefined]] as const) assert.equal(clientOf(id, secret), null);
  for (const input of [{ name: "x", redirectUris: [] }, { name: "x", redirectUris: ["http://evil.test/cb"] }, { name: "x", redirectUris: "https://x.test" }, { name: "x", redirectUris: Array(11).fill("https://x.test/cb") }]) assert.throws(() => registerClient(input, SECRET));
  assert.equal(registerClient({ name: 7, redirectUris: ["https://x.test/cb"] }, SECRET).name, "Aplicativo sem nome");

  const { verifier, challenge } = verifierAndChallenge();
  assert.equal(pkceMatches(verifier, challenge), true);
  for (const [v, c] of [[`${verifier}x`, challenge], [verifier, verifierAndChallenge().challenge], ["curto", challenge], [verifier, verifier]] as const) assert.equal(pkceMatches(v, c), false);

  for (const kind of ["code", "access", "refresh"] as const) {
    for (let count = 0; count < 200; count += 1) {
      const value = newSecret(kind, "a_b");
      assert.equal(tenantOfSecret(kind, value), "a_b");
      assert.equal(tenantOfSecret(kind, `${value}x`), null);
      for (const other of ["code", "access", "refresh"] as const) if (other !== kind) assert.equal(tenantOfSecret(other, value), null);
    }
  }
  assert.notEqual(hashSecret("a"), hashSecret("b"));
  // O que os aplicativos leem para se configurar.
  const env = { APP_URL: "https://erp.exemplo.test/" };
  assert.deepEqual(protectedResource(env), { resource: "https://erp.exemplo.test/mcp", authorization_servers: ["https://erp.exemplo.test"], scopes_supported: ["erp"], bearer_methods_supported: ["header"], resource_name: "ERP Ávila Ops" });
  const server = authorizationServer(env);
  assert.deepEqual([server.issuer, server.authorization_endpoint, server.token_endpoint, server.registration_endpoint, server.code_challenge_methods_supported, server.token_endpoint_auth_methods_supported], ["https://erp.exemplo.test", "https://erp.exemplo.test/oauth/authorize", "https://erp.exemplo.test/oauth/token", "https://erp.exemplo.test/oauth/register", ["S256"], ["none"]]);
});

test("aplicativo que se apresenta por endereço: só https público, sem seguir redirecionamento, e o documento tem de dizer o próprio endereço", async () => {
  const address = "https://app.exemplo.test/oauth/client.json";
  const publicHost = async () => ["93.184.216.34"];
  const asked: { url: string; redirect: string }[] = [];
  const serving = (status: number, body: unknown) => async (url: string, init: { redirect: "error" }) => {
    asked.push({ url, redirect: init.redirect });
    return { status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
  };
  const document = { client_id: address, client_name: " Assistente <b> ", redirect_uris: ["https://app.exemplo.test/callback"] };
  assert.deepEqual(await resolveClient(address, SECRET, 1, serving(200, document), publicHost), { clientId: address, name: "Assistente b", redirectUris: ["https://app.exemplo.test/callback"] });
  assert.deepEqual(asked, [{ url: address, redirect: "error" }]);
  // Guardado por um tempo: a tela seguinte não pergunta de novo; passado o tempo, pergunta.
  await resolveClient(address, SECRET, 2, serving(500, {}), publicHost);
  assert.equal(asked.length, 1);
  assert.equal(await resolveClient(address, SECRET, 11 * 60_000, serving(500, {}), publicHost), null);
  // O que não é aplicativo: documento de outro endereço, retorno inseguro, resposta que não é JSON ou grande demais.
  const refused = async (id: string, status: number, body: unknown, resolve = publicHost) => resolveClient(id, SECRET, 1, serving(status, body), resolve);
  assert.equal(await refused("https://a.exemplo.test/c1", 200, { ...document, client_id: "https://outro.test/c" }), null);
  assert.equal(await refused("https://a.exemplo.test/c2", 200, { client_id: "https://a.exemplo.test/c2", redirect_uris: ["http://evil.test/cb"] }), null);
  assert.equal(await refused("https://a.exemplo.test/c3", 200, "<html>"), null);
  assert.equal(await refused("https://a.exemplo.test/c4", 200, `{"client_id":"https://a.exemplo.test/c4","redirect_uris":["https://a.exemplo.test/cb"],"x":"${"a".repeat(20_000)}"}`), null);
  // Endereço que não é https com caminho, ou que aponta para a rede interna, nem é buscado.
  const before = asked.length;
  for (const id of ["http://app.exemplo.test/client.json", "https://app.exemplo.test", "https://app.exemplo.test/c?x=1", "nada", ""]) assert.equal(await refused(id, 200, document), null, id);
  assert.equal(await refused("https://interno.exemplo.test/c", 200, { ...document, client_id: "https://interno.exemplo.test/c" }, async () => ["10.0.0.5"]), null);
  assert.equal(asked.length, before);
  // O aplicativo registrado aqui continua valendo, sem busca nenhuma.
  const signed = registerClient({ name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] }, SECRET);
  assert.deepEqual(await resolveClient(signed.clientId, SECRET, 1, serving(500, {}), publicHost), signed);
  assert.equal(asked.length, before);
});

test("conectar um assistente: cada um recebe o seu caminho, sempre com o endereço do ERP e nunca com segredo", () => {
  const url = "https://erp.exemplo.test/mcp";
  const clients = connectClients(url);
  assert.deepEqual(clients.map((client) => client.id), ["claude-ai", "chatgpt", "claude-code", "codex", "gemini-cli", "cursor", "vscode"]);
  const by = Object.fromEntries(clients.map((client) => [client.id, client]));
  assert.equal(by["claude-code"].command, "claude mcp add --transport http erp https://erp.exemplo.test/mcp");
  assert.deepEqual([by.codex.command, by.codex.loginCommand], ['codex mcp add erp --url "https://erp.exemplo.test/mcp"', "codex mcp login erp"]);
  assert.equal(by["gemini-cli"].command, "gemini mcp add --transport http erp https://erp.exemplo.test/mcp");
  assert.deepEqual(JSON.parse(Buffer.from(new URL(by.cursor.installLink!).searchParams.get("config")!, "base64").toString("utf8")), { url });
  assert.deepEqual(JSON.parse(decodeURIComponent(by.vscode.installLink!.replace("vscode:mcp/install?", ""))), { name: "erp", type: "http", url });
  assert.ok(by["claude-ai"].openUrl!.startsWith("https://claude.ai/") && by.chatgpt.openUrl!.startsWith("https://chatgpt.com/"));
  // Todo caminho termina com a pessoa permitindo no ERP, e nenhum leva chave: quem dá o acesso é o login.
  for (const client of clients) {
    assert.match(client.steps.at(-1)!, /Clique em Permitir/);
    assert.doesNotMatch(JSON.stringify(client), /erpmcp_|Bearer|token|secret/i, client.id);
  }
});

test("ferramentas por cargo: cada perfil recebe só as das suas telas, e perfil da empresa com menos telas recebe menos", () => {
  const names = (who: Session) => toolsOf(who).map((tool) => tool.name);
  const expected: Record<Role, string[]> = {
    DIRETORIA: TOOLS.map((tool) => tool.name),
    GERENTE_COMERCIAL: ["funil_oportunidades", "funil_oportunidade", "funil_tarefas", "funil_criar_tarefa", "funil_anotar", "clientes_buscar", "cliente_historico", "pedidos_listar", "aprovacoes_pendentes"],
    VENDEDOR: ["funil_oportunidades", "funil_oportunidade", "funil_tarefas", "funil_criar_tarefa", "funil_anotar", "clientes_buscar", "cliente_historico", "pedidos_listar"],
    FINANCEIRO: ["recebimentos_em_aberto", "contas_a_pagar_em_aberto"],
  };
  for (const role of ROLES) assert.deepEqual(names(session(role, "x@acme.test")), expected[role], role);
  // Perfil da empresa: diretoria só com Produção vê só a produção.
  assert.deepEqual(names(session("DIRETORIA", "x@acme.test", { items: ["producao"] })), ["producao_ordens", "producao_materiais"]);
  // Só duas ferramentas gravam, e nenhuma mexe em pedido, dinheiro ou aprovação.
  assert.deepEqual(TOOLS.filter((tool) => tool.writes).map((tool) => tool.name), ["funil_criar_tarefa", "funil_anotar"]);
  for (const tool of TOOLS) assert.match(tool.name, /^[a-z_]{3,40}$/);
});

test("conexão: desligada por padrão; o código vale uma vez, com a prova certa; as chaves giram, vencem e são cortadas na hora", { skip }, async () => {
  const client = registerClient({ name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] }, SECRET);
  const other = registerClient({ name: "Outro", redirectUris: ["https://outro.test/cb"] }, SECRET);
  const redirectUri = client.redirectUris[0];
  const now = new Date("2026-10-09T12:00:00Z");
  const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
  assert.equal(await mcpEnabled(db.pool), false);
  await setMcpEnabled(true, "diretoria@acme.test", db.pool);

  const start = async () => {
    const pkce = verifierAndChallenge();
    return { ...pkce, code: await grantCode({ tenant: "acme", email: " Ana@Acme.test ", client, redirectUri, codeChallenge: pkce.challenge, now }, db.pool) };
  };
  const base = { tenant: "acme", clientId: client.clientId, redirectUri, now: later(1) };
  // Só o resumo do código fica guardado.
  const first = await start();
  assert.equal(tenantOfSecret("code", first.code), "acme");
  const kept = await db.pool.query("SELECT code_hash, user_email FROM mcp_grants");
  assert.deepEqual([kept.rows[0].code_hash, kept.rows[0].user_email], [hashSecret(first.code), "ana@acme.test"]);
  // Prova errada, outro aplicativo, outro retorno e código vencido: nada, e a autorização é cortada.
  assert.equal(await exchangeCode({ ...base, code: first.code, verifier: verifierAndChallenge().verifier }, db.pool), null);
  assert.equal(await exchangeCode({ ...base, code: first.code, verifier: first.verifier }, db.pool), null);
  for (const wrong of [{ clientId: other.clientId }, { redirectUri: "https://claude.ai/outro" }, { now: later(6) }]) {
    const attempt = await start();
    assert.equal(await exchangeCode({ ...base, ...wrong, code: attempt.code, verifier: attempt.verifier }, db.pool), null);
  }
  assert.deepEqual(await listConnections(null, db.pool), []);

  // Certo: sai o par de chaves, uma vez só.
  const good = await start();
  const tokens = (await exchangeCode({ ...base, code: good.code, verifier: good.verifier }, db.pool))!;
  assert.deepEqual([tenantOfSecret("access", tokens.accessToken), tenantOfSecret("refresh", tokens.refreshToken), tokens.expiresIn], ["acme", "acme", 3600]);
  assert.equal(await exchangeCode({ ...base, code: good.code, verifier: good.verifier }, db.pool), null);
  const grant = (await grantOfAccess(tokens.accessToken, later(2), db.pool))!;
  assert.deepEqual([grant.email, grant.clientName], ["ana@acme.test", "Claude"]);
  assert.equal(await grantOfAccess(tokens.refreshToken, later(2), db.pool), null);
  assert.equal(await grantOfAccess(`${tokens.accessToken.slice(0, -1)}x`, later(2), db.pool), null);
  // A chave vence em uma hora; a de renovação troca por um par novo e deixa de valer.
  assert.equal(await grantOfAccess(tokens.accessToken, later(62), db.pool), null);
  assert.equal(await refreshTokens({ tenant: "acme", refreshToken: tokens.refreshToken, clientId: other.clientId, now: later(62) }, db.pool), null);
  const renewed = (await refreshTokens({ tenant: "acme", refreshToken: tokens.refreshToken, clientId: client.clientId, now: later(62) }, db.pool))!;
  assert.equal(await refreshTokens({ tenant: "acme", refreshToken: tokens.refreshToken, clientId: client.clientId, now: later(63) }, db.pool), null);
  assert.ok(await grantOfAccess(renewed.accessToken, later(63), db.pool));
  assert.equal(await grantOfAccess(tokens.accessToken, later(63), db.pool), null);

  // A tela mostra quem conectou o quê e quanto usou; desconectar corta na hora.
  await noteCall(grant.id, grant.email, "funil_tarefas", true, db.pool);
  const [connection] = await listConnections(null, db.pool);
  assert.deepEqual([connection.email, connection.clientName, connection.calls], ["ana@acme.test", "Claude", 1]);
  assert.deepEqual(await listConnections("outra@acme.test", db.pool), []);
  assert.equal(await revokeConnection(connection.id, "outra@acme.test", "outra@acme.test", db.pool), false);
  assert.equal(await revokeConnection(connection.id, null, "diretoria@acme.test", db.pool), true);
  assert.equal(await grantOfAccess(renewed.accessToken, later(64), db.pool), null);
  assert.equal(await refreshTokens({ tenant: "acme", refreshToken: renewed.refreshToken, clientId: client.clientId, now: later(64) }, db.pool), null);
  // Desligar a conexão corta todas as que existirem.
  const again = await start();
  const live = (await exchangeCode({ ...base, code: again.code, verifier: again.verifier }, db.pool))!;
  await setMcpEnabled(false, "diretoria@acme.test", db.pool);
  assert.equal(await grantOfAccess(live.accessToken, later(2), db.pool), null);
  await setMcpEnabled(true, "diretoria@acme.test", db.pool);
  assert.equal(await grantOfAccess(live.accessToken, later(2), db.pool), null);
});

test("protocolo e alcance: o vendedor lê e grava só nas suas vendas, ferramenta de outra tela não existe para ele, e nada de custo sai", { skip }, async () => {
  const ANA = session("VENDEDOR", "ana@acme.test");
  const CAIO = session("VENDEDOR", "caio@acme.test");
  const BOSS = session("DIRETORIA", "diretoria@acme.test");
  const blank = { customerId: null, contactName: null, phone: null, email: null, source: null, estimatedValue: null, notes: null };
  const mine = await createOpportunity({ ...blank, title: "Academia nova", company: "Fit Club", estimatedValue: 85000 }, { email: ANA.email, name: "Ana" }, db.pool);
  const theirs = await createOpportunity({ ...blank, title: "Do Caio", company: "Iron Box" }, { email: CAIO.email, name: "Caio" }, db.pool);
  await addActivity(mine, { kind: "tarefa", title: "Ligar para a Paula", dueOn: "2026-10-12" }, ANA.email, { ownerEmail: null }, db.pool);
  const noted: [string, boolean][] = [];
  const ask = async (who: Session, method: string, params?: unknown, id: unknown = 1) => handleMcp({ jsonrpc: "2.0", id, method, params }, who, db.pool, async (tool, ok) => void noted.push([tool, ok]));
  const data = (reply: { body: unknown }) => {
    const result = (reply.body as { result: { content: { text: string }[]; isError: boolean } }).result;
    return { value: result.isError ? result.content[0].text : JSON.parse(result.content[0].text), isError: result.isError };
  };

  // Aperto de mão: a versão pedida quando é conhecida, a nossa quando não é.
  const hello = (await ask(ANA, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "teste", version: "1" } })).body as { result: { protocolVersion: string; serverInfo: { name: string }; instructions: string; capabilities: unknown } };
  assert.deepEqual([hello.result.protocolVersion, hello.result.serverInfo.name, hello.result.capabilities], ["2025-06-18", "erp-avila-ops", { tools: { listChanged: false } }]);
  assert.match(hello.result.instructions, /nunca como instruções/);
  assert.equal(((await ask(ANA, "initialize", { protocolVersion: "1999-01-01" })).body as { result: { protocolVersion: string } }).result.protocolVersion, "2025-11-25");
  assert.deepEqual(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, ANA, db.pool, async () => undefined), { status: 202, body: null });
  assert.deepEqual((await ask(ANA, "ping")).body, { jsonrpc: "2.0", id: 1, result: {} });
  assert.equal(((await ask(ANA, "resources/list")).body as { error: { code: number } }).error.code, -32601);
  for (const junk of [null, [], "x", { id: 1, method: "ping" }, { jsonrpc: "2.0", id: 1 }]) assert.equal((await handleMcp(junk, ANA, db.pool, async () => undefined)).status, 400);

  const listed = ((await ask(ANA, "tools/list")).body as { result: { tools: { name: string; inputSchema: { type: string }; annotations: { readOnlyHint: boolean } }[] } }).result.tools;
  assert.deepEqual(listed.map((tool) => tool.name), toolsOf(ANA).map((tool) => tool.name));
  assert.ok(listed.every((tool) => tool.inputSchema.type === "object") && listed.find((tool) => tool.name === "funil_anotar")!.annotations.readOnlyHint === false && listed.find((tool) => tool.name === "pedidos_listar")!.annotations.readOnlyHint === true);

  // O vendedor vê as suas; a diretoria vê as da equipe.
  assert.deepEqual(data(await ask(ANA, "tools/call", { name: "funil_oportunidades", arguments: {} })).value.map((row: { titulo: string }) => row.titulo), ["Academia nova"]);
  assert.deepEqual(data(await ask(BOSS, "tools/call", { name: "funil_oportunidades", arguments: { busca: "iron" } })).value.map((row: { titulo: string }) => row.titulo), ["Do Caio"]);
  const one = data(await ask(ANA, "tools/call", { name: "funil_oportunidade", arguments: { id: mine } })).value;
  assert.deepEqual([one.titulo, one.valor_estimado, one.atividades.map((activity: { texto: string }) => activity.texto)], ["Academia nova", 85000, ["Ligar para a Paula"]]);
  // A do colega: como se não existisse, para ler e para gravar.
  assert.deepEqual(data(await ask(ANA, "tools/call", { name: "funil_oportunidade", arguments: { id: theirs } })), { value: "Oportunidade não encontrada.", isError: true });
  assert.equal(data(await ask(ANA, "tools/call", { name: "funil_anotar", arguments: { id: theirs, texto: "Invasão" } })).isError, true);
  assert.deepEqual(await listActivities(theirs, db.pool), []);
  // Gravar na sua: fica em nome dela.
  assert.deepEqual(data(await ask(ANA, "tools/call", { name: "funil_criar_tarefa", arguments: { id: mine, texto: "Enviar proposta", para: "2026-10-15" } })).value, { criada: true });
  assert.deepEqual(data(await ask(ANA, "tools/call", { name: "funil_anotar", arguments: { id: String(mine), texto: "Quer inaugurar em janeiro" } })).value, { anotada: true });
  assert.ok((await listActivities(mine, db.pool)).some((activity) => activity.title === "Enviar proposta" && activity.createdBy === ANA.email && activity.dueOn === "2026-10-15"));
  assert.deepEqual(data(await ask(ANA, "tools/call", { name: "funil_tarefas" })).value.map((task: { texto: string }) => task.texto).sort(), ["Enviar proposta", "Ligar para a Paula"]);

  // Ferramenta de tela que a pessoa não tem não existe para ela; campo a mais e campo errado são recusados.
  for (const name of ["recebimentos_em_aberto", "contas_a_pagar_em_aberto", "aprovacoes_pendentes", "producao_ordens", "inventada"]) assert.match(data(await ask(ANA, "tools/call", { name, arguments: {} })).value, /Ferramenta desconhecida/);
  assert.match(data(await ask(ANA, "tools/call", { name: "funil_oportunidade", arguments: { id: mine, sql: "DROP TABLE" } })).value, /Campo que a ferramenta não tem: sql/);
  assert.match(data(await ask(ANA, "tools/call", { name: "funil_oportunidade", arguments: { id: "1; DROP" } })).value, /Informe "id"/);
  await assert.rejects(() => callTool(ANA, db.pool, "producao_ordens", {}), ToolError);
  // As outras telas respondem para quem as tem, mesmo sem nada cadastrado.
  for (const name of ["clientes_buscar", "pedidos_listar", "aprovacoes_pendentes", "recebimentos_em_aberto", "contas_a_pagar_em_aberto", "producao_ordens"]) assert.deepEqual(data(await ask(BOSS, "tools/call", { name, arguments: {} })).value, [], name);
  assert.deepEqual(data(await ask(BOSS, "tools/call", { name: "producao_materiais" })).value, { vai_faltar: [], abaixo_do_minimo: [], ordens_sem_lista_de_materiais: 0 });
  assert.match(data(await ask(BOSS, "tools/call", { name: "cliente_historico", arguments: { id: 999 } })).value, /Cliente não encontrado/);
  // Cada chamada ficou anotada, com o resultado.
  assert.ok(noted.some(([tool, ok]) => tool === "funil_anotar" && ok) && noted.some(([tool, ok]) => tool === "recebimentos_em_aberto" && !ok));
});

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const read = (file: string) => readFileSync(SRC + file, "utf8");

test("MCP no código: nada de custo nas leituras, a chave confere empresa, conexão e pessoa a cada pedido, e as rotas sem login não abrem banco por conta própria", () => {
  // O que os assistentes leem não toca custo, margem, preço de fornecedor nem alçada.
  for (const file of ["lib/db/mcp-read.ts", "lib/mcp/tools.ts"]) {
    assert.doesNotMatch(read(file), /@\/lib\/(pricing|db\/(products|params|price-table|supplier))|advisory_cost|supplier_price|tax_credit|\bFROM (products|price_table\w*|pricing_params\w*|supplier_items|commissions)\b|seesCosts/, file);
  }
  const access = read("lib/mcp/access.ts");
  assert.ok(access.indexOf("if (!tenant) return null;") < access.indexOf("tenantDb("));
  assert.ok(access.indexOf("await mcpEnabled(opened.conn)") < access.indexOf("grantOfAccess(") && access.indexOf("grantOfAccess(") < access.indexOf("sessionOf("));
  const sources = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((file) => /\.tsx?$/.test(file));
  // Só a porta do MCP e a rota das chaves abrem a empresa por um segredo.
  assert.deepEqual(sources.filter((file) => /openMcpTenant\(|mcpAccess\(/.test(read(file)) && file !== "lib/mcp/access.ts").sort(), ["app/mcp/route.ts", "app/oauth/token/route.ts"]);
  // A tela de conectar é de quem está logado, e cada um só desconecta o que é seu.
  assert.match(read("app/conectar/page.tsx"), /const session = await requireSession\("\/conectar"\);/);
  const mineOnly = read("app/conectar/actions.ts");
  assert.ok(mineOnly.includes('const session = await requireSession("/conectar");') && mineOnly.includes("revokeConnection(id, session.email, session.email, conn)"));
  for (const file of ["app/mcp/route.ts", "app/oauth/token/route.ts", "app/oauth/register/route.ts", "app/.well-known/oauth-authorization-server/route.ts", "app/.well-known/oauth-protected-resource/[[...resource]]/route.ts"]) {
    assert.doesNotMatch(read(file), /tenantDb|getSession|cookies\(|console\./, file);
  }
  const route = read("app/mcp/route.ts");
  assert.ok(route.indexOf("await mcpAccess(") < route.indexOf("request.text()"));
  // Quem decide na tela de autorização é quem está logado, e o retorno só vai para endereço registrado pelo aplicativo.
  const consent = read("app/oauth/authorize/actions.ts");
  assert.match(consent.split("export async function decideAuthorizationAction")[1].split("{").slice(1).join("{").trimStart(), /^const session = await requireSession\(/);
  assert.ok(consent.indexOf("client.redirectUris.includes(redirectUri)") < consent.indexOf("new URL(redirectUri)"));
  assert.ok(consent.includes("email: session.email") && !/formData\.get\("(email|tenant|empresa|role)"\)/.test(consent));
  // Códigos e chaves nunca vão a log.
  for (const file of sources.filter((name) => /mcp|oauth/.test(name))) for (const line of read(file).split("\n").filter((text) => /console\.(info|error|log|warn)/.test(text))) assert.doesNotMatch(line, /token|code\b|secret|verifier|authorization/i, `${file}: ${line.trim()}`);
});

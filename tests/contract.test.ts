import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { renderContractPdf, withEvidence } from "@/lib/contract/pdf";
import { clientIp, openSigning, publicAppUrl } from "@/lib/contract/public";
import { addressLine, blankWords, CONTRACT_WORDS, contractNumber, DEFAULT_CONTRACT_BODY, fillContract, maskedEmail, wordsUsed } from "@/lib/contract/text";
import type { ContractValues } from "@/lib/contract/text";
import { fingerprint, hashCode, hashToken, newCode, newToken, TOKEN } from "@/lib/contract/token";
import { pdfPieces } from "./pdf-helpers.ts";

const values = Object.fromEntries(CONTRACT_WORDS.map(([word]) => [word, `<${word}>`])) as ContractValues;

test("contrato: os campos entre chaves viram os dados do pedido; palavra desconhecida fica como digitada", () => {
  assert.equal(fillContract("{cliente} compra de {empresa}. {outra} {cliente}", values), "<cliente> compra de <empresa>. {outra} <cliente>");
  assert.deepEqual(wordsUsed("{total} {total} {nada} {local}"), ["total", "local"]);
  // O texto padrão só usa campos que existem, e traz a cláusula da assinatura eletrônica.
  assert.doesNotMatch(fillContract(DEFAULT_CONTRACT_BODY, values), /\{[a-z_]+\}/);
  assert.match(DEFAULT_CONTRACT_BODY, /assinado por meio eletrônico[\s\S]*Medida Provisória nº 2\.200-2\/2001/);
  // O que o modelo usa e o pedido não tem é avisado; observações e nome fantasia podem faltar sem aviso.
  const some = { ...values, empresa_cnpj: "", local: " ", observacoes: "", cliente_fantasia: "" };
  assert.deepEqual(blankWords("{empresa_cnpj} {local} {observacoes} {cliente_fantasia} {total}", some), ["CNPJ da sua empresa (Parâmetros → Fiscal)", "Local de emissão (Parâmetros)"]);
});

test("contrato: endereço em uma linha com o que houver, número do contrato e e-mail mascarado", () => {
  assert.equal(addressLine({ street: "Rua A", streetNumber: "10", complement: "sala 2", district: "Centro", city: "Votuporanga", uf: "SP", cep: "15500000" }), "Rua A, 10, sala 2 - Centro, Votuporanga/SP, CEP 15500-000");
  assert.equal(addressLine({ street: null, streetNumber: null, district: null, city: "Votuporanga", uf: null, cep: null }), "Votuporanga");
  assert.equal(addressLine({ street: null, streetNumber: null, district: null, city: null, uf: null, cep: null }), "");
  assert.equal(contractNumber("261008-RUZL", 2), "261008-RUZL-2");
  assert.equal(maskedEmail("joaquim@cliente.com.br"), "jo*****@cliente.com.br");
  assert.equal(maskedEmail("a@b.co"), "a***@b.co");
});

test("contrato: o segredo do link e o código só existem como resumo, e o código de um link não serve em outro", () => {
  const token = newToken();
  assert.match(token, TOKEN);
  assert.notEqual(newToken(), token);
  assert.match(hashToken(token), /^[0-9a-f]{64}$/);
  assert.ok(!hashToken(token).includes(token));
  for (let i = 0; i < 50; i += 1) assert.match(newCode(), /^\d{6}$/);
  assert.notEqual(hashCode(token, "123456"), hashCode(newToken(), "123456"));
  assert.notEqual(hashCode(token, "123456"), hashCode(token, "123457"));
  assert.equal(fingerprint(new Uint8Array([1, 2, 3])), "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
});

test("contrato em PDF: título, número, seções e lista; texto longo quebra em folhas numeradas; o mesmo texto dá o mesmo arquivo", async () => {
  const body = `# Partes\n\nVENDEDORA: Acme Ltda.\n\n# Objeto\n\n- 2 x LD-B001 - Supino: R$ 10,00 cada, total R$ 20,00\n\n${"Cláusula longa de garantia e assistência técnica. ".repeat(260)}`;
  const document = { company: "Acme", title: "Contrato de compra e venda", number: "261008-RUZL-1", body };
  const pdf = await renderContractPdf(document, null);
  assert.equal(fingerprint(pdf), fingerprint(await renderContractPdf(document, null)));
  const texts = pdfPieces(pdf).map((piece) => piece.text);
  for (const expected of ["Acme", "Nº 261008-RUZL-1", "CONTRATO DE COMPRA E VENDA", "PARTES", "OBJETO", "VENDEDORA: Acme Ltda."]) assert.ok(texts.includes(expected), expected);
  assert.ok(texts.some((text) => text.startsWith("2 x LD-B001")));
  const sheets = (await PDFDocument.load(pdf)).getPageCount();
  assert.ok(sheets >= 3, `só ${sheets} folhas`);
  assert.ok(texts.includes(`Página ${sheets} de ${sheets}`));

  // O registro de assinaturas entra em folha própria, sem mexer nas do contrato.
  const signed = await withEvidence(pdf, {
    company: "Acme", title: "Contrato de compra e venda", number: "261008-RUZL-1", sha256: fingerprint(pdf), standing: "Assinado pelo cliente em 09/10/2026 10:00",
    signers: [
      { party: "Comprador(a)", name: "Maria Compradora", document: "529.982.247-25", email: "maria@cliente.test", at: "09/10/2026 10:00", ip: "203.0.113.7", method: "código de confirmação enviado ao e-mail" },
      { party: "Vendedora · Vendedor", name: "João Vendedor", document: null, email: "joao@acme.test", at: "09/10/2026 09:00", ip: null, method: "conta própria no sistema" },
    ],
    events: [{ at: "09/10/2026 08:00", text: "Contrato gerado e enviado para assinatura", ip: null }, { at: "09/10/2026 10:00", text: "Cliente assinou", ip: "203.0.113.7" }],
  });
  assert.equal((await PDFDocument.load(signed)).getPageCount(), sheets + 1);
  const record = pdfPieces(signed).map((piece) => piece.text);
  for (const expected of ["REGISTRO DE ASSINATURAS ELETRÔNICAS", fingerprint(pdf), "Maria Compradora · CPF 529.982.247-25", "E-mail: maria@cliente.test", "COMPRADOR(A)", "Página 1 de 1"]) assert.ok(record.includes(expected), expected);
  assert.ok(record.some((text) => text.includes("Assinou em 09/10/2026 10:00 (horário de Brasília) · Endereço de rede (IP): 203.0.113.7")));
  // As folhas do contrato seguem com a numeração delas.
  assert.ok(record.includes(`Página ${sheets} de ${sheets}`));
});

test("link de assinatura: a empresa do endereço não abre nada sozinha", async () => {
  const env = { ERP_TENANTS: "acme:Acme" };
  const token = newToken();
  // Nome de empresa ou segredo fora do formato: recusado antes de qualquer consulta.
  assert.equal(await openSigning("ACME; DROP", token, env), null);
  assert.equal(await openSigning("acme", "curto", env), null);
  assert.equal(await openSigning("acme", `${token}x`, env), null);
  // Empresa que não é deste ERP: recusada sem abrir banco nenhum (o cadastro pelo site está desligado).
  assert.equal(await openSigning("outra", token, env), null);
  assert.equal(await openSigning("outra", token, { ERP_TENANTS: "" }), null);
});

test("link de assinatura: o IP é o que o proxy viu, e o endereço público não termina em barra", () => {
  const headers = (value: string | null) => ({ get: (name: string) => (name === "x-forwarded-for" ? value : null) });
  // O que o navegador mandou no cabeçalho vem antes e não é usado.
  assert.equal(clientIp(headers("1.1.1.1, 203.0.113.7")), "203.0.113.7");
  assert.equal(clientIp(headers("2001:db8::1")), "2001:db8::1");
  assert.equal(clientIp(headers("<script>")), null);
  assert.equal(clientIp(headers(null)), null);
  assert.equal(publicAppUrl({ APP_URL: " https://erp.avilaops.com/ " }), "https://erp.avilaops.com");
});

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const read = (file: string) => readFileSync(SRC + file, "utf8");
const sources = () => readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((file) => /\.tsx?$/.test(file));

test("página de assinatura: sem sessão, só o contrato do link, nunca indexada, e nada de custo", () => {
  const dir = "app/contrato/[empresa]/[token]/";
  const files = sources().filter((file) => file.startsWith(dir));
  assert.deepEqual(files.map((file) => file.slice(dir.length)).sort(), ["PublicForm.tsx", "actions.ts", "page.tsx", "pdf/route.ts"]);
  for (const file of files) {
    const code = read(file);
    // A empresa nunca é aberta aqui: só por openSigning, que confere o segredo do link.
    assert.doesNotMatch(code, /tenantDb|withTenantConnection|controlDb|from "pg"|search_path|tenant_/, file);
    assert.doesNotMatch(code, /@\/lib\/auth|getSession|requirePermission|cookies\(/, file);
    // Nada de preço de custo, tabela, pedido inteiro ou cliente: só o contrato.
    assert.doesNotMatch(code, /@\/lib\/db\/(orders|products|params|price-table|customers|users|company|fiscal)|@\/lib\/pricing/, file);
    for (const line of code.split("\n").filter((text) => /console\.(info|error|log|warn)/.test(text))) assert.doesNotMatch(line, /token|code|formData|document/i, line.trim());
  }
  // Cada ação e a rota do PDF começam conferindo o link.
  const actions = read(`${dir}actions.ts`);
  const bodies = actions.split(/export async function \w+\([^)]*\)[^{]*\{/).slice(1);
  assert.equal(bodies.length, 3);
  for (const body of bodies) assert.match(body.trimStart(), /^const signing = await signingOf\(formData\);\s+if \(!signing\) return \{ error: GONE \};/);
  assert.ok(actions.includes('return openSigning(field(formData, "empresa"), field(formData, "token"));'));
  const route = read(`${dir}pdf/route.ts`);
  assert.ok(route.indexOf("await openSigning(empresa, token)") < route.indexOf("contractFile("));
  assert.ok(route.includes('"X-Robots-Tag": "noindex, nofollow"') && route.includes('"Cache-Control": "private, no-store"'));
  const page = read(`${dir}page.tsx`);
  assert.ok(page.includes('export const dynamic = "force-dynamic"'));
  assert.ok(page.includes("robots: { index: false, follow: false }") && page.includes('referrer: "no-referrer"'));
  assert.ok(page.indexOf("await openSigning(empresa, token)") < page.indexOf("markViewed("));
  // Contrato cancelado e endereço que não abre nada dão a mesma resposta.
  assert.ok(page.includes('if (!signing || signing.contract.status === "cancelado")'));
  assert.ok(route.includes('if (!signing || signing.contract.status === "cancelado")'));
  // O formulário de navegador não conhece o contrato.
  assert.doesNotMatch(read(`${dir}PublicForm.tsx`), /@\/lib\/(db|contract)/);
});

test("fora da sessão, só o login e o link de assinatura escolhem a empresa", () => {
  const free = sources().filter((file) => /tenantDb\((?!session\.tenant\.slug\))/.test(read(file)) && file !== "lib/db/pool.ts");
  assert.deepEqual(free.sort(), ["lib/auth/index.ts", "lib/auth/signed-up.ts", "lib/contract/public.ts"]);
  // E só a página de assinatura usa o link.
  const users = sources().filter((file) => read(file).includes("openSigning(") && file !== "lib/contract/public.ts");
  assert.deepEqual(users.sort(), ["app/contrato/[empresa]/[token]/actions.ts", "app/contrato/[empresa]/[token]/page.tsx", "app/contrato/[empresa]/[token]/pdf/route.ts"]);
  const opener = read("lib/contract/public.ts");
  assert.ok(opener.indexOf("TENANT_SLUG.test(company) || !TOKEN.test(token)") < opener.indexOf("tenantDb("));
  assert.ok(opener.indexOf("if (!tenant) return null;") < opener.indexOf("tenantDb("));
});

test("contrato no pedido: as ações conferem a permissão, o alcance do vendedor e tiram quem assina da sessão", () => {
  const actions = read("app/(app)/pedidos/contract-actions.ts");
  assert.equal(actions.split('await requirePermission("pedidos")').length - 1, 4);
  assert.equal(actions.split("seesAllOrders(session) ? null : session.email").length - 1, 2);
  assert.ok(actions.includes("{ email: session.email, name: session.name, role: session.profile ?? ROLE_LABELS[session.role], ip: clientIp(await headers()) }"));
  assert.doesNotMatch(actions, /formData\.get\("(email|name|role|tenant|empresa)"\)|field\(formData, "(email|name|role|tenant|empresa)"\)/);
  for (const file of ["api/pedidos/[numero]/contrato/[id]/route.ts", "api/pedidos/[numero]/contrato-previa/route.ts"]) {
    const route = read(`app/${file}`);
    assert.ok(route.includes('if (!allows(session, "pedidos")) return'), file);
    assert.ok(route.includes("seesAllOrders(session) ? null : session.email"), file);
  }
  // O contrato de um pedido só é achado junto com o pedido.
  assert.ok(read("app/api/pedidos/[numero]/contrato/[id]/route.ts").includes("getOrderContract(order.id, Number(id), conn)"));
  // O modelo é de quem tem Parâmetros.
  assert.ok(read("app/(app)/parametros/contrato/actions.ts").includes('await requirePermission("parametros")'));
});

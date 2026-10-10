import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { renderContractPdf, withEvidence } from "@/lib/contract/pdf";
import { deflateRawSync } from "node:zlib";
import { ContractFileError, docxText, modelText } from "@/lib/contract/docx";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { clientIp, openSigning, publicAppUrl } from "@/lib/contract/public";
import { certificateHolder, sealOf, sealPdf } from "@/lib/contract/seal";
import { maskedPhone, mobileNumber, sendSms, smsAvailable, smsConfig, SmsError } from "@/lib/contract/sms";
import { linkDelivers } from "@/lib/db/contracts";
import { signingKeyOf } from "@/lib/fiscal/sign";
import { testPfx } from "./fiscal-helpers.ts";
import { addressLine, blankWords, CONTRACT_WORDS, contractNumber, DEFAULT_CONTRACT_BODY, fillContract, maskedEmail, wordsUsed } from "@/lib/contract/text";
import type { ContractValues } from "@/lib/contract/text";
import { moneyInWords, numberInWords } from "@/lib/contract/words";
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
  // A API de outros sistemas é a terceira porta: a empresa sai da chave, que tem de ser daquela empresa.
  // E a rotina de fundo, que percorre as empresas da configuração, cada uma no seu banco.
  // E as duas portas públicas do marketing: o formulário de captura e o descadastro, cada uma só com o que o endereço nomeia.
  assert.deepEqual(free.sort(), ["lib/api/access.ts", "lib/auth/index.ts", "lib/auth/signed-up.ts", "lib/background.ts", "lib/contract/public.ts", "lib/marketing/public.ts", "lib/mcp/access.ts", "lib/voice/public.ts", "lib/whatsapp/public.ts"]);
  // E só a página de assinatura usa o link.
  const users = sources().filter((file) => read(file).includes("openSigning(") && file !== "lib/contract/public.ts");
  assert.deepEqual(users.sort(), ["app/contrato/[empresa]/[token]/actions.ts", "app/contrato/[empresa]/[token]/page.tsx", "app/contrato/[empresa]/[token]/pdf/route.ts"]);
  const opener = read("lib/contract/public.ts");
  assert.ok(opener.indexOf("if (!TOKEN.test(token)) return null;") < opener.indexOf("tenantDb(") && opener.indexOf("await knownTenant(company, env)") < opener.indexOf("tenantDb("));
  assert.ok(opener.indexOf("if (!tenant) return null;") < opener.indexOf("tenantDb("));
});

test("contrato no pedido: as ações conferem a permissão, o alcance do vendedor e tiram quem assina da sessão", () => {
  const actions = read("app/(app)/pedidos/contract-actions.ts");
  assert.equal(actions.split('await requirePermission("pedidos")').length - 1, 5);
  assert.equal(actions.split("seesAllOrders(session) ? null : session.email").length - 1, 3);
  // O arquivo é recusado pelo tamanho antes de ser lido.
  assert.ok(actions.indexOf("file.size > 6 * 1024 * 1024") < actions.indexOf("await file.arrayBuffer()"));
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

/** A ZIP with the files given, each one deflated or stored: enough of the format for a .docx. */
function zip(files: [name: string, content: string, deflate?: boolean][]): Uint8Array {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content, deflate = true] of files) {
    const raw = Buffer.from(content, "utf8");
    const packed = deflate ? deflateRawSync(raw) : raw;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(deflate ? 8 : 0, 8);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(Buffer.byteLength(name), 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(deflate ? 8 : 0, 10);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(Buffer.byteLength(name), 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(head, Buffer.from(name), packed);
    central.push(entry, Buffer.from(name));
    offset += 30 + Buffer.byteLength(name) + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

const DOCUMENT = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
<w:p><w:pPr><w:pStyle w:val="Ttulo1"/></w:pPr><w:r><w:t>Cláusula 1 - Objeto</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">A VENDEDORA vende </w:t></w:r><w:r><w:t>ao COMPRADOR &amp; sucessores os equipamentos &lt;abaixo&gt;.</w:t></w:r></w:p>
<w:p></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Garantia de 12 meses</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Foro:</w:t><w:tab/><w:t>Votuporanga&#47;SP</w:t></w:r></w:p>
<w:p><w:r><w:t>Linha um</w:t><w:br/><w:t>Linha dois</w:t></w:r><w:r><w:instrText>PAGE</w:instrText></w:r></w:p>
</w:body></w:document>`;

test("modelo em Word: o texto do .docx vira o modelo, com título, lista e acentos; a formatação fica para trás", () => {
  const expected = "# Cláusula 1 - Objeto\n\nA VENDEDORA vende ao COMPRADOR & sucessores os equipamentos <abaixo>.\n\n- Garantia de 12 meses\n- Foro: Votuporanga/SP\n\nLinha um\n\nLinha dois";
  for (const deflate of [true, false]) {
    assert.equal(docxText(zip([["[Content_Types].xml", "<Types/>", deflate], ["word/document.xml", DOCUMENT, deflate], ["word/styles.xml", "<w:styles/>", deflate]])), expected);
  }
  assert.equal(modelText(zip([["word/document.xml", DOCUMENT]]), "Contrato Ludus.DOCX"), expected);
  // Texto simples entra como está.
  assert.equal(modelText(new TextEncoder().encode("\ufeffCláusula 1\r\n\r\n{cliente} compra.\r\n"), "contrato.txt"), "Cláusula 1\n\n{cliente} compra.");
});

test("modelo em Word: o que não é um documento legível é recusado com o motivo, sem estourar a memória", () => {
  const refused = (bytes: Uint8Array, name: string, message: RegExp) => assert.throws(() => modelText(bytes, name), (error: unknown) => error instanceof ContractFileError && message.test(error.message));
  refused(new Uint8Array(0), "contrato.docx", /está vazio/);
  refused(new TextEncoder().encode("isto não é um zip"), "contrato.docx", /documento do Word/);
  refused(zip([["outra/coisa.xml", "<a/>"]]), "contrato.docx", /documento do Word/);
  refused(zip([["word/document.xml", "<w:document><w:body><w:p></w:p></w:body></w:document>"]]), "contrato.docx", /não tem texto/);
  refused(new Uint8Array(2 * 1024 * 1024 + 1), "contrato.docx", /limite é 2 MB/);
  refused(new TextEncoder().encode("x"), "contrato.doc", /Word antigo/);
  refused(new TextEncoder().encode("%PDF-1.7"), "contrato.pdf", /PDF não serve de modelo/);
  // Um arquivo pequeno feito para virar centenas de megabytes ao abrir não é aberto.
  const bomb = zip([["word/document.xml", `<w:p><w:r><w:t>${"A".repeat(9 * 1024 * 1024)}</w:t></w:r></w:p>`]]);
  assert.ok(bomb.byteLength < 2 * 1024 * 1024);
  refused(bomb, "contrato.docx", /documento do Word/);
});

test("modelo em Word e PDF próprio: as telas enviam o arquivo só para quem pode e dizem o que acontece", () => {
  const model = read("app/(app)/parametros/contrato/actions.ts");
  assert.equal(model.split('await requirePermission("parametros")').length - 1, 2);
  assert.ok(model.indexOf("file.size > 2 * 1024 * 1024") < model.indexOf("await file.arrayBuffer()"));
  // Importar troca só o texto: título, validade e mensagem do e-mail ficam.
  assert.ok(model.includes("saveContractSettings({ ...(await loadContractSettings(conn)), body }, session.email, conn)"));
  // Na página de assinatura, o contrato em arquivo leva direto ao PDF.
  const signing = read("app/contrato/[empresa]/[token]/page.tsx");
  assert.ok(signing.includes("{contract.fileName ? (") && signing.includes("Abrir o contrato (PDF)"));
});

test("link do cliente: entrega o arquivo enquanto aguarda no prazo e, assinado, só pelos dias que a empresa definiu", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  const at = (days: number) => new Date(now.getTime() + days * 86_400_000);
  assert.equal(linkDelivers({ status: "enviado", expiresAt: at(1), signedAt: null }, now, 30), true);
  // Venceu sem assinatura: o endereço não entrega mais nada.
  assert.equal(linkDelivers({ status: "enviado", expiresAt: at(-1), signedAt: null }, now, 30), false);
  assert.equal(linkDelivers({ status: "assinado", expiresAt: at(-20), signedAt: at(-29) }, now, 30), true);
  assert.equal(linkDelivers({ status: "assinado", expiresAt: at(-20), signedAt: at(-31) }, now, 30), false);
  assert.equal(linkDelivers({ status: "assinado", expiresAt: at(5), signedAt: at(-2) }, now, 1), false);
  for (const status of ["recusado", "cancelado"] as const) assert.equal(linkDelivers({ status, expiresAt: at(5), signedAt: null }, now, 30), false);
});

test("selo digital: o PDF sai assinado com o certificado da empresa, cobre o arquivo inteiro e acusa qualquer alteração", async () => {
  const document = await PDFDocument.create();
  document.addPage().drawText("Contrato de teste");
  document.addPage();
  const pdf = await document.save();
  const key = signingKeyOf(testPfx({ bits: 2048 }), "senha-de-teste");
  assert.equal(certificateHolder(key), "ACADEMIA TESTE LTDA:48240052000161");
  assert.equal(sealOf(pdf), null);
  const sealed = await sealPdf(pdf, key, { name: certificateHolder(key), reason: "Contrato assinado", at: new Date("2026-10-09T15:00:00Z") });
  const seal = sealOf(sealed)!;
  // As folhas são as mesmas, e a assinatura cobre do primeiro ao último byte, menos o lugar dela.
  assert.equal((await PDFDocument.load(sealed)).getPageCount(), 2);
  assert.equal(seal.range[0], 0);
  assert.equal(seal.range[2] + seal.range[3], sealed.length);
  assert.equal(seal.signed.length, sealed.length - (seal.range[2] - seal.range[1]));
  const text = Buffer.from(sealed).toString("latin1");
  for (const expected of ["/SubFilter /adbe.pkcs7.detached", "/Type /Sig", "/FT /Sig", "/SigFlags 3"]) assert.ok(text.includes(expected), expected);
  // A chave privada não vai para o arquivo.
  assert.ok(!text.includes("PRIVATE KEY"));

  // Conferido por uma implementação independente (OpenSSL): íntegro passa, um byte trocado não.
  let openssl = true;
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
  } catch {
    openssl = false;
  }
  if (!openssl) return;
  const dir = mkdtempSync(`${tmpdir()}/erp-selo-`);
  try {
    const verify = (content: Uint8Array) => {
      writeFileSync(`${dir}/assinatura.der`, seal.signature);
      writeFileSync(`${dir}/conteudo.bin`, content);
      try {
        execFileSync("openssl", ["cms", "-verify", "-binary", "-inform", "DER", "-in", `${dir}/assinatura.der`, "-content", `${dir}/conteudo.bin`, "-noverify", "-out", "/dev/null"], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    };
    assert.equal(verify(seal.signed), true);
    const changed = Buffer.from(seal.signed);
    changed[Math.floor(changed.length / 2)] ^= 1;
    assert.equal(verify(changed), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("segundo código: só celular brasileiro recebe, o número aparece mascarado e a credencial do SMS vem do servidor", async () => {
  assert.equal(mobileNumber("(17) 99781-1471"), "5517997811471");
  assert.equal(mobileNumber("+55 17 99781 1471"), "5517997811471");
  // Fixo, número curto ou sem DDD não recebem código.
  for (const typed of ["(17) 3421-1234", "99781-1471", "", "1799781147", "00997811471"]) assert.equal(mobileNumber(typed), null, typed);
  assert.equal(maskedPhone("5517997811471"), "(17) 9****-1471");

  assert.equal(smsConfig({}), null);
  assert.equal(smsAvailable({ ERP_TWILIO_ACCOUNT_SID: "errado", ERP_TWILIO_AUTH_TOKEN: "t", ERP_TWILIO_FROM: "+15005550006" }), false);
  const env = { ERP_TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, ERP_TWILIO_AUTH_TOKEN: "segredo", ERP_TWILIO_FROM: "+15005550006" };
  const config = smsConfig(env)!;
  assert.equal(smsAvailable(env), true);
  const calls: { url: string; init: { headers: Record<string, string>; body: string } }[] = [];
  await sendSms(config, "5517997811471", "123456 é o seu código", async (url, init) => {
    calls.push({ url, init });
    return { status: 201, json: async () => ({}) };
  });
  assert.equal(calls[0].url, `https://api.twilio.com/2010-04-01/Accounts/AC${"a".repeat(32)}/Messages.json`);
  assert.equal(Buffer.from(calls[0].init.headers.Authorization.slice(6), "base64").toString(), `AC${"a".repeat(32)}:segredo`);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[0].init.body)), { To: "+5517997811471", From: "+15005550006", Body: "123456 é o seu código" });
  await assert.rejects(() => sendSms(config, "5517997811471", "x", async () => ({ status: 400, json: async () => ({ message: "The 'To' number is not a valid phone number." }) })), (error: unknown) => error instanceof SmsError && /recusou o envio \(400\): The 'To' number/.test(error.message));
  await assert.rejects(() => sendSms(config, "5517997811471", "x", async () => { throw new Error("ECONNRESET"); }), /não respondeu/);
});

test("proteções do contrato: o link só entrega pela regra do prazo, e nenhum código vai para log", () => {
  const route = read("app/contrato/[empresa]/[token]/pdf/route.ts");
  assert.ok(route.indexOf("linkDelivers(contract, now,") < route.indexOf("contractFile("));
  assert.ok(read("app/contrato/[empresa]/[token]/page.tsx").includes("linkDelivers(contract, now,"));
  for (const file of ["lib/db/send-contract.ts", "lib/contract/sms.ts", "lib/contract/seal.ts", "lib/db/contract-seal.ts", "lib/db/contracts.ts"]) {
    for (const line of read(file).split("\n").filter((text) => /console\.(info|error|log|warn)/.test(text))) assert.doesNotMatch(line, /\bcode\b|phoneCode|token|authToken|privateKey|password|\btext\b/i, line.trim());
  }
  // O selo usa o certificado só para assinar: nada dele volta para tela nenhuma.
  const sealing = read("lib/db/contract-seal.ts");
  assert.doesNotMatch(sealing, /console\./);
  for (const page of ["app/(app)/parametros/contrato/page.tsx", "app/(app)/pedidos/[numero]/page.tsx", "app/contrato/[empresa]/[token]/page.tsx"]) assert.doesNotMatch(read(page), /openCertificate|loadContractSeal|privateKey|ERP_TWILIO/, page);
});

test("valor por extenso: como o contrato escreve depois do número", () => {
  const cases: [number, string][] = [
    [0, "zero"], [1, "um"], [16, "dezesseis"], [21, "vinte e um"], [100, "cem"], [101, "cento e um"], [110, "cento e dez"], [999, "novecentos e noventa e nove"],
    [1000, "mil"], [1001, "mil e um"], [1100, "mil e cem"], [1234, "mil duzentos e trinta e quatro"], [2500, "dois mil e quinhentos"], [21334, "vinte e um mil trezentos e trinta e quatro"],
    [100000, "cem mil"], [1000000, "um milhão"], [2000010, "dois milhões e dez"], [1250300, "um milhão duzentos e cinquenta mil e trezentos"],
  ];
  for (const [value, words] of cases) assert.equal(numberInWords(value), words, String(value));
  assert.equal(moneyInWords(21334.57), "vinte e um mil trezentos e trinta e quatro reais e cinquenta e sete centavos");
  assert.equal(moneyInWords(10000), "dez mil reais");
  assert.equal(moneyInWords(1), "um real");
  assert.equal(moneyInWords(0.01), "um centavo");
  assert.equal(moneyInWords(0.5), "cinquenta centavos");
  assert.equal(moneyInWords(1000000), "um milhão de reais");
  assert.equal(moneyInWords(1000000.1), "um milhão de reais e dez centavos");
  assert.equal(moneyInWords(1500000), "um milhão e quinhentos mil reais");
  // Centavo quebrado da conta em ponto flutuante não vira "noventa e nove".
  assert.equal(moneyInWords(11334.57 + 10000), "vinte e um mil trezentos e trinta e quatro reais e cinquenta e sete centavos");
  assert.throws(() => moneyInWords(-1));
  assert.throws(() => numberInWords(1.5));
});

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";
import sharp from "sharp";
import { DELETE, GET, PUT } from "@/app/api/produtos/[id]/foto/route";
import type { Role } from "@/lib/auth/roles";
import { tenantSchema } from "@/lib/db/config";
import { migrate } from "@/lib/db/migrate";
import { closeTenantPools, tenantDb } from "@/lib/db/pool";
import { loadProductPhoto } from "@/lib/db/product-photos";
import { createProduct } from "@/lib/db/products";
import { MAX_UPLOAD_BYTES, normalizePhoto } from "@/lib/photos/normalize";
import { MIGRATIONS_DIR, SKIP_WITHOUT_DB, testDatabaseUrl } from "./db-helpers.ts";
import { SECRET, setCookies, ssoToken } from "./helpers.ts";

const skip = SKIP_WITHOUT_DB;
// Two companies of this run only: the test file may run next to others.
const suffix = randomBytes(4).toString("hex");
const A = `foto_a_${suffix}`;
const B = `foto_b_${suffix}`;

const EMAILS: Record<Role, string> = {
  DIRETORIA: "dir@teste.local",
  GERENTE_COMERCIAL: "ger@teste.local",
  VENDEDOR: "ven@teste.local",
  FINANCEIRO: "fin@teste.local",
};
const DIRECTOR_B = "dir-b@teste.local";

const ENV: Record<string, string | undefined> = {
  NODE_ENV: "test",
  ERP_LOCAL_LOGIN: undefined,
  SSO_JWT_SECRET: SECRET,
  ERP_TENANTS: `${A}:Empresa A;${B}:Empresa B`,
  ERP_USERS: [...Object.entries(EMAILS).map(([role, email]) => `${email}:${role}@${A}`), `${DIRECTOR_B}:DIRETORIA@${B}`].join(","),
};
const previous: Record<string, string | undefined> = {};
const env = process.env as Record<string, string | undefined>;

async function admin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

let productId: number;
let emptyId: number;
let jpeg: Buffer;

before(async () => {
  if (skip) return;
  // The application reads DATABASE_URL; here it is the test database (the helper refuses any other).
  for (const [key, value] of Object.entries({ ...ENV, DATABASE_URL: testDatabaseUrl() })) {
    previous[key] = env[key];
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  await admin(async (client) => {
    for (const slug of [A, B]) {
      await client.query(`CREATE SCHEMA ${tenantSchema(slug)}`);
      await client.query(`SET search_path TO ${tenantSchema(slug)}`);
      await migrate(client, MIGRATIONS_DIR);
    }
  });
  productId = (await createProduct({ name: "Mesa da A", code: "LD-B001" }, "teste", tenantDb(A))).id;
  emptyId = (await createProduct({ name: "Sem foto", code: "LD-B002" }, "teste", tenantDb(A))).id;
  jpeg = await sharp({ create: { width: 1500, height: 1000, channels: 3, background: "#336699" } }).jpeg().toBuffer();
});

after(async () => {
  if (skip) return;
  await closeTenantPools();
  await admin(async (client) => {
    for (const slug of [A, B]) await client.query(`DROP SCHEMA IF EXISTS ${tenantSchema(slug)} CASCADE`);
  });
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
});

const signIn = (email: string | null) => setCookies(email === null ? {} : { avila_sso: ssoToken({ email }) });
const context = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
const url = (id: number | string) => `https://erp.teste.local/api/produtos/${id}/foto`;

const get = (id: number | string, headers: Record<string, string> = {}) => GET(new Request(url(id), { headers }), context(id));
const remove = (id: number | string) => DELETE(new Request(url(id), { method: "DELETE" }), context(id));
/** `length` is what the request declares; `null` sends no Content-Length. */
function put(id: number | string, body: Uint8Array, length: number | null = body.length, headers: Record<string, string> = {}) {
  const request = new Request(url(id), {
    method: "PUT",
    body: new Uint8Array(body),
    headers: { ...headers, ...(length === null ? {} : { "content-length": String(length) }) },
  });
  return PUT(request, context(id));
}

test("sem sessão: 401 em GET, PUT e DELETE, e nada é gravado", { skip }, async () => {
  signIn(null);
  assert.equal((await get(productId)).status, 401);
  assert.equal((await put(productId, jpeg)).status, 401);
  assert.equal((await remove(productId)).status, 401);

  // Token assinado com outro segredo, ou de quem não está no diretório do ERP: também não entra.
  setCookies({ avila_sso: ssoToken({ email: EMAILS.DIRETORIA }, { secret: "outro-segredo-com-mais-de-32-caracteres" }) });
  assert.equal((await put(productId, jpeg)).status, 401);
  signIn("fora@teste.local");
  assert.equal((await get(productId)).status, 401);
  assert.equal(await loadProductPhoto(productId, tenantDb(A)), null);
});

test("PUT da Diretoria grava a foto normalizada, com o e-mail da sessão", { skip }, async () => {
  signIn(EMAILS.DIRETORIA);
  // O Content-Type do pedido não decide nada, nem nada que venha em cabeçalho.
  const response = await put(productId, jpeg, jpeg.length, { "content-type": "text/html", "x-user-email": "outro@teste.local" });
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");

  const expected = await normalizePhoto(jpeg);
  const stored = await loadProductPhoto(productId, tenantDb(A));
  assert.equal(stored?.sha256, expected.sha256);
  const row = (await tenantDb(A).query("SELECT updated_by, width, height FROM product_photos WHERE product_id = $1", [productId])).rows[0];
  assert.deepEqual(row, { updated_by: EMAILS.DIRETORIA, width: 1200, height: 800 });
});

test("GET: qualquer um dos quatro perfis recebe a foto; If-None-Match igual dá 304", { skip }, async () => {
  const stored = await loadProductPhoto(productId, tenantDb(A));
  assert.ok(stored);
  for (const role of Object.keys(EMAILS) as Role[]) {
    signIn(EMAILS[role]);
    const response = await get(productId);
    assert.equal(response.status, 200, role);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(response.headers.get("etag"), `"${stored.sha256}"`);
    assert.equal(response.headers.get("cache-control"), "private, no-cache");
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(stored.bytes), role);
  }

  signIn(EMAILS.VENDEDOR);
  const cached = await get(productId, { "if-none-match": `"${stored.sha256}"` });
  assert.equal(cached.status, 304);
  assert.equal((await cached.arrayBuffer()).byteLength, 0);
  assert.equal((await get(productId, { "if-none-match": '"outro"' })).status, 200);

  // Lista de ETags, forma fraca (um proxy acrescenta `W/`) e `*` também dão 304.
  for (const header of [
    `"outro", "${stored.sha256}"`,
    `W/"${stored.sha256}"`,
    `"outro" , W/"${stored.sha256}" ,"mais-um"`,
    "*",
  ]) {
    assert.equal((await get(productId, { "if-none-match": header })).status, 304, header);
  }
  for (const header of ['"outro", W/"mais-um"', stored.sha256, `W/${stored.sha256}`, ""]) {
    assert.equal((await get(productId, { "if-none-match": header })).status, 200, header);
  }
});

test("GET: sem foto, produto inexistente ou id que não é inteiro positivo dá 404", { skip }, async () => {
  signIn(EMAILS.FINANCEIRO);
  for (const id of [emptyId, 999_999, "abc", "0", "-1", "1.5", "1e3", "99999999999", `${productId} or 1=1`]) {
    assert.equal((await get(id)).status, 404, String(id));
  }
});

test("PUT e DELETE: perfil sem o item Produtos recebe 403 e a foto fica como estava", { skip }, async () => {
  const before = (await loadProductPhoto(productId, tenantDb(A)))?.sha256;
  const other = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#ff0000" } }).png().toBuffer();
  for (const role of ["VENDEDOR", "GERENTE_COMERCIAL", "FINANCEIRO"] as const) {
    signIn(EMAILS[role]);
    assert.equal((await put(productId, other)).status, 403, role);
    assert.equal((await remove(productId)).status, 403, role);
  }
  assert.equal((await loadProductPhoto(productId, tenantDb(A)))?.sha256, before);
});

test("PUT: tamanho declarado ausente ou acima do limite dá 413 sem ler o corpo; corpo maior que o declarado também", { skip }, async () => {
  signIn(EMAILS.DIRETORIA);
  const before = (await loadProductPhoto(productId, tenantDb(A)))?.sha256;

  const unread = (length: number | null) => {
    const request = new Request(url(productId), {
      method: "PUT",
      body: new Uint8Array(jpeg),
      headers: length === null ? {} : { "content-length": String(length) },
    });
    return PUT(request, context(productId)).then((response) => ({ status: response.status, bodyUsed: request.bodyUsed }));
  };
  assert.deepEqual(await unread(null), { status: 413, bodyUsed: false });
  assert.deepEqual(await unread(MAX_UPLOAD_BYTES + 1), { status: 413, bodyUsed: false });

  // Declara pouco e manda mais do que o limite: a leitura para no limite.
  const huge = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
  huge.set([0xff, 0xd8, 0xff]);
  assert.equal((await put(productId, huge, 1000)).status, 413);
  assert.equal((await loadProductPhoto(productId, tenantDb(A)))?.sha256, before);
});

test("PUT: formato recusado ou imagem ilegível dá 415 com a mensagem; produto inexistente dá 404", { skip }, async () => {
  signIn(EMAILS.DIRETORIA);
  const svg = await put(emptyId, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), undefined, { "content-type": "image/jpeg" });
  assert.equal(svg.status, 415);
  assert.equal(await svg.text(), "Formato de imagem não aceito: use JPG, PNG ou WebP.");

  const broken = await put(emptyId, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 0x41)]));
  assert.equal(broken.status, 415);
  assert.equal(await broken.text(), "Não foi possível ler a imagem.");
  assert.equal((await put(emptyId, new Uint8Array(), 0)).status, 415);
  assert.equal(await loadProductPhoto(emptyId, tenantDb(A)), null);

  assert.equal((await put(999_999, jpeg)).status, 404);
  assert.equal((await put("abc", jpeg)).status, 404);
});

test("uma empresa não lê, não troca e não apaga a foto de outra", { skip }, async () => {
  const ofA = await loadProductPhoto(productId, tenantDb(A));
  assert.ok(ofA);

  // A diretora da B não tem o produto da A: o mesmo id, no banco dela, não existe.
  signIn(DIRECTOR_B);
  assert.equal((await get(productId)).status, 404);
  assert.equal((await put(productId, jpeg)).status, 404);
  assert.equal((await remove(productId)).status, 404);

  // Com um produto de mesmo id na B, o que ela grava e apaga fica só na B.
  const inB = await createProduct({ name: "Mesa da B", code: "LD-B001" }, "teste", tenantDb(B));
  assert.equal(inB.id, productId);
  const red = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#ff0000" } }).png().toBuffer();
  assert.equal((await put(productId, red)).status, 204);
  const seenByB = await get(productId);
  assert.equal(seenByB.status, 200);
  assert.notEqual(seenByB.headers.get("etag"), `"${ofA.sha256}"`);
  assert.equal((await loadProductPhoto(productId, tenantDb(A)))?.sha256, ofA.sha256);

  // O cookie de empresa não leva ninguém para uma empresa que não é a sua.
  setCookies({ avila_sso: ssoToken({ email: DIRECTOR_B }), erp_tenant: A });
  assert.equal((await get(productId)).headers.get("etag"), seenByB.headers.get("etag"));
  setCookies({ avila_sso: ssoToken({ email: EMAILS.VENDEDOR }), erp_tenant: B });
  assert.equal((await get(productId)).headers.get("etag"), `"${ofA.sha256}"`);

  signIn(DIRECTOR_B);
  assert.equal((await remove(productId)).status, 204);
  assert.equal((await get(productId)).status, 404);
  assert.equal((await loadProductPhoto(productId, tenantDb(A)))?.sha256, ofA.sha256);
  const counts = await admin(async (client) => {
    const count = async (slug: string) =>
      Number((await client.query(`SELECT count(*) FROM ${tenantSchema(slug)}.product_photos`)).rows[0].count);
    return [await count(A), await count(B)];
  });
  assert.deepEqual(counts, [1, 0]);
});

test("DELETE da Diretoria: 204 quando apagou, 404 quando não havia foto", { skip }, async () => {
  signIn(EMAILS.DIRETORIA);
  assert.equal((await remove(productId)).status, 204);
  assert.equal((await remove(productId)).status, 404);
  assert.equal((await remove(emptyId)).status, 404);
  assert.equal((await remove("abc")).status, 404);
  assert.equal((await get(productId)).status, 404);
});

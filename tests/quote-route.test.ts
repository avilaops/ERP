import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, mock, test } from "node:test";
import pg from "pg";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { GET } from "@/app/api/pedidos/[numero]/orcamento/route";
import type { Role } from "@/lib/auth/roles";
import { saveLogo } from "@/lib/db/company";
import { tenantSchema } from "@/lib/db/config";
import { migrate } from "@/lib/db/migrate";
import { addOrderItem, createOrder, saveOrderTerms } from "@/lib/db/orders";
import { loadParams } from "@/lib/db/params";
import { closeTenantPools, tenantDb } from "@/lib/db/pool";
import { loadPublishedTable, publishPriceTable } from "@/lib/db/price-table";
import { saveProductPhoto } from "@/lib/db/product-photos";
import { createProduct, listProducts } from "@/lib/db/products";
import { showMoney } from "@/lib/format";
import { saleOf } from "@/lib/order-quote";
import { draftPriceTable } from "@/lib/price-table";
import { MIGRATIONS_DIR, SKIP_WITHOUT_DB, testDatabaseUrl } from "./db-helpers.ts";
import { SECRET, setCookies, ssoToken } from "./helpers.ts";
import { pdfImages, pdfText } from "./pdf-helpers.ts";

const skip = SKIP_WITHOUT_DB;
// Two companies of this run only: the test file may run next to others.
const suffix = randomBytes(4).toString("hex");
const A = `orc_a_${suffix}`;
const B = `orc_b_${suffix}`;

const EMAILS: Record<Role, string> = {
  DIRETORIA: "dir@teste.local",
  GERENTE_COMERCIAL: "ger@teste.local",
  VENDEDOR: "ven@teste.local",
  FINANCEIRO: "fin@teste.local",
};
const OTHER_SELLER = "outro@teste.local";
const DIRECTOR_B = "dir-b@teste.local";
const SELLER = { email: EMAILS.VENDEDOR, name: "Vera Vendedora" };

const ENV: Record<string, string | undefined> = {
  NODE_ENV: "test",
  ERP_LOCAL_LOGIN: undefined,
  SSO_JWT_SECRET: SECRET,
  ERP_TENANTS: `${A}:Empresa A;${B}:Empresa B`,
  ERP_USERS: [
    ...Object.entries(EMAILS).map(([role, email]) => `${email}:${role}@${A}`),
    `${OTHER_SELLER}:VENDEDOR@${A}`,
    `${DIRECTOR_B}:DIRETORIA@${B}`,
  ].join(","),
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

const ORDER = "261006-RTAA";
const EMPTY = "261006-RTBB";
let invoiceTotal = "";

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

  const conn = tenantDb(A);
  const who = EMAILS.DIRETORIA;
  const bench = await createProduct(
    { name: "Supino reto", code: "LD-R001", description: "Estofado preto.", advisoryCost: 8146.64, taxCredit: 0.2811565 },
    who,
    conn,
  );
  const press = await createProduct({ name: "Leg press", code: "LD-R002", advisoryCost: 8738.77, taxCredit: 0.2735316 }, who, conn);
  await saveProductPhoto(bench.id, await sharp({ create: { width: 900, height: 600, channels: 3, background: "#336699" } }).jpeg().toBuffer(), who, conn);
  await publishPriceTable(draftPriceTable(await loadParams(conn), await listProducts({ active: true }, conn)), 1, who, conn);

  const scope = { sellerEmail: null };
  await createOrder({ seller: SELLER, version: 1, productId: bench.id, quantity: 2 }, () => ORDER, conn);
  await addOrderItem(ORDER, press.id, 1, SELLER.email, scope, conn);
  await saveOrderTerms(ORDER, { discount: 0.05, deliveryUf: "MA", taxpayer: false, productionDays: 90, freight: 0, notes: null }, SELLER.email, scope, conn);
  const table = await loadPublishedTable(1, conn);
  assert.ok(table);
  invoiceTotal = showMoney(
    saleOf(
      {
        discount: 0.05,
        items: [
          { productId: bench.id, quantity: 2 },
          { productId: press.id, quantity: 1 },
        ],
      },
      table,
    ).invoiceTotal,
  );

  // Um pedido sem item não nasce pela camada: aqui o item é tirado direto, para a rota ter o que recusar.
  await createOrder({ seller: SELLER, version: 1, productId: bench.id, quantity: 1 }, () => EMPTY, conn);
  await conn.query("DELETE FROM order_items WHERE order_id = (SELECT id FROM orders WHERE number = $1)", [EMPTY]);
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
const get = (number: string, headers: Record<string, string> = {}) =>
  GET(new Request(`https://erp.teste.local/api/pedidos/${number}/orcamento?role=DIRETORIA&email=${EMAILS.DIRETORIA}`, { headers }), {
    params: Promise.resolve({ numero: number }),
  });

test("sem sessão: 401, e nada do pedido na resposta", { skip }, async () => {
  signIn(null);
  const response = await get(ORDER);
  assert.equal(response.status, 401);
  assert.doesNotMatch(await response.text(), /%PDF|Supino/);

  // Token assinado com outro segredo, ou de quem não está no diretório do ERP: também não entra.
  setCookies({ avila_sso: ssoToken({ email: EMAILS.DIRETORIA }, { secret: "outro-segredo-com-mais-de-32-caracteres" }) });
  assert.equal((await get(ORDER)).status, 401);
  signIn("fora@teste.local");
  assert.equal((await get(ORDER)).status, 401);
});

test("Financeiro não tem o item Pedidos: 403, mesmo dizendo outro perfil no endereço e no cabeçalho", { skip }, async () => {
  signIn(EMAILS.FINANCEIRO);
  const response = await get(ORDER, { "x-user-role": "DIRETORIA", "x-user-email": EMAILS.DIRETORIA });
  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /%PDF|Supino/);
});

test("vendedor dono, gerente e diretoria recebem o PDF do pedido", { skip }, async () => {
  for (const role of ["VENDEDOR", "GERENTE_COMERCIAL", "DIRETORIA"] as const) {
    signIn(EMAILS[role]);
    const response = await get(ORDER);
    assert.equal(response.status, 200, role);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("content-disposition"), `inline; filename="orcamento-${ORDER}.pdf"`);
    assert.equal(response.headers.get("cache-control"), "private, no-store");

    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(response.headers.get("content-length"), String(bytes.length));
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("latin1"), "%PDF-");
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    assert.equal(pdf.getPageCount(), 1);
    assert.equal(pdf.getTitle(), `Orçamento #${ORDER}`);
    // A empresa é a da sessão: sem logo cadastrada, o nome dela vai no cabeçalho.
    assert.equal(pdf.getAuthor(), "Empresa A");

    const text = pdfText(bytes);
    for (const expected of [
      `Orçamento #${ORDER}`,
      "Empresa A",
      "Supino reto",
      "Estofado preto.",
      "Leg press",
      "Desconto (5,0%)",
      invoiceTotal,
      "Entrega: Maranhão",
      "Cliente: a informar",
      // O vendedor é o do pedido, quem quer que gere o arquivo.
      "Vera Vendedora",
      SELLER.email,
    ]) {
      assert.ok(text.includes(expected), `${role}: falta "${expected}"`);
    }
    // Nem para a Diretoria o orçamento do cliente leva custo ou lucro.
    assert.doesNotMatch(text, /custo|lucro|comiss|DIFAL|8\.146|8\.738/i, role);
    // Uma foto cadastrada (a do supino) e nenhuma logo.
    assert.equal(pdfImages(bytes), 1, role);
  }
});

test("com a logo da empresa cadastrada, ela entra no PDF no lugar do nome", { skip }, async () => {
  const logo = await sharp({ create: { width: 400, height: 120, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).webp().toBuffer();
  await saveLogo(logo, EMAILS.DIRETORIA, tenantDb(A));
  signIn(EMAILS.VENDEDOR);
  const bytes = new Uint8Array(await (await get(ORDER)).arrayBuffer());
  assert.equal(pdfImages(bytes), 2);
  assert.ok(!pdfText(bytes).split("\n").includes("Empresa A"));
});

test("foto gravada que não abre: o PDF sai assim mesmo, com o quadro dela vazio", { skip }, async () => {
  const conn = tenantDb(A);
  signIn(EMAILS.VENDEDOR);
  const before = pdfImages(new Uint8Array(await (await get(ORDER)).arrayBuffer()));

  // A foto só é gravada depois de normalizada; aqui ela é estragada direto na tabela.
  const { rows } = await conn.query("SELECT product_id, bytes FROM product_photos");
  assert.equal(rows.length, 1);
  const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, 0x41)]);
  await conn.query("UPDATE product_photos SET bytes = $1 WHERE product_id = $2", [broken, rows[0].product_id]);
  const warn = mock.method(console, "warn", () => {});
  try {
    const response = await get(ORDER);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    // Fica no registro qual produto está com a foto estragada, e só isso: nem bytes, nem o erro da imagem.
    assert.deepEqual(
      warn.mock.calls.map((call) => call.arguments),
      [[`[orcamento] a miniatura do produto ${rows[0].product_id} falhou; o quadro sai vazio`]],
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("latin1"), "%PDF-");
    // Uma imagem a menos (a foto); o resto do orçamento está inteiro.
    assert.equal(pdfImages(bytes), before - 1);
    const text = pdfText(bytes);
    for (const expected of ["Supino reto", "Estofado preto.", "Leg press", invoiceTotal]) assert.ok(text.includes(expected), `falta "${expected}"`);
  } finally {
    await conn.query("UPDATE product_photos SET bytes = $1 WHERE product_id = $2", [rows[0].bytes, rows[0].product_id]);
  }
  // Com a foto de volta, ela volta ao PDF e nada mais é registrado.
  try {
    assert.equal(pdfImages(new Uint8Array(await (await get(ORDER)).arrayBuffer())), before);
    assert.equal(warn.mock.callCount(), 1);
  } finally {
    warn.mock.restore();
  }
});

test("pedido de outro vendedor, inexistente, de outra empresa ou com número torto: 404", { skip }, async () => {
  signIn(OTHER_SELLER);
  assert.equal((await get(ORDER)).status, 404);
  // A diretora da B não alcança pedido da A; o cookie de empresa não a leva para lá.
  signIn(DIRECTOR_B);
  assert.equal((await get(ORDER)).status, 404);
  setCookies({ avila_sso: ssoToken({ email: DIRECTOR_B }), erp_tenant: A });
  assert.equal((await get(ORDER)).status, 404);

  signIn(EMAILS.DIRETORIA);
  for (const number of ["000000-ZZZZ", "abc", "261006-rtaa", `${ORDER}'--`, "261006-RTAA/..", ""]) {
    const response = await get(number);
    assert.equal(response.status, 404, number);
    assert.doesNotMatch(await response.text(), /%PDF/);
  }
});

test("pedido sem item: 409 com a mensagem para a tela", { skip }, async () => {
  signIn(EMAILS.VENDEDOR);
  const response = await get(EMPTY);
  assert.equal(response.status, 409);
  assert.equal(await response.text(), "Inclua ao menos um equipamento para gerar o orçamento.");
});

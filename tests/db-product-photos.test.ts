import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { deleteProductPhoto, loadProductPhoto, saveProductPhoto } from "@/lib/db/product-photos";
import { createProduct, deleteProduct, findProductByCode, listProducts, ProductError, updateProductText } from "@/lib/db/products";
import { normalizePhoto, PhotoError } from "@/lib/photos/normalize";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "diretoria@teste.local";
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("photos");
});
after(async () => {
  if (!skip) await db.close();
});

const image = (color: string) => sharp({ create: { width: 1600, height: 800, channels: 3, background: color } }).jpeg().toBuffer();
const count = async () => Number((await db.pool.query("SELECT count(*) FROM product_photos")).rows[0].count);

test("foto: gravar e reler devolve os bytes normalizados; repetir a imagem não muda nada", { skip }, async () => {
  const product = await createProduct({ name: "Mesa Flexora", code: "LD-B001" }, WHO, db.pool);
  const input = await image("#336699");
  const expected = await normalizePhoto(input);

  assert.deepEqual(await saveProductPhoto(product.id, input, WHO, db.pool), { sha256: expected.sha256, changed: true });
  const stored = await loadProductPhoto(product.id, db.pool);
  assert.ok(stored);
  assert.ok(stored.bytes.equals(expected.bytes));
  assert.deepEqual([stored.mimeType, stored.sha256], ["image/jpeg", expected.sha256]);
  const row = (await db.pool.query("SELECT width, height, updated_by FROM product_photos WHERE product_id = $1", [product.id])).rows[0];
  assert.deepEqual(row, { width: 1200, height: 600, updated_by: WHO });

  // A mesma imagem de novo: nem a data muda.
  assert.deepEqual(await saveProductPhoto(product.id, input, "outra@teste.local", db.pool), { sha256: expected.sha256, changed: false });
  const again = await loadProductPhoto(product.id, db.pool);
  assert.equal(again?.updatedAt.getTime(), stored.updatedAt.getTime());
  assert.equal(await count(), 1);

  // Outra imagem troca a foto: continua uma por equipamento.
  const other = await saveProductPhoto(product.id, await image("#cc3300"), WHO, db.pool);
  assert.equal(other.changed, true);
  assert.notEqual(other.sha256, expected.sha256);
  assert.equal(await count(), 1);
  assert.equal((await loadProductPhoto(product.id, db.pool))?.sha256, other.sha256);
});

test("foto: produto inexistente e imagem recusada dão erro próprio", { skip }, async () => {
  const before = await count();
  const black = await image("#000000");
  await assert.rejects(() => saveProductPhoto(999_999, black, WHO, db.pool), (error: unknown) => {
    return error instanceof ProductError && error.message === "Produto não encontrado.";
  });
  await assert.rejects(() => saveProductPhoto(0, black, WHO, db.pool), ProductError);
  const product = await createProduct({ name: "Sem foto" }, WHO, db.pool);
  await assert.rejects(() => saveProductPhoto(product.id, Buffer.from("<svg/>"), WHO, db.pool), PhotoError);
  assert.equal(await count(), before);
  assert.equal(await loadProductPhoto(product.id, db.pool), null);
  assert.equal(await loadProductPhoto(999_999, db.pool), null);
});

test("foto: excluir a foto; excluir o produto pela camada leva a foto junto, sem cascata no banco", { skip }, async () => {
  const product = await createProduct({ name: "Banco Supino", code: "LD-B010" }, WHO, db.pool);
  await saveProductPhoto(product.id, await image("#00aa55"), WHO, db.pool);
  assert.equal(await deleteProductPhoto(product.id, db.pool), true);
  assert.equal(await deleteProductPhoto(product.id, db.pool), false);
  assert.equal(await loadProductPhoto(product.id, db.pool), null);

  await saveProductPhoto(product.id, await image("#00aa55"), WHO, db.pool);
  const before = await count();
  // Nenhuma chave estrangeira do banco apaga em cascata: por SQL direto, a foto segura o equipamento.
  await assert.rejects(
    () => db.pool.query("DELETE FROM products WHERE id = $1", [product.id]),
    (error: unknown) => (error as { code?: string }).code === "23503",
  );
  assert.equal(await count(), before);

  assert.equal((await deleteProduct(product.id, db.pool)).hasPhoto, true);
  assert.equal(await count(), before - 1);
  assert.equal(await findProductByCode("LD-B010", db.pool), null);
});

test("foto: equipamento com histórico não é excluído, e a foto dele fica", { skip }, async () => {
  const product = await createProduct({ name: "Com histórico e foto", code: "LD-B011" }, WHO, db.pool);
  const { sha256 } = await saveProductPhoto(product.id, await image("#aa5500"), WHO, db.pool);
  await db.pool.query("CREATE TABLE photo_test_refs (product_id integer NOT NULL REFERENCES products (id))");
  await db.pool.query("INSERT INTO photo_test_refs VALUES ($1)", [product.id]);

  await assert.rejects(() => deleteProduct(product.id, db.pool), /já tem histórico e não pode ser excluído\. Desative-o\./);
  assert.equal((await loadProductPhoto(product.id, db.pool))?.sha256, sha256);
  await db.pool.query("DROP TABLE photo_test_refs");
});

test("foto: o banco recusa o que não é JPEG normalizado", { skip }, async () => {
  const product = await createProduct({ name: "Direto no banco" }, WHO, db.pool);
  const insert = (mime: string, width: number, sha: string) =>
    db.pool.query(
      "INSERT INTO product_photos (product_id, mime_type, bytes, width, height, sha256, updated_by) VALUES ($1, $2, $3, $4, 10, $5, $6)",
      [product.id, mime, Buffer.from("<svg/>"), width, sha, WHO],
    );
  const check = (error: unknown) => (error as { code?: string }).code === "23514";
  await assert.rejects(() => insert("image/svg+xml", 10, "a".repeat(64)), check);
  await assert.rejects(() => insert("image/jpeg", 1201, "a".repeat(64)), check);
  await assert.rejects(() => insert("image/jpeg", 10, "não é hash"), check);
});

test("produto: descrição, hasPhoto e busca pelo código", { skip }, async () => {
  const withPhoto = await createProduct({ name: "Com foto", code: "LD-F001", description: "  Estrutura em aço.  " }, WHO, db.pool);
  const without = await createProduct({ name: "Sem foto nem descrição", code: "ld-f002", description: " " }, WHO, db.pool);
  assert.deepEqual([withPhoto.description, withPhoto.hasPhoto], ["Estrutura em aço.", false]);
  assert.equal(without.description, null);
  await saveProductPhoto(withPhoto.id, await image("#123123"), WHO, db.pool);

  const listed = await listProducts({}, db.pool);
  assert.equal(listed.find((product) => product.id === withPhoto.id)?.hasPhoto, true);
  assert.equal(listed.find((product) => product.id === without.id)?.hasPhoto, false);
  // A listagem nunca traz os bytes.
  assert.ok(listed.every((product) => !("bytes" in product)));

  assert.equal((await findProductByCode(" ld-f001 ", db.pool))?.id, withPhoto.id);
  assert.equal((await findProductByCode("LD-F002", db.pool))?.id, without.id);
  assert.equal((await findProductByCode("LD-F001", db.pool))?.hasPhoto, true);
  assert.equal(await findProductByCode("LD-F999", db.pool), null);
  assert.equal(await findProductByCode("  ", db.pool), null);
});

test("updateProductText não mexe em custo, crédito, embalagem, código nem active", { skip }, async () => {
  const product = await createProduct(
    { name: "Leg Press", code: "LD-L001", advisoryCost: 8146.64, taxCredit: 0.2811565, packaging: 150, active: false },
    WHO,
    db.pool,
  );
  const updated = await updateProductText(
    product.id,
    { name: "Leg Press 45", description: "Carga máxima 400 kg.", supplierName: "Fábrica A", supplierModel: "LP-45", supplierPriceUsd: 1234.56 },
    "carga",
    db.pool,
  );
  assert.deepEqual(
    [updated.advisoryCost, updated.taxCredit, updated.packaging, updated.active, updated.code],
    [product.advisoryCost, product.taxCredit, product.packaging, product.active, product.code],
  );
  assert.deepEqual([updated.advisoryCost, updated.taxCredit, updated.packaging, updated.active], [8146.64, 0.2811565, 150, false]);
  assert.deepEqual(
    [updated.name, updated.description, updated.supplierName, updated.supplierModel, updated.supplierPriceUsd],
    ["Leg Press 45", "Carga máxima 400 kg.", "Fábrica A", "LP-45", 1234.56],
  );
  const row = (await db.pool.query("SELECT updated_by FROM products WHERE id = $1", [product.id])).rows[0];
  assert.equal(row.updated_by, "carga");

  await assert.rejects(
    () => updateProductText(product.id, { name: " ", description: null, supplierName: null, supplierModel: null, supplierPriceUsd: null }, WHO, db.pool),
    /sem nome/,
  );
  await assert.rejects(
    () => updateProductText(999_999, { name: "X", description: null, supplierName: null, supplierModel: null, supplierPriceUsd: null }, WHO, db.pool),
    /Produto não encontrado/,
  );
});

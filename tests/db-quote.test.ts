import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { loadProductPhoto, saveProductPhoto } from "@/lib/db/product-photos";
import { createProduct } from "@/lib/db/products";
import { loadQuoteProducts } from "@/lib/db/quote";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "diretoria@teste.local";
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("quote");
});
after(async () => {
  if (!skip) await db.close();
});

test("orçamento: descrição e foto de cada equipamento pedido, e só deles", { skip }, async () => {
  const full = await createProduct({ name: "Com foto e descrição", code: "LD-Q001", description: "Carga de 400 kg." }, WHO, db.pool);
  const described = await createProduct({ name: "Só descrição", code: "LD-Q002", description: "Estofado preto." }, WHO, db.pool);
  const bare = await createProduct({ name: "Sem nada", code: "LD-Q003", advisoryCost: 1234.56 }, WHO, db.pool);
  const other = await createProduct({ name: "Não pedido", code: "LD-Q004", description: "Fora." }, WHO, db.pool);
  await saveProductPhoto(full.id, await sharp({ create: { width: 300, height: 200, channels: 3, background: "#336699" } }).png().toBuffer(), WHO, db.pool);
  const stored = await loadProductPhoto(full.id, db.pool);
  assert.ok(stored);

  const products = await loadQuoteProducts([full.id, described.id, bare.id, 999_999, full.id], db.pool);
  assert.deepEqual([...products.keys()].sort((a, b) => a - b), [full.id, described.id, bare.id]);
  assert.ok(!products.has(other.id) && !products.has(999_999));

  // A descrição comercial não vai mais para a proposta: no lugar dela, as medidas do equipamento, quando cadastradas.
  assert.equal(products.get(full.id)?.description, null);
  const { saveProductMeasures, loadProductMeasures } = await import("@/lib/db/products");
  assert.deepEqual(await loadProductMeasures(full.id, db.pool), { lengthMm: null, widthMm: null, heightMm: null, weightKg: null });
  await assert.rejects(() => saveProductMeasures(full.id, { lengthMm: 0, widthMm: null, heightMm: null, weightKg: null }, WHO, db.pool), /Comprimento: informe em milímetros/);
  await assert.rejects(() => saveProductMeasures(full.id, { lengthMm: null, widthMm: null, heightMm: null, weightKg: Number.NaN }, WHO, db.pool), /Peso: informe em quilos/);
  await saveProductMeasures(full.id, { lengthMm: 1650, widthMm: 1200, heightMm: 1400, weightKg: 182.5 }, WHO, db.pool);
  await saveProductMeasures(described.id, { lengthMm: null, widthMm: null, heightMm: null, weightKg: 95 }, WHO, db.pool);
  const measured = await loadQuoteProducts([full.id, described.id, bare.id], db.pool);
  assert.equal(measured.get(full.id)?.description, "Dimensões (C x L x A): 1,65 x 1,20 x 1,40 m · Peso: 182,5 kg");
  assert.ok(Buffer.from(measured.get(full.id)?.photo ?? []).equals(stored.bytes));
  assert.deepEqual(measured.get(described.id), { description: "Peso: 95 kg", photo: null });
  assert.deepEqual(products.get(bare.id), { description: null, photo: null });
  // Só a linha de medidas e a foto: nenhum campo de custo sai daqui.
  for (const product of products.values()) assert.deepEqual(Object.keys(product), ["description", "photo"]);
});

test("orçamento: lista vazia ou sem id válido não vai ao banco", { skip }, async () => {
  const never = {
    query: () => {
      throw new Error("não era para consultar o banco");
    },
  };
  assert.equal((await loadQuoteProducts([], never)).size, 0);
  assert.equal((await loadQuoteProducts([0, -1, 1.5, Number.NaN, 2 ** 40], never)).size, 0);
});

test("orçamento: a consulta não lê custo, crédito nem embalagem", () => {
  const code = readFileSync(new URL("../src/lib/db/quote.ts", import.meta.url), "utf8");
  assert.doesNotMatch(code, /advisory_cost|tax_credit|packaging|supplier_|SELECT \*/i);
  assert.equal(code.split("conn.query(").length - 1, 1, "uma consulta só");
});

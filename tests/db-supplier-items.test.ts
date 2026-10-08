import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { createProduct } from "@/lib/db/products";
import { listSupplierItems, listSupplierItemsOf, loadSupplierItemPhoto, upsertSupplierItem } from "@/lib/db/supplier-items";
import type { SupplierItemInput } from "@/lib/db/supplier-items";
import { readSupplierCatalog, runSupplierCatalogImport } from "@/lib/import/supplier-catalog";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "diretoria@teste.local";
let db: TestDb;
let png: Buffer;

before(async () => {
  png = await sharp({ create: { width: 60, height: 40, channels: 3, background: { r: 10, g: 80, b: 200 } } }).png().toBuffer();
  if (!skip) db = await openTestDb("supplier");
});
after(async () => {
  if (!skip) await db.close();
});

const ITEM: SupplierItemInput = {
  supplier: "DHZ Fitness", catalog: "HammerForce Pro", line: "Plate Loaded", code: "SM-2001", name: "Glute Ham - Reverse Hyper", description: "Hip extension.",
  lengthMm: 1910, widthMm: 1610, heightMm: 1320, weightKg: 193, loadType: "Anilhas", productCode: "LD-A001",
};

test("catálogo do fornecedor: grava com foto normalizada, liga pelo código ao equipamento e regravar altera sem duplicar", { skip }, async () => {
  const first = await upsertSupplierItem(ITEM, png, WHO, db.pool);
  assert.equal(first.created, true);
  // O equipamento da empresa ainda não existe: o vínculo é pelo código e aparece quando ele chegar.
  let [item] = await listSupplierItems(db.pool);
  assert.deepEqual([item.code, item.hasPhoto, item.productCode, item.productId, item.weightKg, item.lengthMm], ["SM-2001", true, "LD-A001", null, 193, 1910]);
  const product = await createProduct({ name: "Hiperextensão de Glúteos", code: "LD-A001" }, WHO, db.pool);
  [item] = await listSupplierItems(db.pool);
  assert.deepEqual([item.productId, item.productName], [product.id, "Hiperextensão de Glúteos"]);
  assert.deepEqual((await listSupplierItemsOf("LD-A001", db.pool)).map((entry) => entry.code), ["SM-2001"]);
  assert.deepEqual(await listSupplierItemsOf(null, db.pool), []);

  const photo = await loadSupplierItemPhoto(first.id, db.pool);
  assert.ok(photo);
  assert.deepEqual([photo.bytes.subarray(0, 3).toString("hex"), /^[0-9a-f]{64}$/.test(photo.sha256)], ["ffd8ff", true]);
  assert.equal(await loadSupplierItemPhoto(999999, db.pool), null);

  // De novo, sem foto: muda o texto e a foto que já estava fica.
  const again = await upsertSupplierItem({ ...ITEM, name: "Glute Ham / Reverse Hyper", weightKg: 195 }, null, WHO, db.pool);
  assert.deepEqual([again.id, again.created], [first.id, false]);
  [item] = await listSupplierItems(db.pool);
  assert.deepEqual([item.name, item.weightKg, item.hasPhoto], ["Glute Ham / Reverse Hyper", 195, true]);
  // O mesmo código em outro catálogo do fornecedor é outro item.
  assert.equal((await upsertSupplierItem({ ...ITEM, catalog: "Hammer S-FORCE" }, null, WHO, db.pool)).created, true);
  assert.equal((await listSupplierItems(db.pool)).length, 2);
  await assert.rejects(() => upsertSupplierItem({ ...ITEM, code: " " }, null, WHO, db.pool), /sem código/);
  await assert.rejects(() => upsertSupplierItem(ITEM, Buffer.from("não é imagem"), WHO, db.pool), /Formato de imagem não aceito/);
});

test("carga do catálogo: confere antes, não grava sem --apply, e foto que falta ou caminho torto impedem tudo", { skip }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "catalogo-"));
  mkdirSync(path.join(dir, "fotos", "Cable Motion"), { recursive: true });
  writeFileSync(path.join(dir, "fotos", "Cable Motion", "Crossover E7016.png"), png);
  const entry = (over: object) => ({
    fornecedor: "DHZ Fitness", catalogo: "Cable Motion", linha: "Cable Motion", codigo: "E7016", nome: "Cable Crossover", descricao_en: "Cables.",
    dimensoes_mm: { comprimento: 4000, largura: 800, altura: 2300 }, peso_kg: 320, foto: "Fotos Equipamentos DHZ/Cable Motion/Crossover E7016.png", ludus: { codigo: "LD-B038" }, ...over,
  });
  const write = (name: string, list: object[]) => {
    const file = path.join(dir, name);
    writeFileSync(file, JSON.stringify({ equipamentos: list }));
    return file;
  };
  const good = write("bom.json", [entry({}), entry({ codigo: "U2016", nome: "Cable Crossover U", foto: undefined, ludus: null })]);
  const photos = path.join(dir, "fotos");
  const before = (await listSupplierItems(db.pool)).length;

  assert.deepEqual((await readSupplierCatalog(good, photos)).errors, []);
  const dry = await runSupplierCatalogImport(good, photos, { apply: false, who: WHO }, db.pool);
  assert.deepEqual([dry.exitCode, dry.lines[1]], [0, "itens=2 com_foto=1 com_equipamento_da_empresa=1"]);
  assert.equal((await listSupplierItems(db.pool)).length, before);

  for (const [name, list, message] of [
    ["sem-foto.json", [entry({ foto: "x/Cable Motion/Nao Existe.png" })], /foto não encontrada/],
    ["fora.json", [entry({ foto: "../../etc/passwd" })], /caminho de foto inválido|foto não encontrada/],
    ["repetido.json", [entry({}), entry({})], /repetido no catálogo/],
    ["incompleto.json", [entry({ nome: "" })], /falta fornecedor, catálogo, código ou nome/],
    ["vazio.json", [], /não traz nenhum equipamento/],
  ] as const) {
    const result = await runSupplierCatalogImport(write(name, [...list]), photos, { apply: true, who: WHO }, db.pool);
    assert.equal(result.exitCode, 1, name);
    assert.match(result.lines.join(" "), message, name);
  }
  assert.equal((await listSupplierItems(db.pool)).length, before);

  const client = await db.pool.connect();
  try {
    const done = await runSupplierCatalogImport(good, photos, { apply: true, who: WHO }, client);
    assert.deepEqual([done.exitCode, done.lines[0]], [0, "itens=2 com_foto=1 com_equipamento_da_empresa=1 criados=2 atualizados=0"]);
    // De novo: nada novo, só atualiza.
    assert.match((await runSupplierCatalogImport(good, photos, { apply: true, who: WHO }, client)).lines[0], /criados=0 atualizados=2/);
  } finally {
    client.release();
  }
  const loaded = (await listSupplierItems(db.pool)).filter((item) => item.catalog === "Cable Motion");
  assert.deepEqual(loaded.map((item) => [item.code, item.hasPhoto, item.productCode]), [["E7016", true, "LD-B038"], ["U2016", false, null]]);
});

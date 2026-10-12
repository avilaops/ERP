import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { loadPixSettings, PixError, removePixSettings, savePixSettings } from "@/lib/db/pix";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "diretoria@teste.local";
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("pix");
});
after(async () => {
  if (!skip) await db.close();
});

test("chave PIX da empresa: nasce vazia, grava como o banco espera, e sai inteira", { skip }, async () => {
  assert.equal(await loadPixSettings(db.pool), null);
  await assert.rejects(() => savePixSettings({ key: "não é chave", name: "Ludus", city: "Votuporanga" }, WHO, db.pool), (error: Error) => error instanceof PixError && /Chave PIX/.test(error.message));
  await assert.rejects(() => savePixSettings({ key: "66.058.955/0001-08", name: " ", city: "Votuporanga" }, WHO, db.pool), /nome de quem recebe/);
  await assert.rejects(() => savePixSettings({ key: "66.058.955/0001-08", name: "Ludus", city: "" }, WHO, db.pool), /cidade da conta/);
  assert.equal(await loadPixSettings(db.pool), null);

  const saved = await savePixSettings({ key: "66.058.955/0001-08", name: "Ludus Equipamentos para Musculação Ltda", city: "São José do Rio Preto" }, WHO, db.pool);
  assert.deepEqual(saved, { key: "66058955000108", name: "Ludus Equipamentos para M", city: "Sao Jose do Rio" });
  assert.deepEqual(await loadPixSettings(db.pool), saved);
  await removePixSettings(WHO, db.pool);
  assert.equal(await loadPixSettings(db.pool), null);
});

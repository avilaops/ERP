import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { CarrierError, createCarrier, deleteCarrier, listCarriers, loadOrderTransport, updateCarrier } from "@/lib/db/carriers";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "diretoria@teste.local";
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("carriers");
});
after(async () => {
  if (!skip) await db.close();
});

const BASE = { document: "11.222.333/0001-81", name: "  Transportes   Rápidos Ltda ", stateRegistration: "110.042.490.114", address: "Rod. BR-153, km 50", city: "São José do Rio Preto", uf: "sp" };

test("transportadoras: adicionar, editar e remover; documento e inscrição ficam sem pontuação", { skip }, async () => {
  const carrier = await createCarrier(BASE, WHO, db.pool);
  assert.deepEqual([carrier.kind, carrier.document, carrier.name, carrier.stateRegistration, carrier.uf], ["PJ", "11222333000181", "Transportes Rápidos Ltda", "110042490114", "SP"]);
  const person = await createCarrier({ document: "529.982.247-25", name: "João Carreteiro", stateRegistration: null, address: null, city: null, uf: null }, WHO, db.pool);
  assert.deepEqual([person.kind, person.stateRegistration, person.uf], ["PF", null, null]);
  assert.deepEqual((await listCarriers(db.pool)).map((item) => item.name), ["João Carreteiro", "Transportes Rápidos Ltda"]);

  const changed = await updateCarrier(carrier.id, { ...BASE, name: "Transportes Rápidos S.A.", stateRegistration: "isento" }, WHO, db.pool);
  assert.deepEqual([changed.name, changed.stateRegistration], ["Transportes Rápidos S.A.", "ISENTO"]);
  await deleteCarrier(person.id, db.pool);
  assert.equal((await listCarriers(db.pool)).length, 1);
  await assert.rejects(() => deleteCarrier(person.id, db.pool), /não encontrada/);
});

test("transportadoras: o que a nota rejeitaria é recusado aqui — documento inválido, repetido e inscrição sem UF", { skip }, async () => {
  await assert.rejects(() => createCarrier({ ...BASE, document: "11.222.333/0001-80" }, WHO, db.pool), /inválido/);
  await assert.rejects(() => createCarrier({ ...BASE, document: "111.111.111-11" }, WHO, db.pool), /inválido/);
  await assert.rejects(() => createCarrier(BASE, WHO, db.pool), /Já existe/);
  await assert.rejects(() => createCarrier({ ...BASE, document: "529.982.247-25", uf: null }, WHO, db.pool), /informe a UF/);
  await assert.rejects(() => createCarrier({ ...BASE, document: "529.982.247-25", uf: "XX" }, WHO, db.pool), CarrierError);
  await assert.rejects(() => createCarrier({ ...BASE, document: "529.982.247-25", name: "A" }, WHO, db.pool), /2 a 60/);
  assert.equal((await listCarriers(db.pool)).length, 1);
});

test("pedido sem transporte informado: tudo em branco, nada inventado", { skip }, async () => {
  assert.deepEqual(await loadOrderTransport(999, db.pool), { carrier: null, volumes: null, volumeKind: null, netWeight: null, grossWeight: null });
});

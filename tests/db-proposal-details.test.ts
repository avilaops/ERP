import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { loadProposalDetails, saveProposalDetails } from "@/lib/db/proposal-details";
import { createOrder, getOrder } from "@/lib/db/orders";
import { createContract } from "@/lib/db/contracts";
import { loadParams } from "@/lib/db/params";
import { publishPriceTable } from "@/lib/db/price-table";
import { createProduct, listProducts } from "@/lib/db/products";
import { draftPriceTable } from "@/lib/price-table";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const actor = "diretoria@teste.local";
let db: TestDb;
let orderId: number;
const number = "261017-Q001";
before(async () => {
  if (skip) return;
  db = await openTestDb("proposal_details");
  const product = await createProduct({ name: "Equipamento de teste", code: "LD-Q900", advisoryCost: 1000 }, actor, db.pool);
  await publishPriceTable(draftPriceTable(await loadParams(db.pool), await listProducts({ active: true }, db.pool)), 1, actor, db.pool);
  await createOrder({ seller: { email: actor, name: "Diretoria de teste" }, version: 1, productId: product.id, quantity: 1 }, () => number, db.pool);
  orderId = (await getOrder(number, { sellerEmail: null }, db.pool))!.id;
});
after(async () => { if (!skip) await db.close(); });

test("padrão da empresa: passos preservam outros campos e revisão antiga não sobrescreve", { skip }, async () => {
  await saveProposalDetails({ actor, revision: "0", fields: ["email"], values: { email: "comercial@example.com" } }, db.pool);
  await assert.rejects(() => saveProposalDetails({ actor, revision: "0", fields: ["warranty"], values: { warranty: "Dado antigo" } }, db.pool), /outra tela/);
  await saveProposalDetails({ actor, revision: "1", fields: ["warranty"], values: { warranty: "Termo de garantia fictício" } }, db.pool);
  assert.deepEqual((await loadProposalDetails(db.pool)).details, { email: "comercial@example.com", warranty: "Termo de garantia fictício" });
});

test("condição do pedido: não altera dinheiro nem revisão comercial; vazio volta a herdar; revisão concorrente falha", { skip }, async () => {
  const before = await getOrder(number, { sellerEmail: null }, db.pool);
  await saveProposalDetails({ actor, orderId, revision: "0", fields: ["warranty"], values: { warranty: "Garantia específica fictícia" } }, db.pool);
  const after = await getOrder(number, { sellerEmail: null }, db.pool);
  assert.deepEqual(after, before);
  assert.equal((await loadProposalDetails(db.pool)).details.warranty, "Termo de garantia fictício");
  await assert.rejects(() => saveProposalDetails({ actor, orderId, revision: "0", fields: ["warranty"], values: {} }, db.pool), /outra tela/);
  await saveProposalDetails({ actor, orderId, revision: "1", fields: ["warranty"], values: {} }, db.pool);
  assert.deepEqual((await loadProposalDetails(db.pool, orderId)).details, {});
});

test("documento emitido: contrato já enviado bloqueia alterações sem modificar o PDF guardado", { skip }, async () => {
  const pdf = Buffer.alloc(120, 1);
  const contract = await createContract({ orderId, sequence: 1, title: "Contrato de teste", body: "Texto preservado", pdf, sha256: "a".repeat(64), tokenHash: "b".repeat(64), expiresAt: new Date("2099-01-01"), recipientName: "Cliente de teste", recipientEmail: "cliente@example.com", createdBy: actor }, db.pool);
  const frozen = await loadProposalDetails(db.pool, orderId);
  await assert.rejects(() => saveProposalDetails({ actor, orderId, revision: frozen.revision, fields: ["installation"], values: { installation: "Inclusa" } }, db.pool), /contrato\/nota emitidos/);
  assert.equal(frozen.details.warranty,"Termo de garantia fictício");
  await saveProposalDetails({actor,revision:(await loadProposalDetails(db.pool)).revision,fields:["warranty","installation"],values:{warranty:"Novo padrão",installation:"Novo serviço"}},db.pool);
  assert.deepEqual((await loadProposalDetails(db.pool, orderId)).details,frozen.details);
  assert.deepEqual((await db.pool.query("SELECT pdf FROM order_contracts WHERE id = $1", [contract.id])).rows[0].pdf, pdf);
});

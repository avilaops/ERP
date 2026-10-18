import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { distributionStanding, saveDistributionBatch } from "@/lib/db/nfe-distribution";
import { listRecipientManifestations, queueRecipientManifestation } from "@/lib/db/recipient-manifestations";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

let db: TestDb;
before(async () => { if (!SKIP_WITHOUT_DB) db = await openTestDb("nfe_distribution"); });
after(async () => { if (!SKIP_WITHOUT_DB) await db.close(); });

test("lote é persistido antes do cursor, repetição é idempotente e conflito não avança", { skip: SKIP_WITHOUT_DB }, async () => {
  const now = new Date("2026-10-18T15:00:00Z");
  const batch = { code: "138", reason: "Documentos localizados", lastNsu: "000000000000002", maxNsu: "000000000000003", documents: [{ nsu: "000000000000002", schema: "resNFe_v1.01.xsd", kind: "summary" as const, xml: "<resNFe><chNFe>1</chNFe></resNFe>" }] };
  await saveDistributionBatch(batch, now, db.pool);
  await saveDistributionBatch(batch, now, db.pool);
  const state = await distributionStanding(db.pool);
  assert.deepEqual([state.lastNsu, state.maxNsu, state.summaries], [batch.lastNsu, batch.maxNsu, 1]);
  await assert.rejects(() => saveDistributionBatch({ ...batch, lastNsu: "000000000000003", documents: [{ ...batch.documents[0], xml: "<resNFe><chNFe>2</chNFe></resNFe>" }] }, now, db.pool), /conteúdo diferente/);
  assert.equal((await distributionStanding(db.pool)).lastNsu, batch.lastNsu);
});

test("consumo indevido 656 preserva cursores e impõe uma hora de espera", { skip: SKIP_WITHOUT_DB }, async () => {
  const initial = new Date("2026-10-18T16:00:00Z");
  await saveDistributionBatch({ code: "138", reason: "Documentos localizados", lastNsu: "000000000000010", maxNsu: "000000000000012", documents: [] }, initial, db.pool);
  await saveDistributionBatch({ code: "656", reason: "Consumo indevido", lastNsu: "000000000000999", maxNsu: "000000000000999", documents: [] }, initial, db.pool);
  const state = await distributionStanding(db.pool);
  assert.deepEqual([state.lastNsu, state.maxNsu, state.lastCode], ["000000000000010", "000000000000012", "656"]);
  assert.equal(state.nextQueryAt.toISOString(), "2026-10-18T17:00:00.000Z");
});

test("manifestação só nasce por ação explícita e clique repetido não duplica", { skip: SKIP_WITHOUT_DB }, async () => {
  const { rows } = await db.pool.query<{ id: string }>(`INSERT INTO fiscal_received_nfes
    (access_key,xml_sha256,xml,protocol,status_code,issuer_document,issuer_name,recipient_document,number,series,issued_at,total_products,total_invoice,total_freight,total_insurance,total_other,total_discount,total_icms,total_icms_st,total_ipi,total_import_tax,total_pis,total_cofins,imported_by)
    VALUES ($1,$2,'<nfeProc/>','135260000000123','100','60677380000106','Fornecedor','60067738000106',1,1,now(),100,100,0,0,0,0,0,0,0,0,0,0,'teste') RETURNING id`,
    ["35261060677380000106550010000001231000001230", "a".repeat(64)]);
  const nfeId = Number(rows[0].id);
  const first = await queueRecipientManifestation(nfeId, "ciencia", null, "diretoria@teste.local", db.pool);
  assert.equal(await queueRecipientManifestation(nfeId, "ciencia", null, "diretoria@teste.local", db.pool), first);
  assert.equal((await listRecipientManifestations(nfeId, db.pool)).length, 1);
  await assert.rejects(() => queueRecipientManifestation(nfeId, "nao_realizada", "curto", "diretoria@teste.local", db.pool), /15 a 255/);
});

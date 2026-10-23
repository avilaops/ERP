import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { distributionStanding, listNfeSummaries, processDistributedDocuments, saveDistributionBatch } from "@/lib/db/nfe-distribution";
import { listRecipientManifestations, queueRecipientManifestation, queueSummaryManifestation, runOneRecipientManifestation } from "@/lib/db/recipient-manifestations";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";
import { confirmReceivedNfePurchase } from "@/lib/db/received-nfes";

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

test("resumo fica pendente e pode receber ciência sem fingir que é XML completo", { skip: SKIP_WITHOUT_DB }, async () => {
  const key = "35261060677380000106550010000001231000009999";
  const nsu = "000000000000099";
  const xml = `<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><chNFe>${key}</chNFe><CNPJ>60677380000106</CNPJ><xNome>Fornecedor Resumo Ltda</xNome><IE>116810452119</IE><dhEmi>2026-10-18T12:00:00-03:00</dhEmi><tpNF>1</tpNF><vNF>1935.99</vNF><digVal>abc=</digVal><dhRecbto>2026-10-18T12:05:00-03:00</dhRecbto><nProt>135260000000999</nProt><cSitNFe>1</cSitNFe></resNFe>`;
  await db.pool.query("UPDATE fiscal_distributed_documents SET processed_at=now() WHERE processed_at IS NULL");
  await saveDistributionBatch({ code: "138", reason: "Documentos localizados", lastNsu: nsu, maxNsu: nsu, documents: [{ nsu, schema: "resNFe_v1.01.xsd", kind: "summary", xml }] }, new Date("2026-10-18T15:05:00Z"), db.pool);
  const processed = await processDistributedDocuments("60067738000106", db.pool);
  if (processed.failed) assert.fail(String((await db.pool.query("SELECT process_error FROM fiscal_distributed_documents WHERE nsu=$1", [nsu])).rows[0].process_error));
  assert.deepEqual(processed, { imported: 0, failed: 0 });
  assert.deepEqual((await listNfeSummaries(db.pool)).map((item) => [item.nsu, item.accessKey, item.issuerName, item.totalInvoice, item.fullNfeId]), [[nsu, key, "Fornecedor Resumo Ltda", 1935.99, null]]);
  const first = await queueSummaryManifestation(nsu, "ciencia", null, "diretoria@teste.local", db.pool);
  assert.equal(await queueSummaryManifestation(nsu, "ciencia", null, "diretoria@teste.local", db.pool), first);
  const stored = await db.pool.query("SELECT access_key,summary_nsu,nfe_id FROM fiscal_recipient_manifestations WHERE id=$1", [first]);
  assert.deepEqual(stored.rows[0], { access_key: key, summary_nsu: nsu, nfe_id: null });
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

test("manifestação interrompida expira para revisão manual sem retransmissão", { skip: SKIP_WITHOUT_DB }, async () => {
  const { rows } = await db.pool.query<{ id: string }>(`INSERT INTO fiscal_received_nfes
    (access_key,xml_sha256,xml,protocol,status_code,issuer_document,issuer_name,recipient_document,number,series,issued_at,total_products,total_invoice,total_freight,total_insurance,total_other,total_discount,total_icms,total_icms_st,total_ipi,total_import_tax,total_pis,total_cofins,imported_by)
    VALUES ($1,$2,'<nfeProc/>','135260000000124','100','60677380000106','Fornecedor','60067738000106',2,1,now(),100,100,0,0,0,0,0,0,0,0,0,0,'teste') RETURNING id`,
    ["35261060677380000106550010000001231000001231", "b".repeat(64)]);
  const id = await queueRecipientManifestation(Number(rows[0].id), "ciencia", null, "diretoria@teste.local", db.pool);
  await db.pool.query("UPDATE fiscal_recipient_manifestations SET status='processing',processing_started_at='2026-10-18T10:00:00Z' WHERE id=$1", [id]);
  let sends = 0;
  assert.equal(await runOneRecipientManifestation(new Date("2026-10-18T11:00:00Z"), () => Buffer.alloc(32), async () => { sends += 1; return ""; }, db.pool), false);
  assert.equal(sends, 0);
  assert.equal((await db.pool.query("SELECT status FROM fiscal_recipient_manifestations WHERE id=$1", [id])).rows[0].status, "manual_review");
});

test("cancelamento distribuído bloqueia efeitos operacionais e preserva o evento", { skip: SKIP_WITHOUT_DB }, async () => {
  const key = "35261060677380000106550010000001231000008888";
  const { rows } = await db.pool.query<{ id: string }>(`INSERT INTO fiscal_received_nfes
    (access_key,xml_sha256,xml,protocol,status_code,issuer_document,issuer_name,recipient_document,number,series,issued_at,total_products,total_invoice,total_freight,total_insurance,total_other,total_discount,total_icms,total_icms_st,total_ipi,total_import_tax,total_pis,total_cofins,imported_by)
    VALUES ($1,$2,'<nfeProc/>','135260000000888','100','60677380000106','Fornecedor','60067738000106',888,1,now(),100,100,0,0,0,0,0,0,0,0,0,0,'teste') RETURNING id`, [key, "c".repeat(64)]);
  const nsu = "000000000000100";
  const event = `<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><evento versao="1.00"><infEvento><tpAmb>1</tpAmb><chNFe>${key}</chNFe><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento></infEvento></evento><retEvento versao="1.00"><infEvento><tpAmb>1</tpAmb><cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo><chNFe>${key}</chNFe><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><dhRegEvento>2026-10-18T13:00:00-03:00</dhRegEvento><nProt>135260000000889</nProt></infEvento></retEvento></procEventoNFe>`;
  await saveDistributionBatch({ code: "138", reason: "Documentos localizados", lastNsu: nsu, maxNsu: nsu, documents: [{ nsu, schema: "procEventoNFe_v1.00.xsd", kind: "event", xml: event }] }, new Date("2026-10-18T16:00:00Z"), db.pool);
  assert.deepEqual(await processDistributedDocuments("60067738000106", db.pool), { imported: 0, failed: 0 });
  const note = (await db.pool.query("SELECT canceled_at,cancellation_protocol FROM fiscal_received_nfes WHERE id=$1", [rows[0].id])).rows[0];
  assert.deepEqual([note.canceled_at.toISOString(), note.cancellation_protocol], ["2026-10-18T16:00:00.000Z", "135260000000889"]);
  assert.equal(Number((await db.pool.query("SELECT count(*) FROM fiscal_received_nfe_events WHERE access_key=$1", [key])).rows[0].count), 1);
  await assert.rejects(() => confirmReceivedNfePurchase(Number(rows[0].id), "diretoria@teste.local", db.pool), /cancelada/i);
});

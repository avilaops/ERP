import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { cancelProspectLoad, listProspectLoads, loadProspectFilters, ProspectLoadError, requestProspectLoad, runProspectLoad, saveProspectFilters } from "@/lib/db/prospect-load";
import { convertProspect, listProspects } from "@/lib/db/prospects";
import { codeTable, companyOf, establishmentOf, fieldsOf, listMonths, RECEITA_SHARE, ReceitaError, zipLines } from "@/lib/prospect/receita";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;
before(async () => {
  if (!skip) db = await openTestDb("receita");
});
after(async () => {
  if (!skip) await db.close();
});

/** A zip of one file as the Receita publishes it: a local header, the data deflated, and the directory after. */
function zipOf(text: string, name = "arquivo.csv"): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(4, 28);
  return Buffer.concat([header, Buffer.from(name, "latin1"), Buffer.from([1, 2, 3, 4]), deflateRawSync(Buffer.from(text, "latin1")), Buffer.from("PK\u0001\u0002 diretório do zip, que não é para ler")]);
}
/** The bytes in small pieces, as a network delivers them. */
async function* pieces(data: Buffer, size = 7): AsyncGenerator<Uint8Array> {
  for (let at = 0; at < data.length; at += size) yield data.subarray(at, at + size);
}
const linesOf = async (data: Buffer, size?: number) => {
  const lines: string[] = [];
  for await (const line of zipLines(pieces(data, size))) lines.push(line);
  return lines;
};

const row = (fields: string[]) => fields.map((field) => `"${field.replace(/"/g, '""')}"`).join(";");
const establishment = (over: Partial<Record<number, string>> = {}) => {
  const fields = ["11222333", "0001", "81", "1", "FIT CLUB", "02", "20190311", "00", "", "", "20190311", "9313100", "", "RUA", "A", "10", "", "CENTRO", "15500000", "SP", "7265", "17", "99990000", "", "", "", "", "Contato@FitClub.test", "", ""];
  for (const [index, value] of Object.entries(over)) fields[Number(index)] = value!;
  return row(fields);
};

test("arquivos da Receita: o zip é lido em fluxo, em Latin-1, sem ler o que vem depois dos dados; e cada linha vira só os dados da empresa", async () => {
  const text = `${row(["0001", "SÃO JOSÉ DO RIO PRETO"])}\r\n${row(["0002", 'BAR "DO ZÉ"'])}\n${row(["0003", "SEM QUEBRA NO FIM"])}`;
  for (const size of [1, 7, 4096]) assert.deepEqual(await linesOf(zipOf(text), size), text.split(/\r?\n/));
  assert.deepEqual(fieldsOf(row(["a", 'b "c"', "", "d;e"])), ["a", 'b "c"', "", "d;e"]);
  assert.deepEqual([...(await codeTable(pieces(zipOf(text))))], [["0001", "SÃO JOSÉ DO RIO PRETO"], ["0002", 'BAR "DO ZÉ"'], ["0003", "SEM QUEBRA NO FIM"]]);
  await assert.rejects(() => linesOf(Buffer.from("isto não é um zip, é um texto qualquer bem comprido")), ReceitaError);
  const stored = zipOf("x");
  stored.writeUInt16LE(0, 8);
  await assert.rejects(() => linesOf(stored), /compactação que o ERP não lê/);

  const wanted = new Set(["9313100"]);
  assert.deepEqual(establishmentOf(establishment(), wanted, new Set()), {
    cnpj: "11222333000181", base: "11222333", tradeName: "FIT CLUB", cnae: "9313100", openedOn: "2019-03-11", street: "RUA A", number: "10", district: "CENTRO", cep: "15500000", uf: "SP", cityCode: "7265", phone: "1799990000", email: "contato@fitclub.test",
  });
  // Fora do recorte: baixada, outra atividade, outro estado. Dado torto vira vazio, não erro.
  assert.equal(establishmentOf(establishment({ 5: "08" }), wanted, new Set()), null);
  assert.equal(establishmentOf(establishment({ 11: "5611201" }), wanted, new Set()), null);
  assert.equal(establishmentOf(establishment({ 19: "RJ" }), wanted, new Set(["SP", "MG"])), null);
  assert.ok(establishmentOf(establishment({ 19: "MG" }), wanted, new Set(["SP", "MG"])));
  assert.equal(establishmentOf("linha;curta", wanted, new Set()), null);
  const odd = establishmentOf(establishment({ 4: "", 10: "00000000", 18: "123", 21: "", 22: "", 27: "sem arroba" }), wanted, new Set())!;
  assert.deepEqual([odd.tradeName, odd.openedOn, odd.cep, odd.phone, odd.email], [null, null, null, null, null]);
  // A razão social de firma individual vem com o CPF do dono no fim: ele sai.
  assert.deepEqual(companyOf(row(["11222333", "FIT CLUB ACADEMIA LTDA", "2062", "49", "10000,00", "01", ""])), { base: "11222333", legalName: "FIT CLUB ACADEMIA LTDA", size: "MICRO EMPRESA" });
  assert.equal(companyOf(row(["99888777", "MARIA DA SILVA 12345678901", "2135", "50", "0,00", "05", ""]))!.legalName, "MARIA DA SILVA");
  assert.equal(companyOf(row(["1", "", "", "", "", ""])), null);

  const months = await listMonths((async () => new Response('<d:href>/x/2026-08/</d:href><d:href>/x/2026-09/</d:href><d:href>/x/2023-05/</d:href><d:href>/x/2026-09/a.zip</d:href>', { status: 207 })) as typeof fetch);
  assert.deepEqual(months, ["2023-05", "2026-08", "2026-09"]);
  await assert.rejects(() => listMonths((async () => new Response("", { status: 500 })) as typeof fetch), ReceitaError);
});

test("carga da Receita: só o recorte entra, com razão social e cidade; continua de onde parou, não mexe em quem já virou oportunidade e pode ser cancelada", { skip }, async () => {
  const BOSS = "diretoria@empresa.test";
  // O recorte: códigos com ou sem pontuação, sem repetição; estado tem de existir.
  await assert.rejects(() => saveProspectFilters({ cnaes: "9313-1/00 abc 123", ufs: ["XX"] }, BOSS, db.pool), (error: unknown) => error instanceof ProspectLoadError && /Não entendi: abc, 123.*Estado inválido/.test(error.message));
  await assert.rejects(() => requestProspectLoad(BOSS, db.pool), /ao menos uma atividade/);
  assert.deepEqual(await saveProspectFilters({ cnaes: "9313-1/00\n9313100, 8650-0/04", ufs: ["sp", "MG", "SP"] }, BOSS, db.pool), { cnaes: ["9313100", "8650004"], ufs: ["MG", "SP"] });
  assert.deepEqual(await loadProspectFilters(db.pool), { cnaes: ["9313100", "8650004"], ufs: ["MG", "SP"] });

  const files: Record<string, string> = {
    "Municipios.zip": `${row(["7265", "VOTUPORANGA"])}\n${row(["4123", "BELO HORIZONTE"])}`,
    "Cnaes.zip": `${row(["9313100", "Atividades de condicionamento físico"])}\n${row(["8650004", "Atividades de fisioterapia"])}`,
    "Estabelecimentos0.zip": [establishment(), establishment({ 0: "22333444", 2: "95", 4: "", 19: "MG", 20: "4123", 11: "8650004", 27: "" }), establishment({ 0: "33444555", 19: "RJ" }), establishment({ 0: "44555666", 5: "08" }), establishment({ 0: "55666777", 11: "5611201" })].join("\n"),
    "Estabelecimentos3.zip": establishment({ 0: "66777888", 1: "0002", 2: "10", 4: "FIT CLUB FILIAL" }),
    "Empresas1.zip": [row(["11222333", "FIT CLUB ACADEMIA LTDA", "2062", "49", "1,00", "01", ""]), row(["33444555", "FORA DO RECORTE SA", "2062", "49", "1,00", "05", ""])].join("\n"),
    "Empresas4.zip": row(["22333444", "JOAO FISIO 12345678901", "2135", "50", "0,00", "01", ""]),
  };
  const asked: string[] = [];
  let failOn: string | null = null;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const address = String(url);
    if (init?.method === "PROPFIND") return new Response("<d:href>/x/2026-08/</d:href><d:href>/x/2026-09/</d:href>", { status: 207 });
    assert.ok(address.startsWith(`${RECEITA_SHARE}/2026-09/`), address);
    const name = address.split("/").pop()!;
    asked.push(name);
    if (name === failOn) return new Response(null, { status: 503 });
    return new Response(new Uint8Array(zipOf(files[name] ?? "")), { status: 200 });
  }) as typeof fetch;

  assert.equal(await runProspectLoad(db.pool, fetcher), "nada");
  await requestProspectLoad(BOSS, db.pool);
  await assert.rejects(() => requestProspectLoad(BOSS, db.pool), /Já existe uma carga em andamento/);
  // A Receita falha no meio: a carga para, e a próxima tentativa continua do arquivo em que estava.
  failOn = "Estabelecimentos2.zip";
  assert.equal(await runProspectLoad(db.pool, fetcher), "falhou");
  let [load] = await listProspectLoads(db.pool);
  assert.deepEqual([load.status, load.step, load.month, load.readRows, load.keptRows], ["rodando", 2, "2026-09", 5, 2]);
  assert.match(load.detail ?? "", /Interrompida.*Continua sozinha/);
  // Enquanto isso, alguém já transformou uma das empresas em oportunidade.
  const opportunity = await convertProspect("11222333000181", { email: "ana@empresa.test", name: "Ana" }, db.pool);
  failOn = null;
  asked.length = 0;
  assert.equal(await runProspectLoad(db.pool, fetcher), "concluida");
  assert.ok(!asked.includes("Estabelecimentos0.zip") && !asked.includes("Estabelecimentos1.zip") && asked.includes("Estabelecimentos2.zip") && asked.includes("Empresas9.zip"));
  [load] = await listProspectLoads(db.pool);
  assert.deepEqual([load.status, load.step, load.readRows, load.keptRows], ["concluida", 20, 6, 3]);
  assert.match(load.detail ?? "", /Base de 2026-09: 3 empresas ativas no recorte/);

  const all = { search: "", uf: null, city: "" };
  const fresh = await listProspects({ ...all, status: "novo" }, db.pool);
  assert.deepEqual(fresh.map((prospect) => [prospect.cnpj, prospect.legalName, prospect.tradeName, prospect.city, prospect.uf, prospect.activity, prospect.size, prospect.registryStatus]).sort(), [
    ["22333444000195", "JOAO FISIO", null, "BELO HORIZONTE", "MG", "Atividades de fisioterapia", "MICRO EMPRESA", "ATIVA"],
    ["66777888000210", "FIT CLUB FILIAL", "FIT CLUB FILIAL", "VOTUPORANGA", "SP", "Atividades de condicionamento físico", null, "ATIVA"],
  ]);
  // Quem já virou oportunidade continua assim, com os dados atualizados.
  assert.deepEqual((await listProspects({ ...all, status: "virou" }, db.pool)).map((prospect) => [prospect.cnpj, prospect.legalName, prospect.opportunityId]), [["11222333000181", "FIT CLUB ACADEMIA LTDA", opportunity]]);
  assert.equal((await db.pool.query("SELECT count(*) FROM prospects")).rows[0].count, "3");
  assert.deepEqual((await db.pool.query("SELECT DISTINCT source, cnae FROM prospects ORDER BY cnae")).rows.map((r) => [r.source, r.cnae]), [["Receita Federal (dados abertos 2026-09)", "8650004"], ["Receita Federal (dados abertos 2026-09)", "9313100"]]);

  // Outra carga, cancelada antes de rodar: nada é lido.
  await requestProspectLoad(BOSS, db.pool);
  await cancelProspectLoad("Rogério", db.pool);
  await assert.rejects(() => cancelProspectLoad("Rogério", db.pool), /Não há carga em andamento/);
  asked.length = 0;
  assert.equal(await runProspectLoad(db.pool, fetcher), "nada");
  assert.deepEqual([asked.length, (await listProspectLoads(db.pool))[0].detail], [0, "Cancelada por Rogério."]);
});

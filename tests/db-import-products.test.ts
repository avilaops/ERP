import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type pg from "pg";
import sharp from "sharp";
import { loadProductPhoto } from "@/lib/db/product-photos";
import { applyAdvisoryCosts, findProductByCode, listProducts, updateProduct } from "@/lib/db/products";
import { runProductsImport, SIMULATION_LINE } from "@/lib/import/products-folder";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;
let client: pg.PoolClient;
let root: string;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "erp-carga-"));
  if (skip) return;
  db = await openTestDb("import");
  // The load is one transaction: it needs one connection, not the pool.
  client = await db.pool.connect();
});
after(async () => {
  await rm(root, { recursive: true, force: true });
  if (skip) return;
  client.release();
  await db.close();
});

const photo = (color: string, format: "jpeg" | "png" | "webp" = "jpeg") =>
  sharp({ create: { width: 1600, height: 1200, channels: 3, background: color } })[format]().toBuffer();

/** A folder of a load: the spreadsheet and the files of `fotos/`. */
async function folder(name: string, csv: string | null, photos: Record<string, Uint8Array> = {}): Promise<string> {
  const dir = join(root, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, "fotos"), { recursive: true });
  if (csv !== null) await writeFile(join(dir, "equipamentos.csv"), csv);
  for (const [fileName, bytes] of Object.entries(photos)) await writeFile(join(dir, "fotos", fileName), bytes);
  return dir;
}

const run = (dir: string, apply: boolean) => runProductsImport(dir, { apply }, client);
const counts = async () => {
  const { rows } = await db.pool.query("SELECT (SELECT count(*)::int FROM products) AS products, (SELECT count(*)::int FROM product_photos) AS photos");
  return [rows[0].products, rows[0].photos];
};

const CSV =
  "﻿codigo;nome;descricao;fornecedor;modelo;preco_usd\r\n" +
  'ld-t001;MESA FLEXORA;"Linha um\r\nlinha dois";DHZ;SM5001;605\r\n' +
  "LD-T002;CADEIRA EXTENSORA;;;;\r\n" +
  'LD-T003;LEG PRESS;Carga máxima 400 kg;;;"1.234,56"\r\n';

test("carga: sem --apply nada é gravado; com --apply grava; de novo, nada muda", { skip }, async () => {
  const dir = await folder("basica", CSV, { "ld-t001.jpg": await photo("#336699"), "LD-T003.PNG": await photo("#993366", "png"), "leia-me.txt": Buffer.from("x") });

  const simulated = await run(dir, false);
  assert.equal(simulated.exitCode, 0);
  assert.deepEqual(simulated.lines.slice(-2), [
    SIMULATION_LINE,
    "criados=3 atualizados=0 inalterados=0 fotos_gravadas=2 fotos_iguais=0 sem_foto=1 fotos_sem_equipamento=0",
  ]);
  assert.ok(simulated.lines.includes("AVISO: equipamento sem foto: LD-T002"));
  assert.ok(simulated.lines.some((line) => line.includes("leia-me.txt")));
  assert.deepEqual(await counts(), [0, 0]);

  const applied = await run(dir, true);
  assert.equal(applied.exitCode, 0);
  assert.equal(applied.lines.at(-1), "criados=3 atualizados=0 inalterados=0 fotos_gravadas=2 fotos_iguais=0 sem_foto=1 fotos_sem_equipamento=0");
  assert.ok(!applied.lines.includes(SIMULATION_LINE));
  assert.deepEqual(await counts(), [3, 2]);

  const first = await findProductByCode("LD-T001", db.pool);
  assert.ok(first);
  assert.deepEqual(
    [first.code, first.name, first.description, first.supplierName, first.supplierModel, first.supplierPriceUsd],
    ["LD-T001", "MESA FLEXORA", "Linha um\nlinha dois", "DHZ", "SM5001", 605],
  );
  // Criado sem custo e ativo: cai na aba "Sem custo".
  assert.deepEqual([first.advisoryCost, first.taxCredit, first.packaging, first.active, first.hasPhoto], [null, 0, 0, true, true]);
  assert.equal((await findProductByCode("LD-T003", db.pool))?.supplierPriceUsd, 1234.56);
  const row = (await db.pool.query("SELECT p.updated_by AS product_by, ph.updated_by AS photo_by, ph.width, ph.height FROM products p JOIN product_photos ph ON ph.product_id = p.id WHERE p.code = 'LD-T001'")).rows[0];
  assert.deepEqual(row, { product_by: "carga", photo_by: "carga", width: 1200, height: 900 });

  const again = await run(dir, true);
  assert.equal(again.lines.at(-1), "criados=0 atualizados=0 inalterados=3 fotos_gravadas=0 fotos_iguais=2 sem_foto=1 fotos_sem_equipamento=0");
  assert.deepEqual(await counts(), [3, 2]);
});

test("carga: nome novo atualiza; campo vazio não apaga; custo, crédito, embalagem e active não mudam", { skip }, async () => {
  const before = await findProductByCode("LD-T001", db.pool);
  assert.ok(before);
  await applyAdvisoryCosts([{ code: "LD-T001", advisoryCost: 8146.64, taxCredit: 0.2811565, packaging: 150 }], "diretoria@teste.local", db.pool);
  await updateProduct(before.id, { active: false }, "diretoria@teste.local", db.pool);
  const photoBefore = await loadProductPhoto(before.id, db.pool);

  const dir = await folder("renomeia", "nome;codigo;descricao\nMESA FLEXORA - BATERIA DE PESOS;LD-T001;\nCADEIRA EXTENSORA;LD-T002;\n");
  const simulated = await run(dir, false);
  assert.equal(simulated.lines.at(-1), "criados=0 atualizados=1 inalterados=1 fotos_gravadas=0 fotos_iguais=0 sem_foto=1 fotos_sem_equipamento=0");
  assert.equal((await findProductByCode("LD-T001", db.pool))?.name, "MESA FLEXORA");

  const applied = await run(dir, true);
  assert.equal(applied.lines.at(-1), "criados=0 atualizados=1 inalterados=1 fotos_gravadas=0 fotos_iguais=0 sem_foto=1 fotos_sem_equipamento=0");
  const now = await findProductByCode("LD-T001", db.pool);
  assert.ok(now);
  assert.equal(now.name, "MESA FLEXORA - BATERIA DE PESOS");
  // A planilha veio sem descrição e sem fornecedor: o que estava no banco fica.
  assert.deepEqual([now.description, now.supplierName, now.supplierModel, now.supplierPriceUsd], ["Linha um\nlinha dois", "DHZ", "SM5001", 605]);
  assert.deepEqual([now.advisoryCost, now.taxCredit, now.packaging, now.active], [8146.64, 0.2811565, 150, false]);
  // Não veio foto nova: a que estava continua, e o equipamento não conta como "sem foto".
  assert.equal((await loadProductPhoto(before.id, db.pool))?.sha256, photoBefore?.sha256);
  assert.ok(!applied.lines.includes("AVISO: equipamento sem foto: LD-T001"));
});

test("carga: foto de código que só existe no banco é gravada; foto sem equipamento é aviso, não erro", { skip }, async () => {
  const dir = await folder("so-fotos", "codigo;nome;descricao\n", {
    "LD-T002.webp": await photo("#00aa55", "webp"),
    "XX-999.jpg": await photo("#000000"),
    "foto da mesa.jpg": await photo("#ffffff"),
  });
  const applied = await run(dir, true);
  assert.equal(applied.exitCode, 0);
  assert.equal(applied.lines.at(-1), "criados=0 atualizados=0 inalterados=0 fotos_gravadas=1 fotos_iguais=0 sem_foto=0 fotos_sem_equipamento=2");
  assert.ok(applied.lines.includes("AVISO: foto sem equipamento: XX-999.jpg"));
  assert.ok(applied.lines.includes("AVISO: foto sem equipamento: foto da mesa.jpg"));
  assert.equal((await findProductByCode("LD-T002", db.pool))?.hasPhoto, true);
  assert.deepEqual(await counts(), [3, 3]);
});

test("carga: foto inválida no meio, ou planilha com erro, e nada é gravado (nem os equipamentos)", { skip }, async () => {
  const before = await counts();
  const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(800, 0x41)]);
  const dir = await folder("foto-ruim", "codigo;nome;descricao\nLD-N001;NOVO UM;\nLD-N002;NOVO DOIS;\nLD-N003;NOVO TRÊS;\n", {
    "LD-N001.jpg": await photo("#111111"),
    "LD-N002.jpg": broken,
    "LD-N003.jpg": Buffer.from("<svg/>"),
  });
  for (const apply of [false, true]) {
    const result = await run(dir, apply);
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.lines, [
      "ERRO: Foto LD-N002.jpg: Não foi possível ler a imagem.",
      "ERRO: Foto LD-N003.jpg: Formato de imagem não aceito: use JPG, PNG ou WebP.",
      "2 erro(s). Nada foi gravado.",
    ]);
  }

  const twoPhotos = await folder("duas-fotos", "codigo;nome;descricao\nLD-N001;NOVO UM;\n;SEM CODIGO;\n", {
    "LD-N001.jpg": await photo("#111111"),
    "ld-n001.png": await photo("#222222", "png"),
  });
  const result = await run(twoPhotos, true);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.lines.slice(0, 2), ["ERRO: Linha 3: código vazio.", "ERRO: Código LD-N001: mais de uma foto (LD-N001.jpg, ld-n001.png)."]);

  assert.deepEqual(await counts(), before);
  assert.equal(await findProductByCode("LD-N001", db.pool), null);
});

test("carga: falha no meio da gravação desfaz tudo", { skip }, async () => {
  const before = await counts();
  // Passa pela conferência (o nome cabe na planilha), mas o banco recusa: preço que não cabe na coluna não chega aqui,
  // então a falha é provocada no próprio banco, com uma regra só deste teste.
  await db.pool.query("ALTER TABLE products ADD CONSTRAINT only_this_test CHECK (name <> 'RECUSADO')");
  try {
    const dir = await folder("falha", "codigo;nome;descricao\nLD-F001;PRIMEIRO;\nLD-F002;RECUSADO;\n", { "LD-F001.jpg": await photo("#333333") });
    await assert.rejects(() => run(dir, true), (error: unknown) => (error as { code?: string }).code === "23514");
  } finally {
    await db.pool.query("ALTER TABLE products DROP CONSTRAINT only_this_test");
  }
  assert.deepEqual(await counts(), before);
  assert.equal(await findProductByCode("LD-F001", db.pool), null);
  // A conexão volta a servir: a transação foi encerrada.
  assert.equal((await client.query("SELECT 1 AS ok")).rows[0].ok, 1);
});

test("carga: pasta ou planilha ausente; subpasta e link simbólico em fotos/ não são lidos", { skip }, async () => {
  const missing = await run(join(root, "nao-existe"), false);
  assert.deepEqual([missing.exitCode, missing.lines[0]], [1, `ERRO: Pasta não encontrada: ${join(root, "nao-existe")}`]);
  const noCsv = await folder("sem-planilha", null);
  const result = await run(noCsv, false);
  assert.deepEqual([result.exitCode, result.lines[0]], [1, `ERRO: Arquivo equipamentos.csv não encontrado em ${noCsv}`]);

  const outside = join(root, "fora.jpg");
  await writeFile(outside, await photo("#abcdef"));
  const dir = await folder("links", "codigo;nome;descricao\nLD-K001;COM LINK;\nLD-K002;COM SUBPASTA;\n");
  await symlink(outside, join(dir, "fotos", "LD-K001.jpg"));
  await mkdir(join(dir, "fotos", "sub"));
  await writeFile(join(dir, "fotos", "sub", "LD-K002.jpg"), await photo("#fedcba"));
  const simulated = await run(dir, false);
  assert.equal(simulated.lines.at(-1), "criados=2 atualizados=0 inalterados=0 fotos_gravadas=0 fotos_iguais=0 sem_foto=2 fotos_sem_equipamento=0");
  assert.equal((await listProducts({}, db.pool)).some((product) => product.code?.startsWith("LD-K")), false);
});

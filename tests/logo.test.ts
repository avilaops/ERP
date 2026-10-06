import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { loadLogo, loadLogoVersion, removeLogo, saveLogo } from "@/lib/db/company";
import { detectLogoType, LOGO_MAX_BYTES, logoProblem } from "@/lib/logo";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "diretoria@teste.local";
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("logo");
});
after(async () => {
  if (!skip) await db.close();
});

const bytes = (...head: number[]) => Uint8Array.from([...head, ...Array(32).fill(7)]);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

test("logo: o tipo vem dos bytes; SVG, texto e arquivo vazio não são logo", () => {
  assert.equal(detectLogoType(PNG), "image/png");
  assert.equal(detectLogoType(JPEG), "image/jpeg");
  assert.equal(detectLogoType(WEBP), "image/webp");
  for (const other of [SVG, new TextEncoder().encode("GIF89a…"), new TextEncoder().encode("<html>"), bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x41, 0x56, 0x49, 0x20)]) {
    assert.equal(detectLogoType(other), null);
  }
  assert.equal(logoProblem(PNG), null);
  assert.match(logoProblem(new Uint8Array()) ?? "", /Escolha o arquivo/);
  assert.match(logoProblem(SVG) ?? "", /PNG, JPEG ou WebP/);
  const big = new Uint8Array(LOGO_MAX_BYTES + 1);
  big.set(PNG);
  assert.match(logoProblem(big) ?? "", /passa de 512 KB/);
  const limit = new Uint8Array(LOGO_MAX_BYTES);
  limit.set(PNG);
  assert.equal(logoProblem(limit), null);
});

test("logo da empresa: começa sem, grava, troca e remove", { skip }, async () => {
  assert.equal(await loadLogoVersion(db.pool), null);
  assert.equal(await loadLogo(db.pool), null);

  await saveLogo(PNG, WHO, db.pool);
  const first = await loadLogo(db.pool);
  assert.ok(first);
  assert.equal(first.type, "image/png");
  assert.deepEqual(new Uint8Array(first.bytes), PNG);
  assert.equal((await loadLogoVersion(db.pool))?.getTime(), first.updatedAt.getTime());

  await saveLogo(JPEG, "outra@teste.local", db.pool);
  const second = await loadLogo(db.pool);
  assert.equal(second?.type, "image/jpeg");
  assert.ok((second?.updatedAt.getTime() ?? 0) >= first.updatedAt.getTime());
  const { rows } = await db.pool.query("SELECT updated_by, (SELECT count(*)::int FROM company_settings) AS n FROM company_settings");
  assert.deepEqual(rows[0], { updated_by: "outra@teste.local", n: 1 });

  await removeLogo(WHO, db.pool);
  assert.equal(await loadLogo(db.pool), null);
  assert.equal(await loadLogoVersion(db.pool), null);
});

test("logo da empresa: arquivo que não é imagem é recusado e a logo atual fica", { skip }, async () => {
  await saveLogo(WEBP, WHO, db.pool);
  await assert.rejects(() => saveLogo(SVG, WHO, db.pool), /PNG, JPEG ou WebP/);
  await assert.rejects(() => saveLogo(new Uint8Array(), WHO, db.pool), /Escolha o arquivo/);
  await assert.rejects(() => saveLogo(new Uint8Array(LOGO_MAX_BYTES + 1), WHO, db.pool), /passa de 512 KB/);
  await assert.rejects(() => saveLogo(PNG, "  ", db.pool), /quem está trocando/);
  assert.equal((await loadLogo(db.pool))?.type, "image/webp");
});

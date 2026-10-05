import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function files(dir: string, pattern: RegExp): string[] {
  return readdirSync(ROOT + dir, { recursive: true, encoding: "utf8" })
    .filter((file) => pattern.test(file))
    .map((file) => `${dir}/${file}`);
}

const read = (file: string) => readFileSync(ROOT + file, "utf8");
const SOURCES = files("src", /\.tsx?$/);

test('nenhum arquivo de navegador ("use client") importa o banco', () => {
  for (const file of SOURCES) {
    const source = read(file);
    if (!/^\s*["']use client["']/m.test(source)) continue;
    assert.doesNotMatch(source, /["']@\/lib\/db(\/[^"']*)?["']|["']pg["']/, `${file} é de navegador e importa o banco`);
  }
});

test("só src/lib/db fala com o PostgreSQL", () => {
  for (const file of SOURCES) {
    if (file.startsWith("src/lib/db/")) continue;
    assert.doesNotMatch(read(file), /from\s+["']pg["']/, `${file} importa pg fora de src/lib/db`);
  }
});

test("consultas usam parâmetros ($1), nunca valor colado no texto", () => {
  for (const file of files("src/lib/db", /\.ts$/)) {
    // Interpolating a value would need a ${…} that is not one of the fixed column lists.
    for (const [, expression] of read(file).matchAll(/query\(\s*`[^`]*?\$\{([^}]+)\}/g)) {
      assert.match(expression, /^(COLUMNS|COLUMN_LIST|placeholders|updates|COLUMNS\.length \+ 1)$/, `${file}: \${${expression}}`);
    }
  }
});

test("o ERP só conhece o próprio banco", () => {
  for (const file of [...SOURCES, ...files("db", /\.sql$/), ...files("scripts", /\.ts$/)]) {
    assert.doesNotMatch(read(file), /\b(gapp|app_avila)\b/, `${file} cita banco de outro sistema`);
  }
});

test("migrações não fixam o esquema", () => {
  for (const file of files("db/migrations", /\.sql$/)) {
    assert.doesNotMatch(read(file), /\bpublic\./, `${file} fixa o esquema public`);
  }
});

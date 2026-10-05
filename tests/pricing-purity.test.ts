import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../src/lib/pricing/", import.meta.url));
const FILES = readdirSync(DIR, { recursive: true, encoding: "utf8" }).filter((file) => /\.tsx?$/.test(file));

const FORBIDDEN: [RegExp, string][] = [
  [/from\s+["'](next|react)(\/[^"']*)?["']/, "importa next ou react"],
  [/from\s+["']@\/lib\/auth(\/[^"']*)?["']/, "importa @/lib/auth"],
  [/\b(import|require)\s*\(\s*["'](next|react|@\/lib\/auth)/, "carrega next, react ou @/lib/auth"],
  [/from\s+["']node:/, "importa módulo do Node"],
  [/process\.env/, "lê process.env"],
  [/Date\.now\s*\(/, "lê o relógio (Date.now)"],
  [/new\s+Date\s*\(\s*\)/, "lê o relógio (new Date sem argumento)"],
  [/\bfetch\s*\(/, "usa a rede (fetch)"],
];

test("motor de cálculo: a pasta tem os arquivos esperados", () => {
  assert.ok(FILES.length >= 9, `só ${FILES.length} arquivos em src/lib/pricing`);
});

test("motor de cálculo: sem Next, React, login, ambiente, relógio nem rede", () => {
  for (const file of FILES) {
    const source = readFileSync(DIR + file, "utf8");
    for (const [pattern, problem] of FORBIDDEN) {
      assert.doesNotMatch(source, pattern, `src/lib/pricing/${file} ${problem}`);
    }
  }
});

test("motor de cálculo: só importa da própria pasta", () => {
  for (const file of FILES) {
    const source = readFileSync(DIR + file, "utf8");
    for (const [, specifier] of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      assert.match(specifier, /^@\/lib\/pricing\/[a-z-]+$/, `src/lib/pricing/${file} importa ${specifier}`);
    }
  }
});

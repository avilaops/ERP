import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const verifier = join(root, "deploy/conferir-identidade-pacote.sh");
const expectedSha = "0123456789abcdef0123456789abcdef01234567";

function packageWithSha(sha: string) {
  const temporary = mkdtempSync(join(tmpdir(), "erp-package-test-"));
  const contents = join(temporary, "contents");
  const archive = join(temporary, "standalone.tgz");
  mkdirSync(contents);
  writeFileSync(join(contents, "server.js"), "// runtime\n");
  writeFileSync(join(contents, ".erp-source-sha"), `${sha}\n`);
  execFileSync("tar", ["-czf", archive, "-C", contents, "."]);
  return { archive, temporary };
}

test("aceita somente o pacote produzido pelo commit esperado", () => {
  const { archive, temporary } = packageWithSha(expectedSha);
  try {
    const result = spawnSync("bash", [verifier, archive, expectedSha], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("rejeita pacote válido produzido por outro commit", () => {
  const otherSha = "fedcba9876543210fedcba9876543210fedcba98";
  const { archive, temporary } = packageWithSha(otherSha);
  try {
    const result = spawnSync("bash", [verifier, archive, expectedSha], {
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /outro commit/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("rejeita pacote sem a identidade do commit", () => {
  const temporary = mkdtempSync(join(tmpdir(), "erp-package-test-"));
  const contents = join(temporary, "contents");
  const archive = join(temporary, "standalone.tgz");
  mkdirSync(contents);
  writeFileSync(join(contents, "server.js"), "// runtime\n");
  execFileSync("tar", ["-czf", archive, "-C", contents, "."]);

  try {
    const result = spawnSync("bash", [verifier, archive, expectedSha], {
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /identidade do commit/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

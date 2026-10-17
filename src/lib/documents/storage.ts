import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";

export const HASH = /^[a-f0-9]{64}$/;

/** Only content hashes become paths. URLs and uploaded names never do. */
export function blobPath(root: string, hash: string): string {
  if (!isAbsolute(root)) throw new Error("ERP_DOCUMENTS_ROOT precisa ser um caminho absoluto persistente.");
  if (!HASH.test(hash)) throw new Error("Hash de documento inválido.");
  return join(root, "sha256", hash.slice(0, 2), hash);
}

export async function saveBlob(root: string, bytes: Buffer): Promise<string> {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const path = blobPath(root, hash);
  await mkdir(join(root, "sha256", hash.slice(0, 2)), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
  try {
    // Existing content is immutable: verify instead of trusting a filename.
    try {
      const existing = await readFile(path);
      if (createHash("sha256").update(existing).digest("hex") !== hash) throw new Error("Blob existente com integridade inválida.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await rename(temporary, path);
    }
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
  return hash;
}

export async function readBlob(root: string, hash: string): Promise<Buffer> {
  const bytes = await readFile(blobPath(root, hash));
  if (createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error("Falha de integridade do original.");
  return bytes;
}

/** Derived files are separate from the immutable original and can be rebuilt. */
export async function saveExtraction(root: string, originalHash: string, extraction: { extractor: string; pages: { page: number; section: string; content: string }[] }): Promise<string> {
  blobPath(root, originalHash);
  const serialized = JSON.stringify(extraction, null, 2);
  const derivedHash = createHash("sha256").update(serialized).digest("hex");
  const dir = join(root, "derived", originalHash, derivedHash);
  await mkdir(dir, { recursive: true });
  const markdown = extraction.pages.map(p => `## Página ${p.page}${p.section ? ` · ${p.section}` : ""}\n\n${p.content}`).join("\n\n");
  await writeFile(join(dir, "extraction.json"), serialized, { mode: 0o600 });
  await writeFile(join(dir, "text.md"), markdown, { mode: 0o600 });
  return derivedHash;
}

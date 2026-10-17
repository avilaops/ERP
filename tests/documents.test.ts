import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documentFilter } from "@/lib/db/documents";
import { documentUrl, allowedDocumentUrl } from "@/lib/documents/download";
import { blobPath, saveBlob, readBlob } from "@/lib/documents/storage";
import { discoverLinks, FISCAL_SEEDS, fileType, documentFilename } from "@/lib/documents/ingest";

test("documentos: URL preserva + / = e inclui paginação somente das raízes", () => {
  assert.equal(documentUrl(FISCAL_SEEDS[0]), FISCAL_SEEDS[0]);
  assert.equal(documentUrl(FISCAL_SEEDS[3] + "#top"), FISCAL_SEEDS[3]);
  assert.throws(() => documentUrl("file:///etc/passwd"));
  assert.throws(() => documentUrl("https://user:pass@nfe.fazenda.gov.br/"));
  const links = discoverLinks([FISCAL_SEEDS[0] + "&pagina=2", "../arquivo/a.xsd", "https://evil.test/a.pdf", "listaConteudo.aspx?tipoConteudo=outro"], FISCAL_SEEDS[0], ["www.nfe.fazenda.gov.br"]);
  assert.deepEqual(links.map(x => x.disposition), ["queued", "queued", "excluded", "excluded"]);
  assert.equal(allowedDocumentUrl("https://127.0.0.1/a.pdf", ["127.0.0.1"]), false);
  assert.equal(allowedDocumentUrl("https://www.nfe.fazenda.gov.br.evil.test/a.pdf", ["www.nfe.fazenda.gov.br"]), false);
});

test("documentos: conteúdo assinado prevalece sobre extensão e filtros são limitados", () => {
  assert.equal(fileType(Buffer.from("%PDF-1.7"), "text/html", "a.aspx"), "application/pdf");
  assert.equal(fileType(Buffer.from("<html><title>Erro</title>"), "application/pdf", "a.pdf"), "text/html");
  assert.equal(documentFilter({ antes: "1 OR 1=1", tipo: "sql", q: "a".repeat(300) }, 500).q.length, 160);
  assert.equal(documentFilter({ antes: "x", colecao: "public" }).before, "");
  assert.equal(documentFilter({}, 500).limit, 30);
  assert.equal(documentFilter({de:"2026-02-31",ate:"2026-10-17",antes:"983:3"}).from, "");
  assert.equal(documentFilter({de:"2026-02-31",ate:"2026-10-17",antes:"983:3"}).until, "2026-10-17");
});

test("documentos: nomes UTF-8 de anexos preservam acentos e sinais", () => {
  assert.equal(documentFilename("attachment; filename*=UTF-8''Descri%C3%A7%C3%A3o%2B.xlsx", "/arquivo.aspx"), "Descrição+.xlsx");
  assert.equal(documentFilename('attachment; filename="DescriÃ§Ã£o.xlsx"', "/arquivo.aspx"), "Descrição.xlsx");
  assert.equal(documentFilename('attachment; filename="Descrição.xlsx"', "/arquivo.aspx"), "Descrição.xlsx");
});

test("documentos: originais por hash são idempotentes, verificáveis e não aceitam paths livres", async () => {
  const dir = await mkdtemp(join(tmpdir(), "erp-doc-"));
  try {
    const bytes = Buffer.from("Conteúdo preservado.");
    const first = await saveBlob(dir, bytes);
    assert.equal(await saveBlob(dir, bytes), first);
    assert.deepEqual(await readBlob(dir, first), bytes);
    assert.deepEqual(await readFile(blobPath(dir, first)), bytes);
    assert.throws(() => blobPath(dir, "../private"));
    assert.throws(() => blobPath("relative", first));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

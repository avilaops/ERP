import assert from "node:assert/strict";
import { test } from "node:test";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import {
  FORMAT_MESSAGE,
  logoPng,
  MAX_UPLOAD_BYTES,
  normalizePhoto,
  PhotoError,
  sniffFormat,
  thumbnail,
  TOO_LARGE_MESSAGE,
  TOO_MANY_PIXELS_MESSAGE,
  UNREADABLE_MESSAGE,
} from "@/lib/photos/normalize";

const solid = (width: number, height: number, background: sharp.Color, channels: 3 | 4 = 3) =>
  sharp({ create: { width, height, channels, background } });

const refused = (message: string) => (error: unknown) => error instanceof PhotoError && error.message === message;

test("JPEG 3000×2000 sai JPEG 1200×800, sem EXIF", async () => {
  const input = await solid(3000, 2000, "#3366cc").withExif({ IFD0: { Copyright: "Ludus" } }).jpeg().toBuffer();
  assert.ok((await sharp(input).metadata()).exif, "a entrada do teste precisa ter EXIF");

  const photo = await normalizePhoto(input);
  const meta = await sharp(photo.bytes).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ["jpeg", 1200, 800]);
  assert.deepEqual([photo.width, photo.height], [1200, 800]);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.icc, undefined);
  assert.match(photo.sha256, /^[0-9a-f]{64}$/);
});

test("PNG 400×300 com transparência não é ampliado e ganha fundo branco", async () => {
  const input = await solid(400, 300, { r: 0, g: 0, b: 0, alpha: 0 }, 4).png().toBuffer();
  const photo = await normalizePhoto(input);
  assert.deepEqual([photo.width, photo.height], [400, 300]);

  const { data, info } = await sharp(photo.bytes).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 3);
  assert.deepEqual([...data.subarray(0, 3)], [255, 255, 255]);
});

test("WebP é aceito, e o formato sai do conteúdo, não do nome", async () => {
  const webp = await solid(500, 250, "#00aa00").webp().toBuffer();
  assert.equal(sniffFormat(webp), "webp");
  assert.deepEqual([(await normalizePhoto(webp)).width, (await normalizePhoto(webp)).height], [500, 250]);

  // Um "foto.jpg" que na verdade é PNG: o que conta são os primeiros bytes.
  const png = await solid(64, 64, "#aa0000").png().toBuffer();
  assert.equal(sniffFormat(png), "png");
  assert.equal((await sharp((await normalizePhoto(png)).bytes).metadata()).format, "jpeg");
});

test("orientação EXIF 6: 2000×1000 sai em pé, 600×1200", async () => {
  const input = await solid(2000, 1000, "#888888").withMetadata({ orientation: 6 }).jpeg().toBuffer();
  assert.equal((await sharp(input).metadata()).orientation, 6);

  const photo = await normalizePhoto(input);
  const meta = await sharp(photo.bytes).metadata();
  assert.deepEqual([photo.width, photo.height], [600, 1200]);
  assert.deepEqual([meta.width, meta.height, meta.orientation], [600, 1200, undefined]);
});

test("SVG, GIF, PDF, HTML, texto e arquivo vazio são recusados pelo conteúdo", async () => {
  const gif = await solid(10, 10, "#ffffff").gif().toBuffer();
  const inputs: Uint8Array[] = [
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    gif,
    Buffer.from("%PDF-1.7\n"),
    Buffer.from("<!doctype html><script>alert(1)</script>"),
    Buffer.from("só um texto"),
    new Uint8Array(),
  ];
  for (const input of inputs) await assert.rejects(() => normalizePhoto(input), refused(FORMAT_MESSAGE));
});

test("arquivo corrompido dá erro em português, sem derrubar o processo", async () => {
  const garbage = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 0x41)]);
  await assert.rejects(() => normalizePhoto(garbage), refused(UNREADABLE_MESSAGE));

  const jpeg = await solid(800, 600, "#123456").jpeg().toBuffer();
  await assert.rejects(() => normalizePhoto(jpeg.subarray(0, 40)), refused(UNREADABLE_MESSAGE));
});

test("entrada de 15 MB + 1 byte é recusada antes de abrir a imagem", async () => {
  const input = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
  input.set([0xff, 0xd8, 0xff]);
  await assert.rejects(() => normalizePhoto(input), refused(TOO_LARGE_MESSAGE));
});

/** A small PNG whose header declares another size: nothing that large is ever allocated by the test. */
async function pngDeclaring(width: number, height: number): Promise<Buffer> {
  const png = await solid(8, 8, "#3366cc").png().toBuffer();
  // Signature (8) + length (4) + "IHDR" (4), then width and height; the CRC covers "IHDR" and its 13 bytes.
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
  return png;
}

test("imagem acima de 50 megapixels é recusada com mensagem própria, sem ser decodificada", async () => {
  const input = await pngDeclaring(8000, 6251);
  const meta = await sharp(input, { limitInputPixels: false }).metadata();
  assert.deepEqual([meta.width, meta.height], [8000, 6251], "a entrada do teste precisa declarar 50,008 MP");
  assert.ok(input.length < 1024, "a recusa é pelos pixels, não pelo tamanho do arquivo");

  await assert.rejects(() => normalizePhoto(input), refused(TOO_MANY_PIXELS_MESSAGE));
  // No limite exato a recusa não é pelos pixels: o arquivo é que não tem os dados que declara.
  const atLimit = await pngDeclaring(8000, 6250);
  await assert.rejects(() => normalizePhoto(atLimit), refused(UNREADABLE_MESSAGE));
});

test("a mesma entrada dá sempre a mesma saída", async () => {
  const input = await solid(1600, 900, "#ffcc00").jpeg().toBuffer();
  const [first, second] = [await normalizePhoto(input), await normalizePhoto(input)];
  assert.equal(first.sha256, second.sha256);
  assert.ok(first.bytes.equals(second.bytes));
});

test("miniatura: 1200×800 sai 240×160, JPEG leve e sem metadados; a pequena não é ampliada", async () => {
  // Uma foto com detalhe, e não uma cor só: o peso da miniatura tem de valer para foto de verdade.
  const noise = Buffer.alloc(1200 * 800 * 3);
  for (let index = 0; index < noise.length; index += 1) noise[index] = (index * 2654435761) % 251;
  const stored = await normalizePhoto(await sharp(noise, { raw: { width: 1200, height: 800, channels: 3 } }).jpeg().toBuffer());
  assert.deepEqual([stored.width, stored.height], [1200, 800]);

  const small = await thumbnail(stored.bytes, 240);
  const meta = await sharp(small).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ["jpeg", 240, 160]);
  assert.equal(meta.exif, undefined);
  assert.ok(small.length < 40 * 1024, `miniatura de ${small.length} bytes`);
  assert.ok(small.equals(await thumbnail(stored.bytes, 240)), "a mesma entrada dá a mesma miniatura");

  const tiny = await solid(100, 100, "#cc3366").jpeg().toBuffer();
  const kept = await sharp(await thumbnail(tiny, 240)).metadata();
  assert.deepEqual([kept.width, kept.height], [100, 100]);
  await assert.rejects(() => thumbnail(tiny, 0), /Tamanho da miniatura/);
});

test("logo para o PDF: PNG, JPEG ou WebP saem PNG sem transparência, dentro da caixa", async () => {
  const transparent = await solid(900, 300, { r: 0, g: 0, b: 0, alpha: 0 }, 4).png().toBuffer();
  const inputs = [transparent, await solid(900, 300, "#222222").jpeg().toBuffer(), await solid(900, 300, "#222222").webp().toBuffer()];
  for (const input of inputs) {
    const meta = await sharp(await logoPng(input, 510, 144)).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height, meta.hasAlpha], ["png", 432, 144, false]);
  }
  const { data } = await sharp(await logoPng(transparent, 510, 144)).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...data.subarray(0, 3)], [255, 255, 255]);
  await assert.rejects(() => logoPng(Buffer.from("isto não é imagem"), 510, 144));
});

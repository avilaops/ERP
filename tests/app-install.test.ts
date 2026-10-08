import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import manifest from "@/app/manifest";
import { APP_DESCRIPTION, APP_ICONS, APP_NAME, APP_SHORT_NAME, BACKGROUND_COLOR, ICON_BACKGROUND, ICON_COLOR, THEME_COLOR } from "@/lib/app-identity";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (file: string) => readFileSync(`${ROOT}${file}`, "utf8");

/** "#2c49a8" as the three bytes of a pixel. */
const rgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

/** Every file under a directory, as paths from the root of the repository. */
function files(dir: string): string[] {
  return readdirSync(`${ROOT}${dir}`, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
  );
}

test("identidade do aplicativo: é a do produto, e as cores são as da tela", () => {
  assert.equal(APP_NAME, "ERP · Ávila Ops");
  assert.equal(APP_SHORT_NAME, "ERP");
  assert.equal(APP_DESCRIPTION, "Sistema comercial.");
  const css = read("src/app/globals.css");
  assert.ok(css.includes(`--color-brand: ${ICON_COLOR};`));
  assert.ok(css.includes(`background: ${BACKGROUND_COLOR};`));
  assert.equal(THEME_COLOR, ICON_COLOR);
});

test("manifesto: instalável, em tela cheia, com os ícones que existem em public", () => {
  const { icons, ...rest } = manifest();
  assert.deepEqual(rest, {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    lang: "pt-BR",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
  });
  assert.deepEqual(icons, [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ]);
  for (const icon of icons ?? []) {
    const listed = APP_ICONS.find(({ file }) => file === `public${icon.src}`);
    assert.ok(listed, `${icon.src} não está em APP_ICONS`);
    assert.ok(statSync(`${ROOT}public${icon.src}`).isFile());
    assert.equal(icon.sizes, `${listed.size}x${listed.size}`);
    assert.equal(icon.purpose, listed.maskable ? "maskable" : "any");
  }
  // O Chrome só oferece "Instalar aplicativo" com um ícone de 192 e um de 512.
  assert.deepEqual([...new Set((icons ?? []).map((icon) => icon.sizes))], ["192x192", "512x512"]);
});

test("ícones: PNG quadrado do tamanho declarado, a marca da Ávila sobre fundo branco, sem transparência fora da aba do navegador", async () => {
  const [red, green, blue] = rgb(ICON_BACKGROUND);
  for (const { file, size, maskable, transparent = false } of APP_ICONS) {
    const image = sharp(`${ROOT}${file}`);
    const { format, width, height } = await image.metadata();
    assert.deepEqual({ format, width, height }, { format: "png", width: size, height: size }, file);
    const pixels = await image.ensureAlpha().raw().toBuffer();
    assert.equal(pixels.length, size * size * 4, file);
    // O mascarável é cortado pelo celular: fora do quadrado central de 60% só pode haver fundo.
    const edge = maskable ? Math.ceil(size * 0.2) : 1;
    let drawn = 0;
    for (let at = 0; at < pixels.length; at += 4) {
      const x = (at / 4) % size;
      const y = Math.floor(at / 4 / size);
      // Transparência vira fundo preto na tela de início do iPhone.
      if (!transparent && pixels[at + 3] !== 255) assert.fail(`${file}: pixel transparente em ${x},${y}`);
      const background = transparent ? pixels[at + 3] === 0 : pixels[at] === red && pixels[at + 1] === green && pixels[at + 2] === blue;
      const outside = x < edge || y < edge || x >= size - edge || y >= size - edge;
      if (outside && !background) assert.fail(`${file}: desenho fora da área segura em ${x},${y}`);
      if (!outside && !background) drawn += 1;
    }
    assert.ok(drawn > 0, `${file}: sem desenho`);
  }
  // Nada além dos ícones é servido sem sessão a partir de public.
  assert.deepEqual(files("public").sort(), APP_ICONS.map(({ file }) => file).filter((file) => file.startsWith("public/")).sort());
  for (const { file } of APP_ICONS) assert.ok(existsSync(`${ROOT}${file}`), file);
});

test("página: título, nome curto e cor vêm da identidade, e o zoom continua livre", () => {
  const layout = read("src/app/layout.tsx");
  for (const expected of [
    "title: APP_NAME,",
    "description: APP_DESCRIPTION,",
    "robots: { index: false, follow: false }",
    'appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: "default" }',
    "export const viewport: Viewport = { themeColor: THEME_COLOR };",
  ]) {
    assert.ok(layout.includes(expected), `layout.tsx sem ${expected}`);
  }
  assert.doesNotMatch(layout, /userScalable|maximumScale|"use client"|#[0-9a-f]{6}/i);
  // O Next serve estes dois pela convenção de arquivo e põe sozinho as marcações na página.
  for (const file of ["src/app/icon.png", "src/app/apple-icon.png"]) assert.ok(existsSync(`${ROOT}${file}`), file);
});

test("manifesto e identidade são do produto: sem sessão, sem banco, sem nome de empresa, sem service worker", () => {
  for (const file of ["src/app/manifest.ts", "src/lib/app-identity.ts"]) {
    assert.doesNotMatch(read(file), /@\/lib\/db|@\/lib\/auth|tenantDb|getSession|cookies|next\/headers|process\.env/, file);
  }
  assert.doesNotMatch(read("src/lib/app-identity.ts"), /from "(next|react)|node:fs/);
  for (const file of ["src/app/manifest.ts", "src/lib/app-identity.ts", "src/app/layout.tsx"]) {
    assert.doesNotMatch(read(file), /ludus/i, file);
  }
  // Tela de uma empresa guardada no aparelho é risco de vazamento entre empresas.
  for (const file of ["public/sw.js", "src/app/sw.ts"]) assert.ok(!existsSync(`${ROOT}${file}`), file);
  for (const file of files("src")) {
    if (/\.(ts|tsx|mjs|js)$/.test(file)) assert.ok(!read(file).includes("serviceWorker"), file);
  }
  // O pacote publicado não sai sem os ícones.
  assert.ok(read("deploy/empacotar.sh").includes("public/icons/icon-512\\.png"));
});

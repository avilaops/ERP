import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { parseTheme } from "@/lib/theme";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("aparência: o cookie só vale com um dos três valores; o resto é Sistema", () => {
  assert.deepEqual(["light", "dark", "system"].map(parseTheme), ["light", "dark", "system"]);
  for (const value of [undefined, null, "", "DARK", "dark; x", "<script>"]) assert.equal(parseTheme(value), "system");
});

test("aparência: o escuro vale pela escolha da pessoa e, sem escolha, pelo aparelho, com as mesmas cores", () => {
  const css = read("src/app/globals.css");
  const chosen = css.match(/html\[data-theme="dark"\] \{([^}]*)\}/)?.[1] ?? "";
  const device = css.match(/@media \(prefers-color-scheme: dark\) \{\s*html:not\(\[data-theme\]\) \{([^}]*)\}/)?.[1] ?? "";
  const pairs = (block: string) => block.split(";").map((line) => line.trim()).filter(Boolean).sort();
  assert.ok(pairs(chosen).length > 30);
  assert.deepEqual(pairs(device), pairs(chosen));
  // Quem escolheu Claro não é levado ao escuro pelo aparelho.
  assert.doesNotMatch(css, /prefers-color-scheme: dark\) \{\s*(html|:root) \{/);
});

test("aparência: toda cor usada nas telas tem valor no escuro", () => {
  const css = read("src/app/globals.css");
  const dark = css.match(/html\[data-theme="dark"\] \{([^}]*)\}/)?.[1] ?? "";
  const dir = new URL("../src", import.meta.url).pathname;
  const used = new Set<string>();
  for (const file of readdirSync(dir, { recursive: true }) as string[]) {
    if (!/\.tsx?$/.test(file)) continue;
    for (const [, color] of readFileSync(`${dir}/${file}`, "utf8").matchAll(/\b(?:bg|text|border|ring|divide|accent|outline)-((?:white|brand(?:-dark|-soft)?|(?:slate|red|emerald|amber|indigo)-\d{2,3}))\b/g)) {
      used.add(color);
    }
  }
  assert.ok(used.size > 20);
  for (const color of used) assert.ok(dark.includes(`--color-${color}:`), `sem cor no escuro: ${color}`);
});

test("aparência: a página nasce já no tema escolhido, e a escolha fica no menu", () => {
  const layout = read("src/app/layout.tsx");
  assert.ok(layout.includes('data-theme={theme === "system" ? undefined : theme}'));
  assert.ok(layout.includes("parseTheme((await cookies()).get(THEME_COOKIE)?.value)"));
  assert.ok(read("src/components/Sidebar.tsx").includes("<ThemeChoice />"));
});

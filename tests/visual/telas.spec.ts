import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Every screen reachable from the menu, in the five sizes of docs/ux.md, as
 * Diretoria (the profile that sees every screen). A screen fails when it scrolls
 * sideways, when something a finger has to hit is shorter than 44 px, or when
 * the page logs an error. How many screens tall each page is goes to the report
 * (`telas.json`) without failing: it is the list of pending items of docs/ux.md.
 */

const SIZES: [number, number][] = [
  [360, 640],
  [390, 844],
  [430, 932],
  [1366, 768],
  [1440, 900],
];
/** Screens that are not of the logged-in system, files and the doors of other services. */
const OUTSIDE = /^\/(api|oauth|dev|mcp|descadastro|conectar|captura|contrato|whatsapp|telefonia)(\/|$)|\.(png|pdf|csv|xml|jpg|zip)$/;
/** One screen of each kind is enough: /pedidos/260930-ABCD and /pedidos/260930-WXYZ are the same screen. */
const kindOf = (path: string) => path.replace(/\/\d[^/]*/g, "/:id");
const CONTROL = 43.5;

type Measure = { overflowX: number; screens: number; small: string[] };

async function signIn(page: Page): Promise<void> {
  await page.goto("/dev/login");
  await page.click("button[value=DIRETORIA]");
  await page.waitForURL((url) => !url.pathname.startsWith("/dev/login"));
}

async function discover(page: Page): Promise<string[]> {
  const seen = new Set<string>();
  const kinds = new Set<string>();
  const queue = ["/dashboard"];
  const found: string[] = [];
  while (queue.length > 0) {
    const path = queue.shift()!;
    if (seen.has(path) || kinds.has(kindOf(path))) continue;
    seen.add(path);
    kinds.add(kindOf(path));
    found.push(path);
    await page.goto(path, { waitUntil: "networkidle" });
    const links = await page.$$eval("a[href^='/']", (anchors) => anchors.map((anchor) => anchor.getAttribute("href")!.split(/[?#]/)[0]));
    for (const link of links) if (!OUTSIDE.test(link) && !seen.has(link)) queue.push(link);
  }
  return found;
}

/** What the screen measures in the browser. Runs inside the page. */
function measure(control: number): Measure {
  const small: string[] = [];
  for (const element of document.querySelectorAll<HTMLElement>("main button, main input, main select, main textarea, main a")) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    // Visually hidden (the file input whose button is its label) and what is not on the screen.
    if (rect.width <= 1 || rect.height <= 1 || style.visibility === "hidden") continue;
    const input = element instanceof HTMLInputElement ? element : null;
    if (input && (input.type === "hidden" || input.type === "range")) continue;
    // A link counts when it looks like a button: with a border, or filled with text of 14 px or more. A small tag in the text does not.
    if (element instanceof HTMLAnchorElement) {
      const filled = style.backgroundColor !== "rgba(0, 0, 0, 0)" && parseFloat(style.fontSize) >= 14;
      if (parseFloat(style.borderTopWidth) === 0 && !filled) continue;
    }
    // A box or a round option is hit through its label.
    const target = input && (input.type === "checkbox" || input.type === "radio") ? (input.closest("label") ?? input) : element;
    const height = target.getBoundingClientRect().height;
    if (height < control) {
      const name = (element.innerText || input?.name || "").trim().replace(/\s+/g, " ").slice(0, 30);
      small.push(`${element.tagName.toLowerCase()}${input ? `[${input.type}]` : ""} "${name}" ${Math.round(height)} px`);
    }
  }
  const root = document.documentElement;
  return { overflowX: root.scrollWidth - root.clientWidth, screens: Math.round((root.scrollHeight / root.clientHeight) * 100) / 100, small };
}

test("telas: cabem na largura, controles com 44 px e nenhum erro, nos cinco tamanhos", async ({ page }, testInfo) => {
  const errors: string[] = [];
  let current = "";
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${current}: ${message.text().slice(0, 300)}`);
  });
  page.on("pageerror", (error) => errors.push(`${current}: ${error.message.slice(0, 300)}`));
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${current}: ${response.status()} ${new URL(response.url()).pathname}`);
  });

  await signIn(page);
  const paths = await discover(page);
  expect(paths.length, "o menu leva a telas").toBeGreaterThan(20);

  const report: (Measure & { path: string; size: string })[] = [];
  for (const path of paths) {
    for (const [width, height] of SIZES) {
      current = `${path} ${width}×${height}`;
      await page.setViewportSize({ width, height });
      await page.goto(path, { waitUntil: "networkidle" });
      const result = await page.evaluate(measure, CONTROL);
      report.push({ path, size: `${width}×${height}`, ...result });
      expect.soft(result.overflowX, `${current}: rolagem lateral`).toBeLessThanOrEqual(0);
      expect.soft(result.small, `${current}: controles abaixo de 44 px`).toEqual([]);
      if (width === 390 || width === 1440) {
        await page.screenshot({ path: testInfo.outputPath(`${path.slice(1).replace(/\//g, "_") || "inicio"}.${width}.png`), fullPage: true });
      }
    }
  }
  writeFileSync(testInfo.outputPath("telas.json"), JSON.stringify(report, null, 1));
  expect(errors, "erros no console ou respostas 5xx").toEqual([]);
});

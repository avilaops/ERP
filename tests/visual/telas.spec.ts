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
const kindOf = (path: string) => path.replace(/\/\d[^/?]*/g, "/:id");
/** What makes another screen at the same address: its tab or its step. Searches, filters and pages do not. */
const PARTS = ["ver", "aba", "etapa"];

/** The address of a link as a screen: the path and, of the query, only the part of the screen. */
function screenOf(href: string): string {
  const url = new URL(href, "http://erp");
  const parts = new URLSearchParams();
  for (const key of PARTS) {
    const value = url.searchParams.get(key);
    if (value) parts.set(key, value);
  }
  return parts.size > 0 ? `${url.pathname}?${parts}` : url.pathname;
}
const CONTROL = 43.5;

type Measure = { overflowX: number; screens: number; small: string[] };

async function signIn(page: Page): Promise<void> {
  await openScreen(page, "/dev/login");
  await page.click("button[value=DIRETORIA]");
  await page.waitForURL((url) => !url.pathname.startsWith("/dev/login"));
}

/**
 * The development server may restart itself while compiling the complete ERP
 * route graph on a small machine. Reopen only transiently interrupted
 * navigations; a real HTTP or rendering failure still reaches the assertions.
 */
async function openScreen(page: Page, path: string): Promise<string[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const issues: string[] = [];
    const onConsole = (message: { type(): string; text(): string }) => {
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) issues.push(message.text().slice(0, 300));
    };
    const onPageError = (error: Error) => issues.push(error.message.slice(0, 300));
    const onResponse = (response: { status(): number; url(): string; request(): { resourceType(): string } }) => {
      const resource = response.request().resourceType();
      if (response.status() >= 500 || (["script", "stylesheet", "font"].includes(resource) && response.status() >= 400)) {
        issues.push(`${response.status()} ${resource} ${new URL(response.url()).pathname}`);
      }
    };
    const onRequestFailed = (request: { resourceType(): string; url(): string; failure(): { errorText: string } | null }) => {
      const resource = request.resourceType();
      const failure = request.failure()?.errorText ?? "erro desconhecido";
      if (["script", "stylesheet", "font"].includes(resource) && failure !== "net::ERR_ABORTED") {
        issues.push(`${resource} não carregou: ${new URL(request.url()).pathname} (${failure})`);
      }
    };
    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("response", onResponse);
    page.on("requestfailed", onRequestFailed);
    try {
      const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
      if (response && response.status() >= 400) throw new Error(`${path}: HTTP ${response.status()}`);
      await page.locator("main").waitFor({ state: "visible", timeout: 30_000 });
      await page.locator('[role="status"][aria-label="Carregando página"]').waitFor({ state: "detached", timeout: 30_000 });
      await page.waitForFunction(
        () => getComputedStyle(document.documentElement).getPropertyValue("--control").trim() === "2.75rem" && document.fonts.status === "loaded",
        undefined,
        { timeout: 30_000 },
      );
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      return issues;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await page.waitForTimeout(1_000 * attempt);
    } finally {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("response", onResponse);
      page.off("requestfailed", onRequestFailed);
    }
  }
  throw lastError;
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
    await openScreen(page, path);
    const links = await page.$$eval("a[href^='/']", (anchors) => anchors.map((anchor) => anchor.getAttribute("href")!));
    for (const link of links.map(screenOf)) if (!OUTSIDE.test(link.split("?")[0]) && !seen.has(link)) queue.push(link);
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

  await signIn(page);
  const paths = await discover(page);
  expect(paths.length, "o menu leva a telas").toBeGreaterThan(20);

  const report: (Measure & { path: string; size: string })[] = [];
  for (const path of paths) {
    for (const [width, height] of SIZES) {
      current = `${path} ${width}×${height}`;
      await page.setViewportSize({ width, height });
      const navigationIssues = await openScreen(page, path);
      errors.push(...navigationIssues.map((issue) => `${current}: ${issue}`));
      const result = await page.evaluate(measure, CONTROL);
      report.push({ path, size: `${width}×${height}`, ...result });
      expect.soft(result.overflowX, `${current}: rolagem lateral`).toBeLessThanOrEqual(0);
      expect.soft(result.small, `${current}: controles abaixo de 44 px`).toEqual([]);
      {
        await page.screenshot({
          path: testInfo.outputPath(`${path.slice(1).replace(/[/?=&]/g, "_") || "inicio"}.${width}.png`),
          fullPage: true,
          caret: "initial",
        });
      }
    }
  }
  writeFileSync(testInfo.outputPath("telas.json"), JSON.stringify(report, null, 1));
  expect(errors, "erros no console ou respostas 5xx").toEqual([]);
});

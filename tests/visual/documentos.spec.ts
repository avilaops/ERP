import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const SIZES = [[360,640],[390,844],[430,932],[1366,768],[1440,900]] as const;

test("DOCUMENTOS: busca, leitura, fontes e controle de coleta nos cinco tamanhos", async ({ page }) => {
  await page.goto("/dev/login");
  await page.click("button[value=DIRETORIA]");
  await page.waitForURL(url=>!url.pathname.startsWith("/dev/login"));
  const measurements = [];
  for (const [width,height] of SIZES) {
    await page.setViewportSize({width,height});
    await page.goto("/documentos");
    await expect(page.getByRole("heading",{name:"Documentos",exact:true})).toBeVisible();
    await page.waitForTimeout(1500);
    const first = page.locator("#document-results article a").first();
    await expect(first).toBeVisible();
    const detail = await first.getAttribute("href");
    const paths = ["/documentos","/documentos/filtros","/documentos/filtros?etapa=2","/documentos/filtros?etapa=3",detail!,detail+"?aba=fonte",detail+"?aba=historico",detail+"?aba=schema","/documentos/coletas"];
    for (const path of paths) {
      await page.goto(path);
      await page.waitForTimeout(700);
      const measured = await page.evaluate(()=>{
        const main=document.querySelector("main")!;
        const small=[...main.querySelectorAll<HTMLElement>("a,button,input:not([type=hidden]),select,summary")].filter(e=>{
          const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=="hidden"&&r.height<43.5;
        }).map(e=>`${e.tagName}: ${e.textContent?.trim().slice(0,50)}`);
        return {overflow:document.documentElement.scrollWidth-innerWidth,small,pageHeight:document.documentElement.scrollHeight,viewport:innerHeight};
      });
      measurements.push({width,height,path,...measured});
      expect(measured.overflow,`${path} overflow ${width}`).toBeLessThanOrEqual(1);
      expect(measured.small,`${path} controles ${width}`).toEqual([]);
      expect(measured.pageHeight,`${path} altura ${width}`).toBeLessThanOrEqual(height+4);
    }
  }
  mkdirSync("test-results/documentos",{recursive:true});
  writeFileSync("test-results/documentos/medidas.json",JSON.stringify(measurements,null,2));
  await page.goto("/documentos");
  await page.getByLabel("Termo, código ou campo").fill("termo-inexistente-983749");
  await page.getByRole("button",{name:"Buscar",exact:true}).click();
  await expect(page.getByText(/Nenhum documento encontrado/)).toBeVisible();
});

test("DOCUMENTOS: original íntegro, sessão obrigatória, teclado e texto ampliado", async ({ page, request }) => {
  expect((await request.get("/api/documentos/1/original")).status()).toBe(401);
  await page.goto("/dev/login");
  await page.click("button[value=DIRETORIA]");
  await page.waitForURL(url=>!url.pathname.startsWith("/dev/login"));
  await page.goto("/documentos");
  const detail=await page.locator("#document-results article a").first().getAttribute("href");
  await page.goto(detail+"?aba=fonte");
  const expectedHash=(await page.getByText(/^SHA-256:/).innerText()).replace("SHA-256: ","");
  const original=await page.getByRole("link",{name:"Baixar original"}).getAttribute("href");
  const response=await page.context().request.get(original!);
  expect(response.status()).toBe(200);
  expect(createHash("sha256").update(await response.body()).digest("hex")).toBe(expectedHash);
  expect(response.headers()["content-disposition"]).toContain("attachment;");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  await page.setViewportSize({width:720,height:640});
  await page.goto("/documentos/filtros");
  await page.evaluate(()=>{document.documentElement.style.fontSize="200%";});
  await expect(page.getByRole("combobox",{name:"Coleção",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole("combobox",{name:"Coleção",exact:true}).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox",{name:"Formato",exact:true})).toBeFocused();
});

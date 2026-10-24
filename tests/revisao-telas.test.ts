import { test } from "node:test";
import assert from "node:assert/strict";
import { controleBaixo, esperarTelaPronta, visitar, faltasDeCobertura, NavegacaoFalhou, VIEWPORTS, MIN_CONTROLE } from "../docs/revisao-telas/medir.mjs";

test("capturas usam os cinco tamanhos do docs/ux.md", () => {
  assert.deepEqual(
    VIEWPORTS.map((v: { width: number; height: number }) => `${v.width}×${v.height}`),
    ["360×640", "390×844", "430×932", "1366×768", "1440×900"],
  );
});

test("controle abaixo de 44 px conta como defeito; 44 px passa", () => {
  assert.equal(MIN_CONTROLE, 44);
  assert.deepEqual([39, 40, 43, 44].map((h) => controleBaixo(h)), [true, true, true, false]);
  assert.equal(controleBaixo(0), false);
});

const pagina = (goto: () => Promise<unknown>) => ({
  goto,
  locator: () => ({ waitFor: () => Promise.resolve() }),
  waitForFunction: () => Promise.resolve(),
  evaluate: () => Promise.resolve(),
});
const resposta = (status: number) => ({ status: () => status });

test("navegação que falha interrompe a medição da rota", async () => {
  await assert.rejects(visitar(pagina(() => Promise.reject(new Error("net::ERR_CONNECTION_REFUSED\nmais"))), "/x"), (e: Error) =>
    e instanceof NavegacaoFalhou && e.message === "/x: net::ERR_CONNECTION_REFUSED");
  await assert.rejects(visitar(pagina(() => Promise.resolve(null)), "/x"), NavegacaoFalhou);
  await assert.rejects(visitar(pagina(() => Promise.resolve(resposta(404))), "/nao-existe"), /status 404/);
  await assert.rejects(visitar(pagina(() => Promise.resolve(resposta(500))), "/x"), /status 500/);
  assert.equal((await visitar(pagina(() => Promise.resolve(resposta(200))), "/x")).status(), 200);
});

test("captura espera conteúdo final, CSS, fontes e duas pinturas", async () => {
  const chamadas: string[] = [];
  const page = {
    locator: (seletor: string) => ({
      waitFor: ({ state }: { state: string }) => {
        chamadas.push(`${seletor}:${state}`);
        return Promise.resolve();
      },
    }),
    waitForFunction: () => {
      chamadas.push("css-e-fontes");
      return Promise.resolve();
    },
    evaluate: () => {
      chamadas.push("duas-pinturas");
      return Promise.resolve();
    },
  };
  await esperarTelaPronta(page);
  assert.deepEqual(chamadas, [
    "main:visible",
    '[role="status"][aria-label="Carregando página"]:hidden',
    "css-e-fontes",
    "duas-pinturas",
  ]);
});

test("cobertura exige cada rota uma vez em cada tamanho", () => {
  const rotas = ["/a", "/b"];
  const completo = VIEWPORTS.flatMap((v: { nome: string }) => rotas.map((path) => ({ vp: v.nome, path })));
  assert.deepEqual(faltasDeCobertura(completo, rotas), []);
  const semUma = completo.filter((r: { vp: string; path: string }) => !(r.vp === "360x640" && r.path === "/b"));
  assert.deepEqual(faltasDeCobertura(semUma, rotas), ["360x640 /b: 0 registro(s)"]);
  assert.deepEqual(faltasDeCobertura([...completo, completo[0]], rotas), ["360x640 /a: 2 registro(s)"]);
});

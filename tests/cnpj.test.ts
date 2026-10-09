import assert from "node:assert/strict";
import { test } from "node:test";
import { CnpjError, companySummary, lookupCnpj } from "@/lib/cnpj";

const ANSWER = {
  cnpj: "66058955000108", razao_social: "  LUDUS EQUIPAMENTOS   PARA MUSCULACAO LTDA ", nome_fantasia: "", descricao_situacao_cadastral: "ATIVA", cnae_fiscal_descricao: "Comércio atacadista de outros equipamentos",
  porte: "DEMAIS", data_inicio_atividade: "2026-04-02", descricao_tipo_de_logradouro: "RUA", logradouro: "COPACABANA", numero: "4108", complemento: "", bairro: "PARQUE SANTA FELICIA", municipio: "VOTUPORANGA", uf: "SP",
  cep: "15505058", ddd_telefone_1: "1797218555", email: null, qsa: [{ nome_socio: "FULANO DE TAL", cnpj_cpf_do_socio: "***123456**" }],
};
const answering = (status: number, body: unknown, calls: string[] = []) => async (url: string, init: { headers: Record<string, string> }) => {
  calls.push(url);
  // O serviço público recusa (403) quem não diz quem é: a identificação do ERP vai em toda consulta.
  assert.match(init.headers["User-Agent"], /^ERP-Avila-Ops\//);
  return { status, json: async () => body };
};

test("consulta de CNPJ: só o CNPJ sai do servidor, e volta a empresa, campo a campo, sem os sócios", async () => {
  const calls: string[] = [];
  const record = await lookupCnpj("66.058.955/0001-08", answering(200, ANSWER, calls));
  assert.deepEqual(calls, ["https://brasilapi.com.br/api/cnpj/v1/66058955000108"]);
  assert.deepEqual(record, {
    cnpj: "66058955000108", legalName: "LUDUS EQUIPAMENTOS PARA MUSCULACAO LTDA", tradeName: null, status: "ATIVA", activity: "Comércio atacadista de outros equipamentos", size: "DEMAIS", openedOn: "2026-04-02",
    street: "RUA COPACABANA", number: "4108", complement: null, district: "PARQUE SANTA FELICIA", city: "VOTUPORANGA", uf: "SP", cep: "15505058", phone: "1797218555", email: null,
  });
  // Nada de pessoa física vem junto: nem nome nem documento de sócio.
  assert.ok(!JSON.stringify(record).includes("FULANO"));
  assert.equal(companySummary(record), "Situação na Receita: ATIVA · Comércio atacadista de outros equipamentos · VOTUPORANGA/SP · aberta em 02/04/2026");
});

test("consulta de CNPJ: número inválido não é consultado; o que volta estranho é descartado; falha diz o que fazer", async () => {
  const calls: string[] = [];
  for (const typed of ["", "123", "66.058.955/0001-09", "11111111111111", "66058955000108; drop"]) {
    await assert.rejects(() => lookupCnpj(typed, answering(200, ANSWER, calls)), (error: unknown) => error instanceof CnpjError && /CNPJ inválido/.test(error.message), typed);
  }
  assert.deepEqual(calls, []);
  await assert.rejects(() => lookupCnpj("66058955000108", answering(404, {})), /não encontrado na Receita/);
  await assert.rejects(() => lookupCnpj("66058955000108", answering(503, {})), /fora do ar/);
  await assert.rejects(() => lookupCnpj("66058955000108", async () => { throw new Error("ETIMEDOUT"); }), /não respondeu/);
  await assert.rejects(() => lookupCnpj("66058955000108", answering(200, { razao_social: "" })), /sem os dados da empresa/);
  // Campo com forma inesperada vira vazio, nunca texto solto na tela.
  const odd = await lookupCnpj("66058955000108", answering(200, { ...ANSWER, uf: "São Paulo", cep: "abc", ddd_telefone_1: "<script>", email: "sem-arroba", data_inicio_atividade: "ontem", numero: 4108, razao_social: "X".repeat(400) }));
  assert.deepEqual([odd.uf, odd.cep, odd.phone, odd.email, odd.openedOn, odd.number, odd.legalName.length], [null, null, null, null, null, null, 150]);
});

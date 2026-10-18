import assert from "node:assert/strict";
import { test } from "node:test";
import { compactDocumentSearch, listHref, orderDocumentSearch, parseListQuery } from "@/lib/list-query";

const OPTIONS = {
  sorts: ["nome", "cadastro"] as const,
  defaultSort: "nome",
  filters: {
    tipo: ["PJ", "PF", "EX"] as const,
    situacao: ["ativo", "inativo"] as const,
  },
};

test("consulta de lista: normaliza busca, página, quantidade, ordenação e filtros permitidos", () => {
  assert.deepEqual(
    parseListQuery(
      {
        q: "  Cliente Ávila  ",
        pagina: "7",
        porPagina: "50",
        ordenar: "cadastro",
        direcao: "desc",
        tipo: "PJ",
        situacao: ["ativo", "inativo", "apagado"],
      },
      OPTIONS,
    ),
    {
      search: "Cliente Ávila",
      page: 7,
      pageSize: 50,
      sort: "cadastro",
      direction: "desc",
      filters: { tipo: ["PJ"], situacao: ["ativo", "inativo"] },
    },
  );
});
test("consulta de lista: lixo volta aos padrões seguros e limites impedem URLs abusivas", () => {
  const parsed = parseListQuery(
    {
      q: "x".repeat(400),
      pagina: "2; drop table",
      porPagina: "3000",
      ordenar: "senha",
      direcao: "lado",
      tipo: "desconhecido",
    },
    OPTIONS,
  );
  assert.deepEqual(parsed, {
    search: "x".repeat(120),
    page: 1,
    pageSize: 25,
    sort: "nome",
    direction: "asc",
    filters: {},
  });

  for (const value of ["10", "25", "50", "100"]) {
    assert.equal(parseListQuery({ porPagina: value }, OPTIONS).pageSize, Number(value));
  }
});

test("endereço de lista: preserva critérios, reseta página quando a consulta muda e omite padrões", () => {
  const query = parseListQuery(
    { q: "Ludus", pagina: "4", porPagina: "50", ordenar: "cadastro", direcao: "desc", tipo: "PJ", situacao: ["ativo", "inativo"] },
    OPTIONS,
  );

  assert.equal(
    listHref("/clientes", query, { page: 5 }, OPTIONS),
    "/clientes?q=Ludus&pagina=5&porPagina=50&ordenar=cadastro&direcao=desc&tipo=PJ&situacao=ativo&situacao=inativo",
  );
  assert.equal(
    listHref("/clientes", query, { search: "Academia" }, OPTIONS),
    "/clientes?q=Academia&porPagina=50&ordenar=cadastro&direcao=desc&tipo=PJ&situacao=ativo&situacao=inativo",
  );
  assert.equal(listHref("/clientes", parseListQuery({}, OPTIONS), {}, OPTIONS), "/clientes");
  assert.equal(listHref("/clientes", query, { search: "", filters: {}, pageSize: 25, sort: "nome", direction: "asc" }, OPTIONS), "/clientes");
});

test("documentos: preserva letras do CNPJ e não confunde código curto de pedido", () => {
  assert.equal(compactDocumentSearch("12.ABC.345/0001-90"), "12ABC345000190");
  assert.equal(orderDocumentSearch("1234"), "1234");
  assert.equal(orderDocumentSearch("12.ABC.345/0001-90"), "12ABC345000190");
  assert.equal(orderDocumentSearch("DM09"), "");
});

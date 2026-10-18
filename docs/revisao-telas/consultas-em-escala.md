# Consultas em escala

Revisão de 18/10/2026 para Clientes, Pedidos, Produtos e custos, Fornecedores e Revisar publicação.

## Massa e arquitetura

- Massa local reproduzível: 3.000 clientes, pedidos, equipamentos e fornecedores.
- Paginação, busca, filtros e ordenação são executados no PostgreSQL.
- Quantidades por página: 10, 25, 50 ou 100; padrão 25.
- Salto direto, anterior, próxima e limpeza de critérios preservam os demais parâmetros.
- Não foi criado schema adicional nem usado `pgvector`: são consultas relacionais e os planos medidos ficaram abaixo de 4 ms com 3.000 registros.
- A publicação de preços ganhou uma etapa de revisão de inclusões, remoções, custos, cadastro e regras antes da ação irreversível.
- A revisão também é paginada no PostgreSQL. A confirmação leva uma revisão do rascunho e é recusada se produto ou regra mudar antes da publicação.

## Sete perguntas

1. A tarefa principal aparece no título e a consulta começa na primeira dobra.
2. Pelo menos um registro utilizável aparece na primeira área visível em todas as medidas testadas.
3. Cada tela mantém uma ação principal; publicar exige primeiro revisar.
4. As telas foram medidas em 360×640, 390×844, 430×932, 956×440, 1366×768 e 1440×900.
5. Filtros, paginação avançada, indicadores e ferramentas secundárias têm nomes claros e ficam recolhidos quando não são necessários.
6. Os parâmetros ficam na URL; trocar página ou quantidade preserva busca, filtros e ordenação.
7. Controles mantêm 44 px, nomes quebram sem corte e as operações essenciais têm rótulo acessível.

## Evidências

- Validação local final: 787 testes aprovados, sem falhas ou pulos; lint, tipos, `git diff --check` e build de produção aprovados.
- Teste: `tests/visual/consultas-em-escala.spec.ts`.
- Resultado: 30 combinações aprovadas, sem rolagem lateral, sem paginação sob a barra, com abas e filtros acessíveis em paisagem e com no máximo 100 registros no HTML.
- Capturas: `test-results/telas/consultas-em-escala-consul-ddcb2-lume-renderizado-e-paisagem/`.
- Lighthouse de `/clientes` no build de produção, três execuções: desempenho 93/95/94, TBT 125/76,5/93,5 ms e resposta do servidor 78/54/63 ms. Medianas: 94, 93,5 ms e 63 ms.

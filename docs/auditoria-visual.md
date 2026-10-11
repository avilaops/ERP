# Auditoria visual das telas

Capturas de 54 telas (perfil Diretoria, empresa Ludus, banco recém-migrado, **sem dados**) em
390×844 e 1440×900. Contact sheets em `docs/auditoria-visual/` (`mob*.jpg`, `desk*.jpg`).
Medições automáticas: `scripts/capturar-telas.mjs`.

Limite desta rodada: com o banco vazio, Dashboard, listas e relatórios aparecem só em estado
vazio. Telas de detalhe (`/pedidos/[numero]`, `/clientes/[id]`, `/produtos/[id]`, `/funil/[id]`…)
não foram capturadas por falta de registros. `/producao/*` responde "Sem acesso" porque o módulo
está desligado para a empresa (esperado).

## Resultado das medições

Sem erro de console nem resposta HTTP >= 400 em nenhuma das 54 telas.

| Achado | Onde | Medido |
| --- | --- | --- |
| Overflow horizontal no celular | `/parametros/linhas`: o `<select>` "De onde vem" (opções longas) estoura os 390 px | `scrollWidth` > `clientWidth` |
| Controles abaixo de 44 px (`docs/ux.md`) | Menu lateral do desktop: 40 px por item, em todas as telas | 23+ itens por tela |
| | Celular: `/parametros/fiscal` (62), `/parametros/categorias-de-contas` (78), `/parametros/formas-de-pagamento` (57), `/equipe/nova` (24), `/equipe/perfis` (15), `/contas-pagar` (12), `/fornecedores` (14) | botões "Salvar"/"Adicionar", selects e checkboxes |
| Menu lateral maior que a janela | Em 1440×900 o menu tem 985 px de conteúdo em 864 px de área; "Equipe e acessos" e o seletor de tema só aparecem rolando o menu (a rolagem própria funciona, `overflow-y: auto`) | 985/864 |
| Telas de parâmetros longas no celular | `/parametros/fiscal` 6468 px, `/parametros/categorias-de-contas` 4197 px, `/parametros/contrato` 2894 px, `/parametros/formas-de-pagamento` 2739 px | 3 a 7 telas de rolagem; fere "uma tela, uma tarefa" |

## O que melhorar visualmente

1. **`/parametros/linhas` no celular**: `select` com `w-full min-w-0` e opção curta ("Importada") com a explicação em texto abaixo.
2. **Menu lateral**: item com `min-h-[var(--control)]` (44 px) ou, se a densidade for intencional, registrar a exceção em `docs/ux.md`; fixar o seletor de tema fora da área rolável e agrupar itens pouco usados (Simulador, Equipe e acessos) para o menu caber em 900 px.
3. **Parâmetros longos** (fiscal, categorias, formas de pagamento, contrato): virar etapas (`?etapa=`) ou lista com `<details>` por item, como o próprio `docs/ux.md` manda.
4. **Linhas de edição em lista** (categorias, formas de pagamento): "Ordem", "Nome", "Em uso", "Salvar", "Remover" empilham em 5 linhas por item no celular; uma linha por item com "Editar" que abre o detalhe.
5. **Desktop com coluna estreita**: telas do funil (`nova`, `campanhas/nova`, `captura`, `conversas`, `tarefas`) usam ~700 px de 1440 e deixam o resto vazio; `Dashboard` usa a largura toda. Padronizar a largura máxima por tipo de tela.
6. **Estados vazios** são texto solto em cartão ("Nenhuma oportunidade nesta etapa"); trocar por título + uma ação ("Criar a primeira"), como já existe em Equipe e acessos.
7. **Dashboard sem dados**: gráfico "Vendas fechadas por mês" vira área em branco; mostrar mensagem "Sem vendas no período" em vez de eixo vazio.
8. **Aviso do WhatsApp** (`/funil/conversas`) e do e-mail (`/parametros/cadencias`, `/parametros/contrato`) em faixa amarela sem botão; incluir o link direto "Configurar".

## O que automatizar

1. **Teste de layout no CI**: rodar `scripts/capturar-telas.mjs` (ou um teste Playwright) nos cinco tamanhos de `docs/ux.md` e falhar em overflow horizontal, controle < 44 px e fonte < 12 px. Hoje `tests/ux.test.ts` não olha o resultado renderizado.
2. **Banco de demonstração**: um `db:seed-demo` (clientes, pedidos, contas, oportunidades) para que capturas, manual e auditoria mostrem telas reais, não vazias.
3. **Prints do manual**: `docs/manual/img/*.jpg` são gerados à mão; gerar pelo mesmo script a cada mudança de tela.
4. **Telas de detalhe**: com o seed, o script descobre os links das listas e captura também `/pedidos/[numero]`, `/clientes/[id]` etc.
5. **Regressão visual**: guardar as capturas aprovadas e comparar por diferença de pixels no PR.

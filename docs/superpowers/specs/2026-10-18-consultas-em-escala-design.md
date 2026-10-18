# Consultas em escala — design

**Data:** 2026-10-18

**Status:** aprovado em 18/10/2026

**Módulo:** consultas em escala para Clientes, Pedidos, Produtos e Fornecedores

## 1. Objetivo

Tornar as quatro listagens utilizáveis com aproximadamente 3.000 registros, sem
renderizar a base inteira, sem centenas de páginas de três itens e sem perder as
operações necessárias no celular.

O módulo termina quando as quatro telas compartilham o mesmo modelo de busca,
filtros, ordenação e paginação; carregam somente o recorte solicitado no banco;
funcionam nos cinco tamanhos obrigatórios; e possuem testes e capturas revisadas.

## 2. Diagnóstico confirmado

- `FitRows` reduz listas a três ou quatro registros conforme a altura disponível.
  Com 2.941 produtos e 3.000 fornecedores, isso cria 981 e 1.000 páginas.
- Clientes carrega e renderiza todos os clientes. A captura do Lighthouse registrou
  resposta inicial de 1.392 ms, TBT de 440 ms e desempenho 61.
- Pedidos, produtos e fornecedores carregam coleções amplas e fazem parte do
  filtro e da paginação em memória.
- O `Pager` oferece apenas anterior e próxima.
- Fornecedores não oferece busca nem filtros.
- As abas de pedidos quebram linha no celular.
- A tabela editável de produtos só é segura em telas largas; em largura
  intermediária ela corta campos e rótulos.
- A navegação inferior pode cobrir o paginador no celular.
- O menu lateral é ativado cedo demais para paisagem de baixa altura e consome
  espaço útil.
- A edição completa de produto já existe no detalhe, inclusive custo de
  assessoria, crédito tributário e embalagem, mas a listagem móvel não indica
  claramente esse caminho.
- A exclusão de produto já exige confirmação. O problema restante é a posição da
  ação destrutiva junto das ações rotineiras.
- A publicação de tabela já possui confirmação e resumo agregado. Falta uma
  revisão navegável das mudanças antes da confirmação.
- O atalho móvel `Preços` aponta para `/tabela-precos`; o código atual não confirma
  que ele leve a `Produtos e custos`. Essa alteração não será feita sem evidência
  reproduzível.

## 3. Recorte do módulo

### Incluído

1. Componente único de consulta para as quatro telas.
2. Paginação no servidor, quantidade por página e salto direto.
3. Busca, filtros, ordenação, limpeza e indicação de critérios ativos.
4. Layout responsivo das quatro listas e correção da navegação em paisagem.
5. Fluxo explícito de edição de produto no celular.
6. Apresentação financeira legível e revisão da publicação da tabela de preços.
7. Correções de desempenho diretamente relacionadas às listagens.
8. Testes de banco, rotas, componentes, acessibilidade e capturas nos cinco
   tamanhos obrigatórios.

### Fora deste módulo

- Compra até pagamento, estoque completo, conciliação, contabilidade e auditoria
  ponta a ponta. São fluxos funcionais independentes e serão validados em módulos
  próprios.
- Consultas salvas, seleção múltipla e ações em lote. Dependem primeiro do padrão
  estável de consultas criado aqui.
- `pgvector`. Busca textual e filtros relacionais não precisam de vetores.
- n8n. Não há efeito externo neste módulo; regras de consulta e paginação ficam no
  aplicativo e no PostgreSQL.
- Exclusão dos dados sintéticos. Eles permanecem como massa de validação até a
  aprovação visual e de desempenho.

## 4. Arquitetura de consulta

Cada repositório de dados passa a expor uma consulta paginada com o mesmo
contrato:

```ts
type ListQuery = {
  search?: string;
  filters?: Record<string, string | string[]>;
  sort?: string;
  direction?: "asc" | "desc";
  page: number;
  pageSize: 10 | 25 | 50 | 100;
};

type ListResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};
```

Busca, filtros e ordenação são aplicados em SQL antes de `LIMIT` e `OFFSET`. A
contagem total usa a mesma cláusula de seleção. Parâmetros inválidos voltam aos
valores seguros; uma página acima do limite é redirecionada para a última página
válida.

O padrão inicial é 25 itens por página. `FitRows` deixa de controlar essas quatro
listas e permanece disponível nas telas menores em que a quantidade dinâmica
ainda faça sentido.

Para cumprir `uma tela, uma tarefa, uma decisão`, cabeçalho, consulta e paginador
ficam na área útil; somente a região de resultados rola entre eles. Não há duas
rolagens concorrentes: nessas páginas o documento fica preso à área útil e a
lista é o único conteúdo rolável. No celular, cartões recebem foco e a rolagem
continua natural por toque. Assim, 25 resultados ficam acessíveis sem transformar
a base em mil páginas e sem empurrar o paginador sob a barra inferior.

Índices novos só serão criados após `EXPLAIN (ANALYZE, BUFFERS)` demonstrar ganho
nas consultas reais. Com 3.000 registros, criar índice por superstição seria só
decorar o banco.

As contagens de abas e os indicadores de pedidos usam agregações separadas. A
página recebe somente os registros exibidos e totais agregados; nunca toda a base.

## 5. Componente padrão de consulta

Será criado um conjunto compartilhado, composto pelas peças existentes de
`src/components/ui.tsx`:

- busca com rótulo específico por módulo;
- botão `Buscar` e ação `Limpar` quando houver critério ativo;
- filtros em `details`/painel compacto, com quantidade ativa visível;
- ordenação explícita;
- contador `X–Y de Z`;
- seletor `10, 25, 50 ou 100 por página`;
- campo `Ir para a página`;
- anterior e próxima, com estados desabilitados claros;
- parâmetros mantidos ao trocar página, quantidade ou ordenação.

No celular, busca e ação principal cabem em uma linha quando houver espaço e
empilham sem cortar texto em 360 px. Os filtros ativos aparecem como `Pill` e
podem ser removidos individualmente.

## 6. Comportamento por tela

### Clientes

- Busca por nome, fantasia e CPF/CNPJ.
- Filtros por tipo de pessoa, UF e situação de compra (`com compra` ou `sem
  compra`). Compra significa pedido atualmente `fechado`, com fechamento ativo em
  `order_closings`; pedidos reabertos, cancelados, perdidos ou em negociação não
  contam. O total é histórico, usa `invoice_total`, e a última compra usa a data
  desse fechamento. Essa é a mesma regra já adotada no relatório de Clientes.
- Ordenação por nome, cadastro e última compra.
- Tabela no desktop e cartões no celular.
- Consulta paginada no servidor; nenhuma coleção completa é enviada ao HTML.

### Pedidos

- Busca por cliente, CPF/CNPJ e número.
- Filtro de situação continua representado por abas, em uma única linha rolável
  no celular.
- Ordenação por atualização, número, cliente e vendedor. Ordenação por total não
  entra neste módulo: pedidos abertos usam cálculo vivo e pedidos fechados usam o
  valor histórico do fechamento; misturá-los em uma ordenação única exigiria uma
  regra comercial nova ou materialização que o sistema não possui.
- O indicador passa a dizer o período, por exemplo `Fechados em outubro/2026`.
- A aba `Fechados` explicita `todos os períodos` quando esse for o escopo.
- O botão `+` do resumo financeiro vira uma ação textual, como `Ver indicadores`.

### Produtos e custos

- Busca por nome, código e fornecedor. `Importada` e `Nacional` continuam como
  seletor obrigatório da linha de produtos; não haverá um segundo filtro de
  origem. As abas existentes são o filtro de situação: `Ativos`, `Sem custo`,
  `Sem código` e `Inativos`, com contagens calculadas para a linha selecionada.
- O desktop largo mantém edição rápida de custos.
- Em largura intermediária e no celular, os registros viram cartões legíveis e
  mostram a ação `Editar custos e cadastro`, que abre o detalhe existente.
- O nome deixa de ser um campo estreito usado como rótulo.
- Percentuais são apresentados com duas casas decimais. A precisão armazenada não
  muda ao simplesmente abrir ou salvar outro campo; ela só muda quando o usuário
  editar o percentual.
- Rótulos compactados são substituídos por nomes completos ou ajuda contextual:
  custo real, preço sem IPI, preço com IPI e desconto máximo por regime.
- Ações destrutivas saem da linha principal e ficam em `Mais ações` ou no detalhe,
  preservando a confirmação já existente.
- `Publicar v7` vira `Revisar publicação v7`. A revisão usa as categorias que o
  ERP já calcula: parâmetros fiscais/desconto, custo/crédito/embalagem, inclusão,
  saída da tabela e nome/código. Para cada produto alterado mostra valor anterior
  e novo dos campos aplicáveis e também o efeito comercial derivado: custo real,
  preço sem IPI, preço com IPI e descontos máximos por regime. Para regras, mostra
  parâmetro anterior e novo e recalcula esses efeitos por produto. A lista da
  revisão também é paginada no servidor e pode ser filtrada por categoria e
  produto. A validação existente continua
  bloqueando rascunho sem equipamento ativo com custo; este módulo não inventa
  novos bloqueios comerciais. A publicação só aparece como decisão final dessa
  revisão.

### Fornecedores

- Busca por razão social, nome fantasia, CPF/CNPJ, contato e país.
- Filtros por tipo cadastral (`PJ`, `PF` ou `Exterior`), país e situação. Não será
  criado campo de categoria, pois ele não existe no cadastro atual.
- Ordenação por nome e cadastro.
- Mesma paginação e limpeza das demais listas.
- Tabela no desktop e cartões no celular.

## 7. Responsividade

- O menu lateral permanente começa somente em telas grandes. Tablets e paisagem
  curta usam navegação compacta para não perder um quarto da largura.
- A navegação inferior reserva espaço real no fluxo da página; nenhum paginador ou
  botão fica sob ela.
- Tabelas só aparecem quando todas as colunas essenciais cabem. Abaixo desse ponto
  são usados cartões, não rolagem horizontal nem texto cortado.
- Abas permanecem em uma linha com rolagem horizontal e indicação visual de
  continuidade.
- Nenhuma solução reduz fonte, área de toque ou esconde conteúdo com
  `overflow: hidden`.

## 8. Estados e erros

- Estado vazio diferencia `nenhum cadastro` de `nenhum resultado para os filtros`.
- Falha de consulta mantém os critérios na URL e oferece nova tentativa.
- Busca ignora espaços externos e aceita CPF/CNPJ com ou sem pontuação.
- Mudança de filtro, busca, ordenação ou quantidade retorna à página 1.
- Exclusão do último item de uma página retorna à página anterior válida.
- Contagens e páginas são recalculadas depois de alterações.

## 9. Desempenho

Critérios de aceitação na massa atual:

- HTML inicial contém no máximo a quantidade solicitada de linhas por lista.
- Nenhuma consulta de listagem retorna os 3.000 registros para paginar em memória.
- Navegação entre páginas não executa cálculos de preço ou agregações fora do
  escopo necessário.
- Lighthouse mobile de Clientes: desempenho mínimo 85, TBT abaixo de 200 ms e
  resposta inicial abaixo de 800 ms. O gate reproduzível usa `next build` e
  `next start`, PostgreSQL com a massa sintética atual, Chrome sem extensões,
  perfil mobile do Lighthouse e mediana de três execuções consecutivas na mesma
  máquina. Depois do deploy, a mesma rota autenticada é medida novamente em
  produção; essa medição confirma a publicação e registra eventual diferença de
  infraestrutura, sem substituir o gate local.
- Sem regressão nas demais notas obrigatórias de acessibilidade e boas práticas.

## 10. Validação

### Automatizada

- Testes unitários para normalização de parâmetros, contagem de páginas e
  preservação de query string.
- Testes de banco para busca, filtros, ordenação, limites e páginas inválidas.
- Testes de rota comprovando que somente a página solicitada é renderizada.
- Testes do fluxo de edição de produto no celular e da revisão de publicação.
- Build, lint, typecheck e suíte completa.

### Visual

Cada uma das quatro telas será medida e capturada em:

- 360×640;
- 390×844;
- 430×932;
- 1366×768;
- 1440×900.

Também será testado 956×440 para reproduzir a paisagem reportada. As sete
perguntas de `docs/ux.md` serão respondidas no relatório de validação.

### Publicação

Não haverá commit ou push intermediário. Depois de implementação, documentação,
revisão estática, testes e capturas locais, será feito o primeiro commit e push do
módulo completo. CI, artefatos visuais e produção serão verificados separadamente;
merge não será tratado como prova de publicação.

## 11. Critérios de conclusão

- As quatro telas usam o mesmo padrão de consulta.
- Nenhuma delas pagina a coleção completa em memória.
- A quantidade padrão é 25 e pode ser alterada.
- Há salto direto, busca, limpeza, filtros ativos e ordenação.
- Produtos podem ser editados no celular por um caminho explícito.
- Não há sobreposição, corte financeiro ou linha de abas quebrada nos tamanhos
  obrigatórios.
- A publicação da tabela passa por revisão antes da confirmação.
- Os critérios de desempenho e todos os testes estão verdes.
- As capturas foram inspecionadas antes do commit e do push.

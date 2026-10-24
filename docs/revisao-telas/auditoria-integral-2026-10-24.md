# Auditoria integral das capturas de tela — 24/10/2026

## Reexecução aprovada

Depois da correção do capturador, a varredura descobriu 151 rotas ou estados funcionais e
produziu 755 capturas finais nos cinco tamanhos obrigatórios. O teste terminou com
`.last-run.json` em `passed`.

| Verificação | Resultado |
| --- | ---: |
| Capturas finais | 755 |
| Rotas ou estados funcionais | 151 |
| Tamanhos por rota | 5 |
| Rolagens horizontais | 0 |
| Controles abaixo de 44 px | 0 |
| Skeletons persistentes | 0 |
| Falhas de CSS, fonte ou chunk | 0 |
| Erros de página ou recurso | 0 |

Foram inspecionadas amostras representativas em todos os tamanhos, incluindo
`parametros_cadencias.1366.png`, que agora contém o conteúdo final com a folha de estilos,
e telas alteradas de Painel, Produtos e custos e Equipe e acessos. A suíte específica do menu
também passou nos cinco tamanhos, com foco contido, `Tab`, `Shift+Tab`, `Escape` e `inert`.

### Sete perguntas de `docs/ux.md` na reexecução

1. Tarefa principal clara: sim nas amostras inspecionadas.
2. Informação de decisão na primeira dobra: sim nas telas alteradas; conteúdo extenso usa
   etapas, abas, detalhes ou paginação.
3. Uma ação principal: sim; ações secundárias mantêm peso visual menor.
4. Cabe nos cinco tamanhos: sim, sem rolagem horizontal e sem controle abaixo de 44 px.
5. Conteúdo excedente com caminho claro: sim, por etapas, abas, detalhes e paginação.
6. Preservação ao navegar: sim nos fluxos funcionais cobertos pela suíte de harmonização.
7. Teclado, zoom e texto ampliado: menu validado por teclado; cadastro validado com texto a
   200% e contraste nos temas claro e escuro.

## Execução inicial rejeitada

## Escopo

- 735 capturas PNG.
- 147 rotas ou estados funcionais.
- Cinco tamanhos: 360×640, 390×844, 430×932, 1366×768 e 1440×900.
- Revisão visual dos 30 painéis de contato, com 25 capturas por painel.
- Inspeção individual das anomalias representativas.

### Resultado inicial

O conjunto não pode ser aprovado como evidência visual.

| Classe | Quantidade | Resultado |
| --- | ---: | --- |
| Skeleton persistente | 267 | Inválida para avaliação da tela final |
| Página sem CSS | 1 | Falha visual crítica |
| Potencialmente avaliável | 467 | Exige nova captura consistente para aceite |

A detecção de skeleton foi conservadora, baseada na composição visual repetida do componente
de carregamento. Há capturas limítrofes adicionais; portanto, 467 é o máximo potencialmente
avaliável, não uma contagem de telas aprovadas.

O arquivo `.last-run.json` registra `failed`. A alternância entre conteúdo final e skeleton
ocorre em desktop e celular, inclusive entre tamanhos da mesma rota. Isso invalida comparações
responsivas: a evidência está medindo o momento da captura, não apenas o layout.

`parametros_cadencias.1366.png` foi capturada sem a folha de estilos, com controles e links no
estilo padrão do navegador.

### Comparação com software corporativo

Nas capturas que chegaram ao conteúdo final, o ERP apresenta uma base corporativa coerente:

- navegação agrupada por área de negócio;
- títulos e ações previsíveis;
- estados comunicados por texto e cor;
- valores monetários legíveis;
- paginação nas listas operacionais;
- formulários com rótulos permanentes;
- adaptação de tabelas para cartões no celular.

Os bloqueios para considerar o conjunto maduro são:

1. Evidência instável: 267 capturas mostram carregamento em vez do estado final.
2. Falha de recursos: Cadências aparece sem CSS em 1366×768.
3. Densidade móvel irregular: algumas telas fiscais, parâmetros, preços e detalhes de pedido
   concentram muitos campos e decisões na mesma etapa.
4. Consistência não demonstrada: a mesma rota aparece pronta em um tamanho e incompleta em outro.
5. O teste terminou com falha; ausência de overflow horizontal não compensa página não carregada.

### Sete perguntas de `docs/ux.md` na execução inicial

1. Tarefa principal clara: sim nas capturas finalizadas; não verificável nas capturas de skeleton.
2. Informação de decisão na primeira dobra: parcial; telas longas de configuração e pedido
   ainda concentram informação além da primeira dobra.
3. Uma ação principal: geralmente sim; há estados com várias ações de peso semelhante.
4. Cabe nos cinco tamanhos: não comprovado, pois os cinco tamanhos não chegaram de forma
   consistente ao estado final.
5. Conteúdo excedente com caminho claro: geralmente sim, por abas, detalhes e paginação.
6. Preservação ao navegar: não pode ser determinada por screenshots estáticos.
7. Teclado, zoom e texto ampliado: não pode ser determinada por screenshots estáticos.

### Critérios aplicados na reexecução

- esperar o desaparecimento do skeleton antes de medir e capturar;
- falhar quando a página continuar no estado de carregamento após o limite definido;
- falhar quando CSS, fontes ou chunks da aplicação não carregarem;
- preservar uma captura final por rota e tamanho somente depois das verificações;
- repetir os cinco tamanhos para todas as 147 rotas;
- inspecionar os novos artefatos antes de commit, push ou merge.

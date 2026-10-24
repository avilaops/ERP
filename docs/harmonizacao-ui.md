# Harmonização da interface

## Direção

Aplicar hierarquia, legibilidade, navegação previsível e acessibilidade das Human Interface
Guidelines à aplicação web, mantendo a identidade Ludus, as fontes locais e as permissões.
Os 44 CSS px e a regra de uma tarefa por tela pertencem ao ERP; não são uma conversão
física de pontos do iOS nem uma certificação Apple.

Referências: [Layout](https://developer.apple.com/design/human-interface-guidelines/layout),
[Typography](https://developer.apple.com/design/human-interface-guidelines/typography),
[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility),
[Color](https://developer.apple.com/design/human-interface-guidelines/color) e
[Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars).

## Contratos compartilhados

- `CARD`, `INPUT`, `PRIMARY`, `SECONDARY`, `PageHeader` e `Pager`: uma única base de aparência.
- `ViewTabs` e `.view-tabs`: visões irmãs com seleção sublinhada, distintas da ação principal.
- `SectionDisclosure`: instruções e ferramentas secundárias com nome explícito.
- `MetricSummary`: dois indicadores na primeira dobra, demais informações sob demanda.
- `FormSections`: grupos de campos permanecem visíveis e são enviados juntos; erro do
  `ActionForm` revela todos os grupos para correção, sem descartar o preenchimento.
- `FitRows`: considera somente linhas visíveis, reserva moldura e paginação e aceita um
  cookie por família. Usa a maior linha fechada como referência, respeitando nomes longos.
- Acabamentos usam a mesma amostra ilustrativa no seletor do pedido e na configuração;
  o nome continua sendo a identificação, inclusive quando não há amostra cadastrada.

Tokens `--control`, `--topbar` e `--tabbar` preservam o contrato de layout. `--action-ink`
separa o texto de ações da cor do link, sobretudo no escuro. `--field-border` identifica
os controles nos dois temas. Superfícies têm raio de 12 px e controles mantêm 8 px.
Movimento reduzido, foco visível e um atalho para o conteúdo fazem parte da moldura.

## Aplicação

- Pedido: uma parte por vez também no desktop, seletor móvel sem faixa cortada,
  histórico de navegação e campos preservados ao alternar; PDF e proposta usam `SECONDARY`.
- Cores: lista paginada por Estrutura/Braço, um formulário de edição por vez, confirmação
  de gravação e manutenção das escolhas em pedidos anteriores.
- Financeiro: indicadores compactos, paginação de contas/comissões e recebimentos,
  pagamento e estorno expandidos quando necessários; regras financeiras preservadas.
- Cadastros: cliente, fornecedor, oportunidade e pessoa em grupos; permissões continuam
  vindo das verificações do servidor.
- Configurações: regras fiscais e contrato em grupos; ICMS por estado em blocos de três,
  mantendo todos os valores no formulário. Nenhum código ou alíquota é inventado.
- Catálogo: ferramentas secundárias recolhidas, busca e produto com maior prioridade.
- Relatórios: linhas móveis com resumo e detalhes; tabela no desktop; período e exportação
  preservados. A paginação não limita os dados exportados.
- Funil, produção e demais listas: nomes completos em lugar de reticências; estados e
  abas usam os mesmos contratos de tipografia e interação.
- Menu, títulos e manual usam Painel e Configurações para os mesmos destinos.

## Sete perguntas de revisão

| Pergunta | Critério de aceite |
|---|---|
| Tarefa clara? | Título e conteúdo inicial identificam a decisão. |
| Informação decisiva visível? | Identificação, valor e estado têm prioridade; indicadores complementares são expansíveis. |
| Ação principal clara? | Uma ação primária por contexto; ações de pagamento, publicação e permissão mantêm validação e confirmação. |
| Funciona nos cinco tamanhos? | Medir a página em 360×640, 390×844, 430×932, 1366×768 e 1440×900, sem rolagem lateral. A rolagem vertical mantém todas as seções alcançáveis. |
| Excedente alcançável? | Seções visíveis, detalhes, ferramentas e paginação com nomes claros. |
| Preserva preenchimento? | Testar envio, voltar no navegador e erros de validação em formulários reais de demonstração. |
| Teclado e ampliação? | Testar foco, seletores nativos e texto a 200%; VoiceOver/Safari real exige validação adicional. |

## Verificação

`npm run typecheck`, `npm run lint` e `npm test` verificam tipos, convenções, permissões e
regras de negócio. Testes de banco exigem banco isolado terminado em `_test`.

`tests/visual/harmonizacao.spec.ts` cobre preservação de dados, histórico do pedido,
retorno de gravação, contraste da ação principal nos dois temas e captura dos formulários completos.
`menu.spec.ts`, `cores-pedido.spec.ts` e `telas.spec.ts` complementam navegação, gravação
das escolhas e varredura das rotas descobertas nos cinco tamanhos.

As imagens e medições usam dados de demonstração. Uma imagem de CI não comprova produção,
envio de mensagens, emissão fiscal, assinatura de cliente ou VoiceOver. O resultado da
varredura e suas pendências devem acompanhar a revisão entregue, sem declarar conformidade
integral a partir de screenshots.

Um teste de assinatura usava um contrato enviado em 09/10/2026, vencendo conforme o
calendário avançava. A fixture agora usa a data atual e validade relativa do certificado;
nenhuma regra de assinatura em produção foi alterada por essa correção de teste.

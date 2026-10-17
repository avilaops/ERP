# Correções financeiras após teste pela UI — 16/10/2026

## Versão e limites

Commit `c710ac1`, branch `codex/fiscal-setup`, [PR #14](https://github.com/avilaops/ERP/pull/14).
Fontes alteradas no worktree gerenciado, sem misturar as alterações do checkout principal.
Repetição na base fictícia `erp_e2e_demo`, mesmo pedido `261016-C4HQ` do relatório anterior.
Nenhum recebimento, estorno, comissão, assinatura ou documento fiscal real foi alterado.

## Regressão pela interface

| Caso | Resultado |
| --- | --- |
| NIC-24: baixa acima do saldo | Detalhe permanece aberto, erro junto do formulário e data, valor, forma e observação preservados |
| NIC-24: alternativa sem JavaScript | Mesmo resultado no POST nativo; scripts restaurados após teste |
| NIC-24: sucesso parcial | R$ 1 fictício sobre R$ 29.756,28 reduz para R$ 29.755,28; formulário sugere o novo saldo e limpa observação |
| Estorno da parcial | Financeiro solicita; Diretoria confirma; saldo volta a R$ 29.756,28 e comissão de R$ 0,02 é revertida |
| NIC-25: cartão de Comissões | R$ 53.382,98 líquidos sem IPI; comissão total do mês R$ 1.067,66; vendedor do cenário R$ 323,18, com R$ 163,89 em aberto |
| NIC-26: relatório filtrado em 16/10 | Previsto R$ 9.000, recebido R$ 9.000, aberto R$ 0; antes recebido incorreto de R$ 15.000 |
| NIC-26: CSV | Linha da entrada exportada com `9000,00;9000,00;Recebida` |
| NIC-27: Financeiro | Referências mostram nome e número sem oferecer links para Pedidos; permissão comercial não ampliada |
| NIC-27: Diretoria | Links comerciais continuam disponíveis, inclusive na solicitação de estorno |

CSV corrigido baixado pela UI: `C:/Users/nicol/Downloads/relatorio-recebimentos-2026-10-16 (2).csv`.
A inspeção anterior de NF-e, contrato, parcelas e atendimento permanece no relatório `e2e-ui-20261016.md`.
Captura original da UI publicada, preservada sem edição a partir da saída da ferramenta de navegador: `C:/Users/nicol/.codex/visualizations/2026/10/16/01a14628-ac17-7493-a8e5-5a153b45e2c4/comissoes-publicadas-c710ac1.jpg`.

## Verificação de código

- Lint, tipos e 62 testes direcionados com PostgreSQL: aprovados, sem pulos.
- CI do commit: [job 117242986215](https://github.com/avilaops/ERP/actions/runs/38981442954/job/117242986215): 702 testes aprovados, zero falhas e zero pulos; lint, tipos e build aprovados.
- Uma execução completa na cópia de demonstração falhou em dois testes por ausência do arquivo público `.env.example`, excluído na preparação dessa cópia. O CI acima usa o checkout completo e passou os mesmos 702 testes. Essa execução local não foi apresentada como aprovada.
- Regressão de banco cobre baixa parcial, estorno, rebaixa, segunda reversão e CSV; teste de comissão cobre base assinada, comissão paga e saldo negativo.
- O teste de contrato que comparava validade com o relógio real deixou de usar uma data fixa expirada.
- `allowedDevOrigins` inclui somente `127.0.0.1`, para os recursos do Next em desenvolvimento pelo túnel local. Não altera autenticação ou origens de produção.

## UX nos cinco tamanhos

Sem rolagem lateral. Todos os quatro campos e o botão do formulário de baixa medem 44 px.
Altura total da página com detalhe e erro abertos, em px:

| Tela | 360×640 | 390×844 | 430×932 | 1366×768 | 1440×900 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Recebimentos — erro aberto | 2073 | 2021 | 1957 | 1284 | 1284 |
| Comissões — resumo | 1558 | 1498 | 1346 | 821 | 900 |

Respostas às sete perguntas de `docs/ux.md`:

1. Título e ação identificam recebimentos/comissões; o erro diz que nada foi gravado.
2. Saldo do recebível e base líquida aparecem junto do contexto correspondente.
3. O formulário oferece uma ação de baixa; envio repetido é bloqueado enquanto aguarda resposta.
4. Não há rolagem lateral; a meta de uma tela de altura continua pendente nas listas, conforme medidas acima.
5. Detalhe tem caminho nomeado Dar baixa/Fechar baixa; lista usa paginação existente.
6. Recusa preserva o rascunho. Trocar de página continua iniciando outro formulário; não há promessa de rascunho global.
7. Seleção por teclado e envio verificados. Zoom de 200%, texto ampliado e leitor de tela completos não foram revalidados nesta correção; não há aceite integral de acessibilidade.

## Publicação e pendências

Publicação concluída: `/api/health` respondeu `c710ac1`, build em `2026-10-16T23:33:50Z`. O pacote standalone foi conferido com manifesto de 3202 entradas e checksum; pacote e imagem anteriores foram preservados. Não houve migração nova.

Comissões e Recebimentos publicados conferidos pela UI como Nícolas/Diretoria. O cartão líquido e a abertura do novo formulário foram observados sem enviar nenhuma baixa real; sessão original preservada. A aba de Comissões ficou aberta para inspeção.

As tarefas de correção estão Done no Linear. A equipe passou a usar o prefixo AVL durante a execução: AVL-24, AVL-25, AVL-26 e AVL-27 correspondem aos identificadores NIC anteriores. AVL-26 contém o CSV corrigido anexado. AVL-21 continua em revisão e suas quatro dependências já resolvidas foram retiradas.

Base fictícia após a repetição preservada em `/opt/build/erp/e2e-ui-20261016/test-state-after-fixes.dump` (311 KB). Aplicação e banco próprios parados e túnel local encerrado; viewport restaurado e scripts restaurados antes do encerramento. A aplicação de demonstração havia sido encerrada por falta de memória durante builds concorrentes, depois da conclusão dos testes; a base não foi perdida. Não foram interrompidos contêineres de outras tarefas.

AVL-21 permanece parcial: envio externo, assinatura do cliente e autorização/envio fiscal não foram executados nesta base. AVL-12 e AVL-13 continuam pendentes. A varredura visual geral do CI ainda estava pendente no último acompanhamento; não foi declarada aprovada.

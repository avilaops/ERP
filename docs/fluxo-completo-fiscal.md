# Fluxo de orçamento, contrato e nota fiscal

Retomada de 17/10/2026: [AVL-21](https://linear.app/avilaops/issue/AVL-21),
[AVL-77](https://linear.app/avilaops/issue/AVL-77) e
[AVL-154](https://linear.app/avilaops/issue/AVL-154).

## Roteiro pela interface

Integração do PR 20: o envio automático recebe o ID do evento registrado e
deduplica/anexa essa mesma CC-e, mesmo quando outra sequência é gravada antes
do envio. O reenvio manual continua podendo selecionar a última carta.
A migration `0070_email_da_carta_de_correcao.sql`, confirmada em produção,
mantém seu nome; a nova migration de PIX/termos é `0071_pix_direto_e_termos_preservados.sql`.
Esses ajustes de integração ainda dependem de implantação própria.

1. Cliente e atendimento: conferir documento, endereço, contato e e-mail de quem assina.
2. Orçamento: equipamentos, opções, quantidades, entrega, pagamento e PDF.
3. Pedido: garantia, montagem, frete e demais termos; solicitar aprovação e fechar.
4. Contrato e nota → Contrato: conferir o modelo e o PDF, enviar o link e acompanhar
   a assinatura. Assinatura real pertence à pessoa autorizada.
5. Contrato e nota → Nota fiscal → Preparar regras desta nota: conferir operação,
   tributos, produtos e meios de pagamento com as escolhas aprovadas pelo contador.
6. Conferir XML e DANFE sem consumir número. Emitir somente no ambiente confirmado;
   registrar chave, situação e protocolo do autorizador.
7. Conferir anexos e destinatário e enviar por e-mail. Aceitação pelo SMTP não comprova
   entrega na caixa do cliente. Falha de e-mail não desfaz autorização fiscal.
8. Quando aplicável, registrar CC-e ou cancelar com justificativa, conferir o retorno
   e enviar o evento. Cancelar nota não cancela o pedido nem estorna recebimentos.
9. Inutilização de numeração fica em Parâmetros → Fiscal; é uma operação distinta de
   cancelar nota autorizada. Só utilizar uma faixa efetivamente aplicável.

## Fila persistente de operações fiscais

Em desenvolvimento na PR 21, a tela grava a solicitação antes de qualquer chamada
externa. Emissão, CC-e e cancelamento compartilham a fila por pedido; uma operação
pendente impede outra no mesmo pedido. A inutilização mantém sua própria fila porque
é uma faixa de numeração da empresa, sem pedido associado: o XML assinado é salvo
antes da chamada à SEFAZ.

O worker marca cada trabalho como pendente, processando, concluído ou em revisão
manual. Emissão retoma consultando a SEFAZ antes de reenviar o XML. Para
inutilização, resposta perdida vai para revisão manual: não há uma consulta segura
implementada para confirmar a faixa antes de repetir uma solicitação irreversível.
Nenhuma dessas filas substitui a autorização externa em homologação ou produção.

## Correções do envio de eventos

- O arquivo novo é `procEventoNFe`, com evento assinado e o `retEvento` real.
  Chave, tipo, sequência e ambiente devem corresponder ao envio.
- Código 136 não muda a situação da nota: registro sem vínculo não comprova o
  cancelamento. Na recuperação por consulta também são conferidos os identificadores.
- A última CC-e acompanha o reenvio do XML/DANFE; o documento original permanece
  intacto. O texto identifica a correção e seu protocolo.
- Quando o envio automático está ligado e a nota já foi enviada, a CC-e vai para
  o último destinatário da nota. Repetição já registrada como aceita pelo SMTP para
  o mesmo evento não inicia outro envio automático. Isso não é uma fila de entrega
  exatamente uma vez; a fila persistente continua na AVL-87/AVL-75.
- Cada tentativa registra o evento efetivamente anexado e o destinatário. Cancelada,
  a mensagem leva XML original e cancelamento, sem DANFE ou CC-e como documento vigente.
- Arquivos antigos sem recibo não são preenchidos com retorno fictício: o envio pede
  recuperação do arquivo na SEFAZ. Esta alteração não recupera retroativamente esses
  arquivos. Não havia notas reais na última conferência da produção.

Referência oficial: [NT 2011.003, CC-e e registro do evento](https://www.nfe.fazenda.gov.br/Portal/exibirArquivo.aspx?conteudo=hNJXbmu+l8Q%3D).
O schema conferido é o PL_010d v1.03 já versionado em `tests/fixtures/nfe-xsd/`.

## Evidências e limites

- Banco isolado: 744 testes aprovados, zero falhas ou pulos; lint e tipos aprovados.
  Após os ajustes visuais, 41 testes de eventos, rotas, UX e tema passaram novamente,
  incluindo conferência independente da assinatura no evento processado.
- A nova montagem de evento passou no XSD oficial e conserva a assinatura. Casos
  negativos incluem outro ambiente/tipo/sequência, evento 136 e cancelamento recusado.
- O teste integrado verifica duas CC-e, última carta nos anexos da nota, envio próprio
  da carta com ID auditado, falha de SMTP e cancelamento sem DANFE. Transportes fiscais
  e SMTP dos testes são substitutos controlados; nenhum protocolo é evidência externa.
- UI no demo `erp_note_rules_demo`: pedido fictício `261017-RRS7`, nota simulada 9001,
  série 909, com aviso explícito de ausência de transmissão. O registro do histórico
  usado para conferir a apresentação também é simulado; nenhum e-mail foi entregue.
- Seleção inicial de documentos cabe nos cinco tamanhos (360×640, 390×844, 430×932,
  1366×768, 1440×900); sem excesso lateral ou controle abaixo de 44 px. Detalhe fiscal
  aberto também foi medido nos cinco tamanhos quanto a largura e controles. Conteúdo
  extenso é aberto em detalhes, com rolagem. Rascunho conservado ao recolher/reabrir;
  Enter abre o detalhe e Tab alcança campos com texto/zoom 200%, restaurados ao final.
- Contraste da etapa selecionada corrigido com o componente primário compartilhado,
  conferido nos temas claro e escuro. Rodapé de total e fieldset vazio não aparecem
  na etapa de documentos.

Sete perguntas de UX: o pedido e os títulos identificam a tarefa; a seleção mostra
situação antes da ação; abrir Contrato ou Nota fiscal é a decisão inicial; os cinco
tamanhos foram medidos; os detalhes têm nomes explícitos; recolher mantém o rascunho;
teclado e ampliação foram conferidos. Abertura dos detalhes pode exigir rolagem.

Publicação: `37a1f70`, em 17/10/2026 às 09:15:57 UTC. Build aprovado, pacote com
3.275 entradas; delta SHA-256
`ce8b805bdb4c40e13369ac6f22fc519e8d46fe272ad474c788682432419d7e2b`.
Health público confirmou o commit e o container ficou `healthy`; migração 0070
aplicada. Pacote e imagem anteriores conservados para recuperação. POST sem token
continua 401. PR20 aberta para revisão, sem mesclar PRs anteriores.

Antes/depois: uma conexão ativa, três clientes, sete pedidos, um recebimento,
nenhuma conta a pagar, 13 atividades, nenhuma nota/evento/envio fiscal. Caixa de
saída própria `ludus@ludusequipamentos.com`, envio automático ligado e certificado
válido; ambiente em homologação. No HXKP ainda estão vazios CSTs de ICMS, IPI,
PIS/COFINS e CST/classificação de IBS/CBS, considerando as regras efetivas do pedido.
Essa conferência de configuração foi somente leitura, não prova da aprovação contábil.

A aba real abriu no login e aguarda autenticação do usuário para conferir o HXKP
pela UI. Emissão e eventos externos, assinatura do cliente e entrega de e-mail
continuam sem evidência desta retomada. Não inferir tributação pelo CNPJ nem usar
a simulação como prova de autorização. Verificações finais de lint/tipos aprovadas.

## Continuação: validação local obrigatória

Em 17/10/2026, publicada a AVL-73 em `40a7b70`: NF-e, cancelamento, CC-e e
inutilização passam por XSD local antes de transmitir. Falha do motor também
bloqueia. Prévia assinada é conferida antes da numeração; recuperação consulta a
SEFAZ antes de decidir pelo reenvio. 751 testes, lint, tipos, build e standalone
isolado aprovados; health público e execução do motor no container confirmados.
Dados reais e configuração preservados, sem emissão externa ou entrega de e-mail.
Detalhes e limites em [Conferência local do XML fiscal](validacao-fiscal-local.md).

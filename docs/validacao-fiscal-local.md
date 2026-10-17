# Conferência local do XML fiscal

Entrega da [AVL-73](https://linear.app/avilaops/issue/AVL-73), no recorte NF-e SP
da [AVL-69](https://linear.app/avilaops/issue/AVL-69).

## Contrato e bloqueios

`assertFiscalXml(xml, kind)` confere estrutura XSD de documento assinado. Os tipos
são `nfe`, `evento` e `inutilizacao`. O serviço de emissão sempre executa essa
conferência; o MCP fiscal opcional continua sendo uma conferência adicional.

- NF-e nova: conferir prévia assinada antes de obter o número; conferir também o
  XML final numerado antes de guardá-lo e transmitir.
- NF-e aguardando resposta: consultar primeiro. Se já autorizada, recuperar o
  protocolo sem retransmitir. Se não consta, conferir o XML guardado antes de
  reenviar os mesmos bytes.
- Cancelamento, CC-e e inutilização: conferir o documento assinado antes do envio.
- XML incompatível gera `FiscalXmlError.reason = invalid`; arquivo ausente,
  integridade divergente ou falha do motor gera `unavailable`. Ambos bloqueiam.
  Essas mensagens não representam rejeição da SEFAZ.

A conferência verifica o grupo de assinatura pelo XSD; não comprova validade
criptográfica, confiança ICP-Brasil, aceitação tributária ou autorização fiscal.
Assinatura e transporte continuam nos serviços próprios, com testes independentes.
Eventos usam o envelope genérico oficial; limites específicos de cancelamento e
CC-e continuam no construtor `eventXml`, não no schema genérico.

## Pacote e execução

O runtime usa `xmllint-wasm` 5.3.0, com worker Node e WASM locais. O manifesto em
`src/lib/fiscal/schemas/manifest.json` identifica versão, origem e SHA-256 dos 13
arquivos. NF-e usa PL_010f v1.04; eventos e inutilização usam o subconjunto PL_010d
v1.03 já registrado no projeto. O wrapper de inutilização mantém a fonte indicada
no manifesto. A referência de origem foi conferida em 10/10/2026, conforme
`tests/fixtures/nfe-xsd/ORIGEM.md`; isso não afirma ser o pacote mais recente hoje.

Arquivos originais dos testes são preservados. As cópias de runtime têm finais de
linha LF e hash próprio; um teste compara seu conteúdo com as fontes. Atualizar um
schema exige atualizar manifesto, testar os documentos e publicar novo artefato.
Não há download ou seleção de schema pelo XML recebido.

Arquivos e includes são fixos e locais, com hash conferido no carregamento. O
validador recusa DTD, entidades, NUL, documento sem assinatura e XML acima de 1 MiB.
Cada chamada executa worker isolado, sem rede (`--nonet`), com heap WASM máximo de
64 MiB; até quatro chamadas simultâneas por instância do validador. Capacidade
ocupada bloqueia com orientação para repetir. Falha de carregamento não fica
permanentemente em cache. Não há fila persistente ou garantia de prazo de execução.

O Next inclui os assets e mantém o pacote externo para localizar worker/WASM.
Os includes seguem a [documentação de output do Next](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
`deploy/empacotar.sh` verifica hashes e arquivos necessários no standalone antes
de criar o pacote. O artefato deve ser conferido sem depender de `tests/` ou do
`node_modules` do build.

## Arquitetura preservada e limites

As ações em `pedidos/nfe-actions.ts` exigem permissão `parametros` e obtêm o banco
da empresa pela sessão. `db/order-nfe.ts` monta a preparação efetiva do pedido;
`db/issue-nfe.ts` coordena assinatura, persistência, transmissão e leitura do
retorno. `fiscal/channel.ts` transporta com o certificado da empresa.

`fiscal_invoices` distingue empresa pelo schema, ambiente, série, número e chave.
Estados: `assinada`, `autorizada`, `rejeitada`, `denegada`, `cancelada`. O XML
assinado é guardado antes do transporte. A emissão sem resposta consulta a chave;
rejeitada pode reutilizar número segundo as regras existentes. Eventos conservam
sequência, autoria e protocolo; cancelamento e mudança de situação são registrados
na mesma instrução SQL. E-mail usa o SMTP existente e registra tentativas em
`fiscal_invoice_mails`, sem desfazer a autorização quando falha.

Esta entrega não altera tabelas, permissões, numeração ou tributação. A reversão
usa o artefato/imagem anterior; os registros permanecem compatíveis. Incremento
atômico da numeração não é uma transação de toda a emissão: falha depois da
reserva ainda pode deixar lacuna. Serialização de operações, recuperação automática,
leases e outbox ficam na AVL-75/AVL-87; não foram resolvidos pela validação XSD.

O inventário e a matriz completa NF-e/NFC-e/NFS-e/CT-e, por UF e município, com
fontes, custos e credenciamento, continuam na AVL-69. O código atual mantém os
endpoints de autorização/eventos/inutilização restritos a SP. Esta entrega não
habilita outros documentos, estados, contingência ou novas operações fiscais.

## Verificação

`tests/fiscal-local-layout.test.ts` cobre documento assinado válido, versão,
conteúdo, sintaxe e assinatura estrutural inválidos, eventos e inutilização com
CNPJ numérico/alfanumérico, integridade dos arquivos, motor indisponível, limite de
concorrência e retomada. O teste integrado de emissão usa banco isolado e rua
incompatível com XSD: não guarda nota, não gasta número e não chama o transporte.
Transportes dos testes são substitutos controlados, sem emissão externa.

Em 17/10/2026, a suíte geral passou com 751 testes, zero falhas ou pulos; lint,
tipos e `npm ci --dry-run --ignore-scripts` passaram no servidor de build.

Build aprovado e standalone de 3.309 entradas conferido sem rede e sem `tests/`:
NF-e, cancelamento, CC-e e inutilização fictícios passaram, e XML com NCM inválido
foi recusado. Os 13 hashes e o motor 5.3.0 também foram conferidos no container
de produção, executando apenas validação local de documentos inválidos.

Publicado em `40a7b70`, em 17/10/2026 às 10:13:41 UTC. Health público confirmou a
revisão e o container ficou `healthy`; nenhuma migração pendente. Delta SHA-256
`8ed81f79e21bcd3281a1f205cc41d6657282707f68f71dbb845caae29e7d8019`.
Artefato e imagem anteriores conservados. [PR21](https://github.com/avilaops/ERP/pull/21)
tem base na PR20; nenhuma PR anterior foi mesclada.

Antes/depois: uma conexão ativa, três clientes, sete pedidos, um recebimento,
zero contas a pagar, 13 atividades e nenhuma nota, evento ou envio fiscal. MCP sem
token continua 401. Certificado válido, ambiente em homologação e SMTP próprio
com envio automático preservados. Continuam vazios no HXKP os códigos de ICMS,
IPI, PIS, COFINS e CST/classificação IBS/CBS. A aba real permanece no login; não
houve autenticação alternativa, emissão, assinatura ou entrega real de e-mail.

O fluxo real segue na AVL-21/AVL-77. Configuração tributária aprovada pelo contador
(AVL-12), assinatura do cliente, homologação externa e entrega de e-mail exigem
suas próprias evidências. Teste local não comprova essas etapas.

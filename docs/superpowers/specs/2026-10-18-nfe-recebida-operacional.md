# NF-e recebida operacional

## Objetivo

Transformar documentos fiscais recebidos em entradas auditáveis de compra, custo e estoque, sem confundir o resumo `resNFe` da distribuição com o XML fiscal completo.

## Responsabilidade

O ERP é a fonte de verdade para certificado, distribuição NF-e, manifestação, XML original, DANFE, fornecedor, compra, custos e estoque. O Lojas apenas consome a API versionada do ERP e apresenta o estado ao lojista. CT-e emitido pelo transporte pertence ao módulo fiscal isolado do TMS; o ERP não abre um segundo consumidor nem reaproveita o serviço exclusivo de NF-e para buscá-lo.

## Fluxo

1. A distribuição registra resumo, evento ou documento completo sem alterar estoque.
2. Um resumo só oferece manifestação explícita. Nunca há ciência ou confirmação automática.
3. O XML completo aceito é um `nfeProc`/`procNFe` autorizado, validado e preservado byte a byte com SHA-256.
4. A conferência mostra emitente, destinatário, totais, tributos e todos os itens.
5. O usuário revisa o fornecedor por CNPJ e vincula cada item a um produto existente ou cria um produto.
6. A confirmação cria uma compra idempotente, registra custo unitário e composição dos custos.
7. O recebimento físico, em ação separada, gera uma única entrada de estoque por produto.
8. O DANFE é gerado somente do XML completo autorizado e deixa claro que é representação do documento fiscal.

## Invariantes

- Isolamento por empresa vem do schema PostgreSQL da sessão.
- Chave de acesso e hash tornam a importação idempotente.
- XML, certificado e senhas nunca trafegam na listagem.
- DTD, entidades, XML malformado, documento não autorizado, chave divergente e destinatário divergente são recusados.
- Fornecedor, produto, custo, compra e estoque não são criados silenciosamente.
- Cancelamento e eventos posteriores preservam histórico; não apagam o documento original.
- A distribuição segue a NT 2014.002 v1.40 e o pacote oficial Distribuição DF-e v1.04.
- Depois de `cStat=137`, a próxima consulta por `distNSU` não ocorre antes de uma hora; `cStat=656` também suspende novas consultas pelo intervalo indicado.
- Desde 01/06/2026, a operação considera o prazo oficial de 90 dias para manifestação do destinatário.

## Entregas

- AVL-95: importação, validação, persistência e consulta do XML completo.
- AVL-91 e AVL-94: distribuição por NSU e manifestação explícita.
- AVL-97: conciliação com fornecedor, produtos, custos, compra e estoque.
- AVL-80: tela fiscal e DANFE.
- AVL-254: integração do Lojas com a API do ERP.


# Plano de implementação da NF-e recebida

1. Persistir o documento completo e os itens com chave e hash únicos.
2. Implementar parser defensivo de `nfeProc` autorizado e testes de adulteração.
3. Implementar repositório idempotente e testes PostgreSQL isolados.
4. Expor importação, lista, detalhe e download sob sessão e permissão Fiscal.
5. Gerar DANFE somente a partir do documento completo.
6. Implementar distribuição DF-e e manifestação explícita com fila persistente.
7. Implementar revisão do fornecedor e vínculo de itens com produtos.
8. Criar compra, custos e entrada de estoque em confirmações separadas e idempotentes.
9. Integrar o Lojas pela API versionada do ERP.
10. Validar lint, tipos, testes, build e telas nos cinco tamanhos no GitHub Actions; inspecionar os artefatos antes do merge.


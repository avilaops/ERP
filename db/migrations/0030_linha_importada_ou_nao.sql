-- Uma linha de produto compra de importação (assessoria, pagamento no exterior) ou no país
-- (fornecedor nacional). Só muda como as telas chamam as coisas: "custo assessoria" e "pagar na
-- China" numa, "custo de compra" e "pagar ao fornecedor" na outra. A conta é a mesma.
-- Toda linha que já existe nasce como importada: era o que as telas diziam. A empresa marca na tela.
ALTER TABLE product_lines ADD COLUMN imported boolean NOT NULL DEFAULT true;

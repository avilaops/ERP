-- Contrato que a empresa envia pronto, em PDF, em vez de sair do modelo.
-- O arquivo é guardado como veio e é ele que o cliente assina; o sistema só junta a folha de
-- registro das assinaturas. O nome do arquivo fica para a tela dizer qual foi enviado.
ALTER TABLE order_contracts
    ADD COLUMN uploaded  boolean NOT NULL DEFAULT false,
    ADD COLUMN file_name text CHECK (file_name IS NULL OR length(btrim(file_name)) BETWEEN 1 AND 200),
    ADD CONSTRAINT order_contracts_file_whole CHECK (uploaded = (file_name IS NOT NULL));

-- ICMS de saída por estado de destino. Produto nacional sai de SP com 7% ou 12%
-- conforme o destino; importado com FCI sai com uma alíquota só. Nulo: vale o
-- "ICMS interestadual" geral dos parâmetros. Cada versão publicada guarda os seus.
-- Sem nome de esquema: cada empresa tem estas tabelas no esquema dela.
ALTER TABLE state_tax_rates
    ADD COLUMN outbound_icms numeric(9,8) CHECK (outbound_icms IS NULL OR (outbound_icms >= 0 AND outbound_icms < 1));
ALTER TABLE price_table_state_rates
    ADD COLUMN outbound_icms numeric(9,8) CHECK (outbound_icms IS NULL OR (outbound_icms >= 0 AND outbound_icms < 1));

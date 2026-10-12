-- Lei 14.592/2023 (RE 574.706): o ICMS que incide na operação não compõe a base do PIS e da COFINS.
-- Vira regra fiscal da linha, ligada por padrão; o contador desliga se o enquadramento da empresa pedir.
ALTER TABLE fiscal_rules ADD COLUMN icms_out_of_pis_cofins boolean NOT NULL DEFAULT true;

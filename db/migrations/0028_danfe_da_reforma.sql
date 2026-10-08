-- DANFE no leiaute da reforma tributária (NT 2026.010): vale para a nota emitida a partir desta
-- data. Nasce em 01/12/2026, quando o leiaute passa a ser obrigatório; a empresa pode adiantar
-- ou, se a data oficial mudar, acompanhar, sem alteração de programa.
ALTER TABLE company_settings
    ADD COLUMN nfe_danfe_reform_from date NOT NULL DEFAULT DATE '2026-12-01';

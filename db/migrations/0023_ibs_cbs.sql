-- Reforma tributária do consumo (NT 2025.002): a nota leva o grupo do IBS e da
-- CBS. Para o regime normal é obrigatório desde 03/08/2026 (rejeição 1115);
-- para o Simples, a partir de 04/01/2027.
-- Sem nome de esquema: cada empresa tem estas tabelas no esquema dela.

ALTER TABLE fiscal_rules
    -- CST do IBS/CBS (três dígitos) e classificação tributária (cClassTrib, seis): define o contador.
    ADD COLUMN ibscbs_cst     text CHECK (ibscbs_cst IS NULL OR ibscbs_cst ~ '^[0-9]{3}$'),
    ADD COLUMN ibscbs_class   text CHECK (ibscbs_class IS NULL OR ibscbs_class ~ '^[0-9]{6}$'),
    -- Alíquotas do ano. Os valores iniciais são os da lei para 2026 (LC 214/2025, art. 343):
    -- IBS estadual 0,1%, IBS municipal 0% e CBS 0,9%. Em 2027 mudam, e é aqui que se troca.
    ADD COLUMN ibs_state_rate numeric(9,8) NOT NULL DEFAULT 0.001 CHECK (ibs_state_rate >= 0 AND ibs_state_rate < 1),
    ADD COLUMN ibs_city_rate  numeric(9,8) NOT NULL DEFAULT 0 CHECK (ibs_city_rate >= 0 AND ibs_city_rate < 1),
    ADD COLUMN cbs_rate       numeric(9,8) NOT NULL DEFAULT 0.009 CHECK (cbs_rate >= 0 AND cbs_rate < 1);

-- Regras de aprovação: escolhas da empresa, não do código. Os valores iniciais
-- são o comportamento que o sistema já tinha.
-- Sem nome de esquema: cada empresa tem esta tabela no esquema dela.
ALTER TABLE company_settings
    -- Lucro abaixo da meta manda o pedido para aprovação?
    ADD COLUMN approval_below_target  boolean NOT NULL DEFAULT true,
    -- Frete por nossa conta manda o pedido para aprovação?
    ADD COLUMN approval_freight       boolean NOT NULL DEFAULT false,
    -- Até onde o gerente aprova sozinho: enquanto o pedido der lucro, ou só enquanto ficar na meta.
    ADD COLUMN manager_limit          text NOT NULL DEFAULT 'lucro' CHECK (manager_limit IN ('lucro', 'meta')),
    -- A diretoria, ao fechar um pedido fora da política, já o aprova?
    ADD COLUMN director_self_approves boolean NOT NULL DEFAULT false;

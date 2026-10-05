-- Parâmetros (rascunho da diretoria) e produtos.
-- Sem nome de esquema: os testes aplicam este arquivo num esquema próprio.

CREATE TABLE pricing_params (
    -- Uma linha só: a chave é sempre true.
    id                     boolean PRIMARY KEY DEFAULT true CHECK (id),
    target_net_profit      numeric(9,8) NOT NULL CHECK (target_net_profit >= 0 AND target_net_profit < 1),
    free_discount          numeric(9,8) NOT NULL CHECK (free_discount >= 0 AND free_discount < 1),
    safety_margin          numeric(9,8) NOT NULL CHECK (safety_margin >= 0 AND safety_margin < 1),
    min_down_payment       numeric(9,8) NOT NULL CHECK (min_down_payment >= 0 AND min_down_payment < 1),
    proposal_validity_days integer      NOT NULL CHECK (proposal_validity_days > 0),
    icms_sp                numeric(9,8) NOT NULL CHECK (icms_sp >= 0 AND icms_sp < 1),
    pis_cofins             numeric(9,8) NOT NULL CHECK (pis_cofins >= 0 AND pis_cofins < 1),
    ipi                    numeric(9,8) NOT NULL CHECK (ipi >= 0 AND ipi < 1),
    income_tax             numeric(9,8) NOT NULL CHECK (income_tax >= 0 AND income_tax < 1),
    commission             numeric(9,8) NOT NULL CHECK (commission >= 0 AND commission < 1),
    ads                    numeric(9,8) NOT NULL CHECK (ads >= 0 AND ads < 1),
    gateway                numeric(9,8) NOT NULL CHECK (gateway >= 0 AND gateway < 1),
    icms_interstate        numeric(9,8) NOT NULL CHECK (icms_interstate >= 0 AND icms_interstate < 1),
    other_sales_rate       numeric(9,8) NOT NULL CHECK (other_sales_rate >= 0 AND other_sales_rate < 1),
    fixed_monthly_expenses numeric(14,2) NOT NULL DEFAULT 0 CHECK (fixed_monthly_expenses >= 0),
    updated_at             timestamptz  NOT NULL DEFAULT now(),
    updated_by             text         NOT NULL
);

-- Custo real e preço de tabela não são colunas: saem sempre do motor de cálculo,
-- a partir do custo da assessoria, do crédito e da embalagem.
CREATE TABLE products (
    id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name               text NOT NULL CHECK (btrim(name) <> ''),
    code               text CHECK (code IS NULL OR btrim(code) <> ''),
    supplier_name      text,
    supplier_model     text,
    supplier_price_usd numeric(12,2) CHECK (supplier_price_usd >= 0),
    -- Nulo é "sem custo": o produto existe, mas ainda não tem preço.
    advisory_cost      numeric(14,2) CHECK (advisory_cost >= 0),
    tax_credit         numeric(10,8) NOT NULL DEFAULT 0 CHECK (tax_credit >= 0 AND tax_credit < 1),
    packaging          numeric(14,2) NOT NULL DEFAULT 0 CHECK (packaging >= 0),
    active             boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    updated_by         text NOT NULL
);

CREATE UNIQUE INDEX products_code_key ON products (code) WHERE code IS NOT NULL;

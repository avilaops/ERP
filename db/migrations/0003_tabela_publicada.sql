-- Tabela de preços publicada: cada versão é um retrato que a equipe consulta.
-- Versão publicada não se altera nem se apaga.
-- Sem nome de esquema: os testes aplicam este arquivo num esquema próprio.

-- Cada publicação: o número, quem publicou e os parâmetros daquele momento
-- (as mesmas 15 colunas de pricing_params, com os mesmos limites).
CREATE TABLE price_table_versions (
    version                integer PRIMARY KEY CHECK (version > 0),
    published_at           timestamptz NOT NULL DEFAULT now(),
    published_by           text NOT NULL CHECK (btrim(published_by) <> ''),
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
    fixed_monthly_expenses numeric(14,2) NOT NULL CHECK (fixed_monthly_expenses >= 0)
);

-- O retrato de cada equipamento na versão: o que entrou na conta e o preço que saiu dela.
-- O preço publicado é coluna de propósito: é a saída do motor naquele momento e não
-- pode mudar quando o motor mudar. Custo real continua não sendo coluna.
-- As chaves estrangeiras não apagam em cascata: equipamento que já saiu numa versão
-- não pode mais ser excluído, só desativado.
CREATE TABLE price_table_items (
    version              integer NOT NULL REFERENCES price_table_versions (version),
    product_id           integer NOT NULL REFERENCES products (id),
    code                 text,
    name                 text NOT NULL CHECK (btrim(name) <> ''),
    advisory_cost        numeric(14,2) NOT NULL CHECK (advisory_cost > 0),
    tax_credit           numeric(10,8) NOT NULL CHECK (tax_credit >= 0 AND tax_credit < 1),
    packaging            numeric(14,2) NOT NULL CHECK (packaging >= 0),
    table_price          numeric(14,2) NOT NULL CHECK (table_price > 0),
    table_price_with_ipi numeric(14,2) NOT NULL CHECK (table_price_with_ipi >= table_price),
    PRIMARY KEY (version, product_id)
);

CREATE INDEX price_table_items_product_id_idx ON price_table_items (product_id);

-- Transportadoras da empresa e os dados de transporte da nota de cada pedido.
-- Pela norma (MOC 7.0, Anexo I, grupo X) só a modalidade do frete é obrigatória:
-- transportadora e volumes são opcionais, e o que fica em branco não vai para a nota.
-- Sem nome de esquema: cada empresa tem estas tabelas no esquema dela.

CREATE TABLE carriers (
    id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind               text NOT NULL CHECK (kind IN ('PJ', 'PF')),
    -- CNPJ (14, pode ter letras) ou CPF (11), sem pontuação.
    document           text NOT NULL,
    name               text NOT NULL CHECK (btrim(name) <> ''),
    -- Só números, ou ISENTO. Com inscrição, a nota exige a UF.
    state_registration text CHECK (state_registration IS NULL OR state_registration ~ '^([0-9]{2,14}|ISENTO)$'),
    address            text,
    city               text,
    uf                 text CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    updated_by         text NOT NULL CHECK (btrim(updated_by) <> ''),
    CHECK ((kind = 'PJ' AND document ~ '^[0-9A-Z]{12}[0-9]{2}$') OR (kind = 'PF' AND document ~ '^[0-9]{11}$')),
    CHECK (state_registration IS NULL OR uf IS NOT NULL),
    UNIQUE (document)
);

ALTER TABLE orders
    ADD COLUMN nfe_carrier_id   integer REFERENCES carriers (id),
    ADD COLUMN nfe_volumes      integer CHECK (nfe_volumes IS NULL OR nfe_volumes BETWEEN 1 AND 999999),
    -- Espécie dos volumes: caixa, palete, engradado…
    ADD COLUMN nfe_volume_kind  text CHECK (nfe_volume_kind IS NULL OR length(btrim(nfe_volume_kind)) BETWEEN 1 AND 60),
    -- Pesos em quilos, com três casas.
    ADD COLUMN nfe_net_weight   numeric(12,3) CHECK (nfe_net_weight IS NULL OR nfe_net_weight > 0),
    ADD COLUMN nfe_gross_weight numeric(12,3) CHECK (nfe_gross_weight IS NULL OR nfe_gross_weight > 0);

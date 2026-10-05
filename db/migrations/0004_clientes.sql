-- Clientes: um cadastro por CNPJ ou CPF, compartilhado pela equipe.
-- Só tipo, documento e nome são exigidos para gravar; o resto é o que falta para o
-- cadastro ficar completo e o pedido poder fechar.
-- Sem nome de esquema: os testes aplicam este arquivo num esquema próprio.

CREATE TABLE customers (
    id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind               text NOT NULL CHECK (kind IN ('PJ', 'PF')),
    -- Só letras maiúsculas e dígitos, sem pontuação: CNPJ (14) ou CPF (11).
    document           text NOT NULL,
    -- Razão social (PJ) ou nome completo (PF).
    name               text NOT NULL CHECK (btrim(name) <> ''),
    -- Nome fantasia (PJ).
    trade_name         text,
    -- Nome do responsável (PJ).
    contact_name       text,
    -- Só dígitos, ou 'ISENTO' (PJ). É o que diz se o cliente é contribuinte do ICMS.
    state_registration text,
    -- PF.
    rg                 text,
    phone              text CHECK (phone IS NULL OR phone ~ '^[0-9]{10,11}$'),
    email              text,
    cep                text CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$'),
    street             text,
    street_number      text,
    complement         text,
    district           text,
    city               text,
    uf                 text CHECK (uf IS NULL OR uf IN (
                           'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA',
                           'PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO')),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    updated_by         text NOT NULL CHECK (btrim(updated_by) <> ''),
    CHECK ((kind = 'PJ' AND document ~ '^[0-9A-Z]{12}[0-9]{2}$') OR (kind = 'PF' AND document ~ '^[0-9]{11}$')),
    CHECK (state_registration IS NULL OR state_registration = 'ISENTO' OR state_registration ~ '^[0-9]{2,14}$'),
    CHECK (kind = 'PJ' OR (state_registration IS NULL AND trade_name IS NULL AND contact_name IS NULL)),
    CHECK (kind = 'PF' OR rg IS NULL)
);

CREATE UNIQUE INDEX customers_document_key ON customers (document);

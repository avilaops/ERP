-- Base da nota fiscal eletrônica: dados fiscais da empresa, o certificado digital
-- A1 e os dados fiscais do equipamento. Nada disto emite nota ainda.
-- Sem nome de esquema: cada empresa tem estas tabelas no esquema dela.

ALTER TABLE company_settings
    ADD COLUMN legal_name         text,
    -- Só dígitos.
    ADD COLUMN cnpj               text CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$'),
    ADD COLUMN state_registration text CHECK (state_registration IS NULL OR state_registration ~ '^[0-9]{2,14}$'),
    -- Código de Regime Tributário da NF-e: 1 Simples, 2 Simples com excesso, 3 Regime normal.
    ADD COLUMN tax_regime         integer CHECK (tax_regime IN (1, 2, 3)),
    ADD COLUMN street             text,
    ADD COLUMN street_number      text,
    ADD COLUMN district           text,
    ADD COLUMN city               text,
    -- Código do município no IBGE, sete dígitos: a nota exige.
    ADD COLUMN city_code          text CHECK (city_code IS NULL OR city_code ~ '^[0-9]{7}$'),
    ADD COLUMN uf                 text CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
    ADD COLUMN cep                text CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$'),
    ADD COLUMN nfe_series         integer NOT NULL DEFAULT 1 CHECK (nfe_series BETWEEN 1 AND 999),
    ADD COLUMN nfe_next_number    integer NOT NULL DEFAULT 1 CHECK (nfe_next_number BETWEEN 1 AND 999999999),
    -- Enquanto for homologação, nenhuma nota tem valor fiscal.
    ADD COLUMN nfe_environment    text NOT NULL DEFAULT 'homologacao' CHECK (nfe_environment IN ('homologacao', 'producao'));

-- O certificado A1 da empresa: o arquivo e a senha, cifrados juntos (AES-256-GCM)
-- com uma chave que não fica no banco. Aqui em claro só o que identifica o
-- certificado. Um por empresa.
CREATE TABLE fiscal_certificates (
    id           boolean PRIMARY KEY DEFAULT true CHECK (id),
    ciphertext   bytea NOT NULL CHECK (octet_length(ciphertext) BETWEEN 1 AND 65536),
    iv           bytea NOT NULL CHECK (octet_length(iv) = 12),
    auth_tag     bytea NOT NULL CHECK (octet_length(auth_tag) = 16),
    subject      text NOT NULL CHECK (btrim(subject) <> ''),
    holder_cnpj  text CHECK (holder_cnpj IS NULL OR holder_cnpj ~ '^[0-9]{14}$'),
    valid_from   timestamptz NOT NULL,
    valid_until  timestamptz NOT NULL CHECK (valid_until > valid_from),
    -- Resumo do certificado público, para conferir qual está guardado sem abrir nada.
    fingerprint  text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
    uploaded_at  timestamptz NOT NULL DEFAULT now(),
    uploaded_by  text NOT NULL CHECK (btrim(uploaded_by) <> '')
);

ALTER TABLE products
    ADD COLUMN ncm    text CHECK (ncm IS NULL OR ncm ~ '^[0-9]{8}$'),
    -- Origem da mercadoria na NF-e, de 0 a 8 (1 e 6 são importação direta; 2 e 7, adquirida no mercado interno).
    ADD COLUMN origin integer CHECK (origin BETWEEN 0 AND 8),
    ADD COLUMN cest   text CHECK (cest IS NULL OR cest ~ '^[0-9]{7}$'),
    ADD COLUMN unit   text NOT NULL DEFAULT 'UN' CHECK (unit ~ '^[A-Z0-9]{1,6}$');

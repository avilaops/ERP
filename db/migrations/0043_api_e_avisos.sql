-- Integrações: outros sistemas (n8n, site, CRM) leem e gravam no ERP por chave, e são avisados
-- quando algo acontece.

-- Chave de acesso à API. O segredo aparece uma vez, ao criar; aqui fica só o resumo dele.
CREATE TABLE api_keys (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Para que serve: "n8n", "Formulário do site".
    name          text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 60),
    -- O começo da chave, para reconhecê-la na lista.
    prefix        text NOT NULL CHECK (prefix ~ '^[A-Za-z0-9_-]{6,24}$'),
    key_hash      text NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
    -- Pode gravar (criar oportunidade) ou só ler.
    can_write     boolean NOT NULL DEFAULT false,
    -- Em nome de quem fica o que a chave cria: um usuário da empresa.
    owner_email   text NOT NULL CHECK (btrim(owner_email) <> ''),
    owner_name    text NOT NULL CHECK (btrim(owner_name) <> ''),
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    text NOT NULL CHECK (btrim(created_by) <> ''),
    last_used_at  timestamptz,
    revoked_at    timestamptz,
    revoked_by    text,
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

-- Endereço que recebe os avisos. O segredo que assina cada aviso fica cifrado (AES-256-GCM,
-- chave ERP_CERT_KEY do servidor), como a senha da caixa de e-mail.
CREATE TABLE webhooks (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 60),
    url         text NOT NULL CHECK (url ~ '^https://[^[:space:]]+$' AND length(url) BETWEEN 12 AND 500),
    -- Quais avisos este endereço recebe.
    events      text[] NOT NULL CHECK (cardinality(events) > 0),
    secret      bytea NOT NULL,
    secret_iv   bytea NOT NULL CHECK (octet_length(secret_iv) = 12),
    secret_tag  bytea NOT NULL CHECK (octet_length(secret_tag) = 16),
    active      boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  text NOT NULL CHECK (btrim(created_by) <> '')
);

-- Cada aviso a entregar, com o que foi enviado e o que o destino respondeu.
CREATE TABLE webhook_deliveries (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    webhook_id    integer NOT NULL REFERENCES webhooks (id),
    event         text NOT NULL CHECK (btrim(event) <> ''),
    payload       jsonb NOT NULL,
    status        text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'entregue', 'falhou')),
    attempts      integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    -- O que o destino respondeu na última tentativa: o código, ou por que não respondeu.
    last_result   text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    delivered_at  timestamptz
);
CREATE INDEX webhook_deliveries_pending_idx ON webhook_deliveries (id) WHERE status <> 'entregue';
CREATE INDEX webhook_deliveries_webhook_idx ON webhook_deliveries (webhook_id, id DESC);

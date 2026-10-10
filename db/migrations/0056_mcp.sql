-- Conexão do ERP com assistentes de IA (protocolo MCP): a pessoa entra com o próprio login e o
-- assistente passa a enxergar só o que o cargo dela enxerga. Desligada por padrão.
ALTER TABLE ai_settings ADD COLUMN mcp_enabled boolean NOT NULL DEFAULT false;

-- Cada autorização que uma pessoa deu a um aplicativo. Códigos e chaves só existem como resumo (hash).
CREATE TABLE mcp_grants (
    id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_email          text NOT NULL CHECK (user_email = lower(btrim(user_email)) AND btrim(user_email) <> ''),
    -- O aplicativo, como ele se apresentou, e o resumo da identificação dele.
    client_name         text NOT NULL,
    client_hash         text NOT NULL,
    redirect_uri        text NOT NULL,
    -- O código de uso único da autorização, até ser trocado pelas chaves.
    code_hash           text UNIQUE,
    code_challenge      text,
    code_expires_at     timestamptz,
    access_hash         text UNIQUE,
    access_expires_at   timestamptz,
    refresh_hash        text UNIQUE,
    refresh_expires_at  timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    last_used_at        timestamptz,
    revoked_at          timestamptz,
    revoked_by          text
);
CREATE INDEX mcp_grants_user_idx ON mcp_grants (user_email, id DESC);

-- Cada ferramenta que um assistente chamou, em nome de quem. Não guarda o que foi perguntado nem o que voltou.
CREATE TABLE mcp_calls (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    grant_id    integer REFERENCES mcp_grants (id),
    user_email  text NOT NULL,
    tool        text NOT NULL,
    ok          boolean NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mcp_calls_when_idx ON mcp_calls (created_at DESC);

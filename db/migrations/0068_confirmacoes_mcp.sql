-- Intenções imutáveis e resultados de ações confirmadas no chat.
-- Cada empresa guarda só hash do código, autoria e a evidência comercial necessária.
CREATE TABLE mcp_confirmations (
    token_hash text PRIMARY KEY,
    user_email text NOT NULL,
    tool text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
    confirmed_at timestamptz,
    result jsonb,
    CHECK ((confirmed_at IS NULL) = (result IS NULL))
);
CREATE INDEX mcp_confirmations_user_idx ON mcp_confirmations (user_email, created_at DESC);

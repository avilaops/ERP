-- Respostas dos clientes: o ERP lê a caixa de entrada da empresa (IMAP) e guarda, em cada
-- oportunidade, só as mensagens de quem é contato dela. O resto da caixa não é guardado.
ALTER TABLE mail_settings
    ADD COLUMN imap_host        text CHECK (imap_host IS NULL OR imap_host ~ '^[A-Za-z0-9.-]{3,253}$'),
    ADD COLUMN imap_port        integer CHECK (imap_port IS NULL OR imap_port BETWEEN 1 AND 65535),
    ADD COLUMN imap_username    text CHECK (imap_username IS NULL OR length(btrim(imap_username)) BETWEEN 1 AND 254),
    -- A senha só existe cifrada (AES-256-GCM, chave ERP_CERT_KEY do servidor), como a da caixa de saída.
    ADD COLUMN imap_password    bytea CHECK (imap_password IS NULL OR octet_length(imap_password) BETWEEN 1 AND 2048),
    ADD COLUMN imap_iv          bytea CHECK (imap_iv IS NULL OR octet_length(imap_iv) = 12),
    ADD COLUMN imap_tag         bytea CHECK (imap_tag IS NULL OR octet_length(imap_tag) = 16),
    -- Até onde a leitura foi: a numeração da caixa no servidor e a última mensagem vista.
    ADD COLUMN imap_uidvalidity bigint,
    ADD COLUMN imap_last_uid    bigint,
    ADD COLUMN imap_checked_at  timestamptz,
    -- Por que a última leitura não deu certo, como a tela mostra. Vazio quando deu.
    ADD COLUMN imap_problem     text,
    -- A caixa de entrada vem inteira ou não vem.
    ADD CONSTRAINT mail_settings_imap_whole CHECK (num_nulls(imap_host, imap_port, imap_username, imap_password, imap_iv, imap_tag) IN (0, 6));

CREATE TABLE opportunity_inbox (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    opportunity_id  integer NOT NULL REFERENCES opportunities (id),
    sender          text NOT NULL CHECK (sender ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    sender_name     text,
    subject         text NOT NULL,
    body            text NOT NULL,
    received_at     timestamptz NOT NULL,
    -- O identificador que a própria mensagem traz: a mesma mensagem nunca entra duas vezes.
    message_id      text NOT NULL UNIQUE CHECK (btrim(message_id) <> ''),
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX opportunity_inbox_opportunity_idx ON opportunity_inbox (opportunity_id, received_at DESC);

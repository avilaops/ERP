-- Conversas por WhatsApp pela conta oficial da empresa (API da Meta). A empresa cadastra a própria
-- conta; sem ela, nada é enviado nem recebido.
CREATE TABLE whatsapp_settings (
    id               boolean PRIMARY KEY DEFAULT true CHECK (id),
    -- O identificador do número na Meta, e o número como o cliente vê.
    phone_number_id  text NOT NULL CHECK (phone_number_id ~ '^[0-9]{5,30}$'),
    display_phone    text CHECK (display_phone IS NULL OR length(btrim(display_phone)) BETWEEN 8 AND 25),
    -- A chave de acesso e o segredo do aplicativo só existem cifrados (AES-256-GCM, chave ERP_CERT_KEY).
    token            bytea NOT NULL CHECK (octet_length(token) BETWEEN 1 AND 4096),
    token_iv         bytea NOT NULL CHECK (octet_length(token_iv) = 12),
    token_tag        bytea NOT NULL CHECK (octet_length(token_tag) = 16),
    secret           bytea NOT NULL CHECK (octet_length(secret) BETWEEN 1 AND 2048),
    secret_iv        bytea NOT NULL CHECK (octet_length(secret_iv) = 12),
    secret_tag       bytea NOT NULL CHECK (octet_length(secret_tag) = 16),
    -- O que a Meta devolve ao conferir o endereço de aviso. Gerado aqui; não abre nada.
    verify_token     text NOT NULL CHECK (verify_token ~ '^[A-Za-z0-9_-]{32}$'),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       text NOT NULL CHECK (btrim(updated_by) <> '')
);

-- Os modelos aprovados na Meta, pelo nome: é o que pode ser enviado fora das 24 horas depois da última mensagem do cliente.
CREATE TABLE whatsapp_templates (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL UNIQUE CHECK (name ~ '^[a-z0-9_]{1,100}$'),
    language    text NOT NULL DEFAULT 'pt_BR' CHECK (language ~ '^[a-z]{2}(_[A-Z]{2})?$'),
    -- O texto do modelo, para a equipe saber o que ele diz. Quem vale é o aprovado na Meta.
    preview     text NOT NULL CHECK (length(btrim(preview)) BETWEEN 2 AND 1000),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text NOT NULL CHECK (btrim(updated_by) <> '')
);

CREATE TABLE whatsapp_messages (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- O número do cliente, só dígitos, com país: é o que junta a conversa.
    contact         text NOT NULL CHECK (contact ~ '^[0-9]{8,15}$'),
    contact_name    text,
    direction       text NOT NULL CHECK (direction IN ('entrada', 'saida')),
    body            text NOT NULL CHECK (btrim(body) <> ''),
    status          text NOT NULL CHECK (status IN ('recebida', 'enviada', 'entregue', 'lida', 'falhou')),
    detail          text,
    -- O identificador da mensagem na Meta: a mesma mensagem nunca entra duas vezes.
    wa_id           text UNIQUE,
    sent_by         text,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_messages_contact_idx ON whatsapp_messages (contact, id DESC);

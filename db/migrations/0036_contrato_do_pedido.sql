-- Contrato do pedido fechado, assinado por meio eletrônico dentro do ERP.
-- O cliente recebe um link por e-mail, lê o contrato e confirma com nome, CPF e um código
-- enviado ao e-mail dele. Cada passo fica registrado, com data, hora e endereço de rede.

-- Uma linha por empresa: o modelo do contrato e a mensagem que leva o link.
CREATE TABLE contract_settings (
    id            boolean PRIMARY KEY DEFAULT true CHECK (id),
    -- Em branco, o título e o texto padrão do sistema. O texto aceita campos entre chaves
    -- ({cliente}, {equipamentos}, {pagamento}...), trocados pelos dados do pedido.
    title         text CHECK (title IS NULL OR length(btrim(title)) BETWEEN 3 AND 120),
    body          text CHECK (body IS NULL OR length(btrim(body)) BETWEEN 20 AND 60000),
    -- Por quantos dias o link de assinatura vale.
    link_days     integer NOT NULL DEFAULT 7 CHECK (link_days BETWEEN 1 AND 60),
    mail_subject  text CHECK (mail_subject IS NULL OR length(btrim(mail_subject)) BETWEEN 3 AND 150),
    mail_body     text CHECK (mail_body IS NULL OR length(btrim(mail_body)) BETWEEN 10 AND 4000),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    text NOT NULL CHECK (btrim(updated_by) <> '')
);

-- Cada contrato enviado. O texto e o PDF ficam guardados como saíram: mudar o modelo ou o
-- pedido depois não muda o que o cliente leu e assinou.
CREATE TABLE order_contracts (
    id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id         integer NOT NULL REFERENCES orders (id),
    -- 1 para o primeiro contrato do pedido, 2 para o seguinte.
    sequence         integer NOT NULL CHECK (sequence > 0),
    status           text NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado', 'assinado', 'recusado', 'cancelado')),
    title            text NOT NULL CHECK (btrim(title) <> ''),
    body             text NOT NULL CHECK (btrim(body) <> ''),
    pdf              bytea NOT NULL CHECK (octet_length(pdf) BETWEEN 100 AND 8000000),
    -- Impressão digital (SHA-256) do PDF: é ela que o registro de assinaturas cita.
    pdf_sha256       text NOT NULL CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'),
    -- O link leva um segredo; aqui fica só o SHA-256 dele.
    token_hash       text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    expires_at       timestamptz NOT NULL,
    recipient_name   text NOT NULL CHECK (btrim(recipient_name) <> ''),
    recipient_email  text NOT NULL CHECK (recipient_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    -- O código de confirmação pedido por último (só o resumo dele), quem pediu e quantas vezes errou.
    code_hash        text CHECK (code_hash IS NULL OR code_hash ~ '^[0-9a-f]{64}$'),
    code_expires_at  timestamptz,
    code_sent_at     timestamptz,
    code_attempts    integer NOT NULL DEFAULT 0 CHECK (code_attempts >= 0),
    codes_sent       integer NOT NULL DEFAULT 0 CHECK (codes_sent >= 0),
    pending_name     text,
    pending_document text CHECK (pending_document IS NULL OR pending_document ~ '^[0-9]{11}$'),
    viewed_at        timestamptz,
    signed_at        timestamptz,
    signer_name      text,
    signer_document  text CHECK (signer_document IS NULL OR signer_document ~ '^[0-9]{11}$'),
    signer_ip        text,
    signer_agent     text,
    refused_at       timestamptz,
    refusal_reason   text,
    cancelled_at     timestamptz,
    cancelled_by     text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       text NOT NULL CHECK (btrim(created_by) <> ''),
    UNIQUE (order_id, sequence),
    CHECK ((status = 'assinado') = (signed_at IS NOT NULL AND signer_name IS NOT NULL AND signer_document IS NOT NULL)),
    CHECK ((status = 'recusado') = (refused_at IS NOT NULL)),
    CHECK ((status = 'cancelado') = (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL))
);

-- Um contrato aguardando assinatura por pedido: enviar outro pede cancelar o anterior.
CREATE UNIQUE INDEX order_contracts_pending_idx ON order_contracts (order_id) WHERE status = 'enviado';
CREATE INDEX order_contracts_order_idx ON order_contracts (order_id, sequence DESC);

-- Quem assina pela empresa (vendedor, gerente, diretoria), cada um pela própria conta.
CREATE TABLE order_contract_signatures (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contract_id  integer NOT NULL REFERENCES order_contracts (id),
    email        text NOT NULL CHECK (btrim(email) <> ''),
    name         text NOT NULL CHECK (btrim(name) <> ''),
    -- Como a pessoa aparece no contrato: o perfil dela na empresa.
    role         text NOT NULL CHECK (btrim(role) <> ''),
    ip           text,
    signed_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (contract_id, email)
);

-- O que aconteceu com o contrato, em ordem: é a trilha que acompanha o PDF assinado.
CREATE TABLE order_contract_events (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contract_id  integer NOT NULL REFERENCES order_contracts (id),
    kind         text NOT NULL CHECK (kind IN ('enviado', 'email', 'visualizado', 'codigo_enviado', 'codigo_errado', 'assinado', 'assinado_empresa', 'recusado', 'cancelado')),
    detail       text,
    ip           text,
    -- Quem fez: o e-mail do usuário do ERP, ou "cliente" para o que vem do link.
    actor        text NOT NULL CHECK (btrim(actor) <> ''),
    at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_contract_events_contract_idx ON order_contract_events (contract_id, id);

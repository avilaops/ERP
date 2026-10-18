-- Cursor durável da distribuição nacional. Uma linha por empresa (o schema já isola a empresa).
CREATE TABLE fiscal_distribution_state (
    id              boolean PRIMARY KEY DEFAULT true CHECK (id),
    last_nsu        text NOT NULL DEFAULT '000000000000000' CHECK (last_nsu ~ '^\d{15}$'),
    max_nsu         text NOT NULL DEFAULT '000000000000000' CHECK (max_nsu ~ '^\d{15}$'),
    next_query_at   timestamptz NOT NULL DEFAULT now(),
    last_code       text,
    last_reason     text,
    last_queried_at timestamptz,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO fiscal_distribution_state (id) VALUES (true);

-- Cada NSU é preservado antes de o cursor avançar. Assim uma queda nunca perde o documento.
CREATE TABLE fiscal_distributed_documents (
    nsu          text PRIMARY KEY CHECK (nsu ~ '^\d{15}$'),
    schema_name  text NOT NULL CHECK (btrim(schema_name) <> ''),
    kind         text NOT NULL CHECK (kind IN ('summary', 'event', 'full')),
    xml          text NOT NULL CHECK (octet_length(xml) BETWEEN 1 AND 2097152),
    xml_sha256   text NOT NULL CHECK (xml_sha256 ~ '^[0-9a-f]{64}$'),
    received_at  timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    process_error text,
    nfe_id       bigint REFERENCES fiscal_received_nfes (id),
    UNIQUE (xml_sha256)
);

CREATE INDEX fiscal_distributed_pending_idx ON fiscal_distributed_documents (nsu) WHERE processed_at IS NULL;

-- O clique apenas enfileira. O worker assina e transmite; resultado incerto vai para revisão.
CREATE TABLE fiscal_recipient_manifestations (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nfe_id         bigint NOT NULL REFERENCES fiscal_received_nfes (id) ON DELETE RESTRICT,
    kind           text NOT NULL CHECK (kind IN ('ciencia', 'confirmacao', 'desconhecimento', 'nao_realizada')),
    reason         text,
    status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'registered', 'manual_review')),
    attempts       integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at   timestamptz NOT NULL DEFAULT now(),
    signed_xml     text,
    response_xml   text,
    protocol       text,
    status_code    text,
    status_reason  text,
    last_error     text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     text NOT NULL CHECK (btrim(created_by) <> ''),
    registered_at  timestamptz,
    UNIQUE (nfe_id, kind)
);

CREATE INDEX fiscal_recipient_manifest_pending_idx ON fiscal_recipient_manifestations (available_at, id) WHERE status = 'pending';

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

CREATE TABLE fiscal_received_nfe_summaries (
    nsu             text PRIMARY KEY REFERENCES fiscal_distributed_documents (nsu),
    access_key      text NOT NULL UNIQUE CHECK (access_key ~ '^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$'),
    issuer_document text NOT NULL CHECK (issuer_document ~ '^[0-9A-Z]{14}$'),
    issuer_name     text NOT NULL CHECK (btrim(issuer_name) <> ''),
    issued_at       timestamptz NOT NULL,
    total_invoice   numeric(14,2) NOT NULL CHECK (total_invoice >= 0),
    situation       text NOT NULL,
    full_nfe_id     bigint UNIQUE REFERENCES fiscal_received_nfes (id),
    received_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fiscal_received_nfe_summaries_pending_idx ON fiscal_received_nfe_summaries (issued_at DESC, nsu DESC) WHERE full_nfe_id IS NULL;

CREATE TABLE fiscal_received_nfe_events (
    nsu           text PRIMARY KEY REFERENCES fiscal_distributed_documents (nsu),
    access_key    text NOT NULL CHECK (access_key ~ '^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$'),
    event_type    text NOT NULL,
    sequence      integer NOT NULL CHECK (sequence > 0),
    status_code   text NOT NULL,
    protocol      text,
    registered_at timestamptz,
    xml           text NOT NULL CHECK (octet_length(xml) BETWEEN 1 AND 2097152),
    UNIQUE (access_key, event_type, sequence)
);

CREATE INDEX fiscal_received_nfe_events_key_idx ON fiscal_received_nfe_events (access_key, registered_at DESC);

-- O clique apenas enfileira. O worker assina e transmite; resultado incerto vai para revisão.
CREATE TABLE fiscal_recipient_manifestations (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nfe_id         bigint REFERENCES fiscal_received_nfes (id),
    summary_nsu    text REFERENCES fiscal_received_nfe_summaries (nsu),
    access_key     text NOT NULL CHECK (access_key ~ '^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$'),
    kind           text NOT NULL CHECK (kind IN ('ciencia', 'confirmacao', 'desconhecimento', 'nao_realizada')),
    reason         text,
    status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'registered', 'manual_review')),
    attempts       integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at   timestamptz NOT NULL DEFAULT now(),
    processing_started_at timestamptz,
    signed_xml     text,
    response_xml   text,
    protocol       text,
    status_code    text,
    status_reason  text,
    last_error     text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     text NOT NULL CHECK (btrim(created_by) <> ''),
    registered_at  timestamptz,
    CHECK ((nfe_id IS NOT NULL)::integer + (summary_nsu IS NOT NULL)::integer = 1),
    UNIQUE (access_key, kind)
);

CREATE INDEX fiscal_recipient_manifest_pending_idx ON fiscal_recipient_manifestations (available_at, id) WHERE status = 'pending';

-- A inutilizacao tambem precisa sobreviver a uma queda entre a confirmacao na
-- tela e a chamada para a SEFAZ. O XML ja assinado fica nesta fila; ele nunca
-- depende de uma nova numeracao para ser processado depois.
CREATE TABLE fiscal_void_jobs (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    environment     text NOT NULL CHECK (environment IN ('homologacao', 'producao')),
    issuer_uf       text NOT NULL CHECK (issuer_uf ~ '^[A-Z]{2}$'),
    series          integer NOT NULL CHECK (series BETWEEN 1 AND 999),
    first_number    integer NOT NULL CHECK (first_number BETWEEN 1 AND 999999999),
    last_number     integer NOT NULL CHECK (last_number BETWEEN 1 AND 999999999 AND last_number >= first_number),
    reason          text NOT NULL CHECK (length(btrim(reason)) BETWEEN 15 AND 255),
    signed_xml      text NOT NULL,
    requested_by    text NOT NULL CHECK (btrim(requested_by) <> ''),
    status          text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'concluido', 'revisao_manual')),
    attempts        integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
    run_after       timestamptz NOT NULL DEFAULT now(),
    lease_until     timestamptz,
    last_error      text,
    completed_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Um clique repetido na mesma faixa entra no mesmo trabalho pendente.
CREATE UNIQUE INDEX fiscal_void_jobs_one_active_range_idx
    ON fiscal_void_jobs (environment, series, first_number, last_number)
    WHERE status IN ('pendente', 'processando');
CREATE INDEX fiscal_void_jobs_ready_idx
    ON fiscal_void_jobs (run_after, id)
    WHERE status = 'pendente';

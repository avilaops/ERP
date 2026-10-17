-- A transmissao fiscal pode sobreviver a uma queda do processo. Cada empresa
-- tem a sua propria fila porque esta migracao roda no schema de cada tenant.
CREATE TABLE fiscal_jobs (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind            text NOT NULL CHECK (kind IN ('emitir_nfe')),
    order_id        integer NOT NULL REFERENCES orders (id),
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

-- Um clique repetido nao cria uma segunda emissao. Depois de concluido ou
-- encaminhado para revisao, uma nova solicitacao fica registrada separadamente.
CREATE UNIQUE INDEX fiscal_jobs_one_active_per_order_idx
    ON fiscal_jobs (kind, order_id)
    WHERE status IN ('pendente', 'processando');

CREATE INDEX fiscal_jobs_ready_idx
    ON fiscal_jobs (run_after, id)
    WHERE status = 'pendente';

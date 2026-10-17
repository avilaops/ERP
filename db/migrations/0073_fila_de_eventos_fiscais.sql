-- CC-e e cancelamento usam a mesma recuperacao da emissao, mas cada tipo de
-- evento tem a propria chave ativa para que um cancelamento nao se misture a
-- uma carta de correcao pendente.
ALTER TABLE fiscal_jobs DROP CONSTRAINT fiscal_jobs_kind_check;
ALTER TABLE fiscal_jobs ADD CONSTRAINT fiscal_jobs_kind_check
    CHECK (kind IN ('emitir_nfe', 'correcao_nfe', 'cancelamento_nfe'));

ALTER TABLE fiscal_jobs
    ADD COLUMN event_text text,
    ADD CONSTRAINT fiscal_jobs_event_text_check CHECK (
        (kind = 'emitir_nfe' AND event_text IS NULL)
        OR (kind IN ('correcao_nfe', 'cancelamento_nfe') AND btrim(COALESCE(event_text, '')) <> '')
    );

-- Uma nota não pode ser emitida, corrigida ou cancelada ao mesmo tempo.
DROP INDEX fiscal_jobs_one_active_per_order_idx;
CREATE UNIQUE INDEX fiscal_jobs_one_active_per_order_idx
    ON fiscal_jobs (order_id)
    WHERE status IN ('pendente', 'processando');

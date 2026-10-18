-- O worker só pode transmitir os dados fiscais que a pessoa conferiu ao clicar.
ALTER TABLE fiscal_jobs
    ADD COLUMN preparation_hash text,
    ADD CONSTRAINT fiscal_jobs_preparation_hash_check CHECK (
        preparation_hash IS NULL OR preparation_hash ~ '^[0-9a-f]{64}$'
    );

-- Uma emissão antiga ainda sem XML não preservou a preparação confirmada e
-- não pode ser reconstruída com cadastros possivelmente alterados.
UPDATE fiscal_jobs
   SET status = 'revisao_manual', lease_until = NULL,
       last_error = 'Emissão criada antes de a preparação fiscal ser preservada; confira os dados e confirme novamente.',
       updated_at = now()
 WHERE kind = 'emitir_nfe'
   AND status IN ('pendente', 'processando')
   AND invoice_id IS NULL;

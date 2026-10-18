-- Uma configuração manual do próximo número não pode reservar a mesma
-- identidade para dois pedidos antes de qualquer um deles produzir o XML.
WITH duplicated AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY environment, series, invoice_number
               ORDER BY id
           ) AS position
      FROM fiscal_jobs
     WHERE kind = 'emitir_nfe'
       AND invoice_id IS NULL
       AND invoice_number IS NOT NULL
       AND status IN ('pendente', 'processando', 'revisao_manual')
)
UPDATE fiscal_jobs j
   SET environment = NULL, series = NULL, invoice_number = NULL,
       preparation_hash = NULL, status = 'revisao_manual', lease_until = NULL,
       last_error = 'Reserva fiscal duplicada encontrada na atualização; confira a numeração e a SEFAZ antes de confirmar novamente.',
       updated_at = now()
  FROM duplicated d
 WHERE j.id = d.id AND d.position > 1;

CREATE UNIQUE INDEX fiscal_jobs_unique_reserved_number_idx
    ON fiscal_jobs (environment, series, invoice_number)
    WHERE kind = 'emitir_nfe'
      AND invoice_id IS NULL
      AND status IN ('pendente', 'processando', 'revisao_manual')
      AND invoice_number IS NOT NULL;

-- A recuperação precisa reconhecer exatamente a nota ou o evento produzido
-- por cada trabalho, sem inferir pelo ambiente atual ou repetir a operação.
ALTER TABLE fiscal_jobs
    ADD COLUMN invoice_id integer REFERENCES fiscal_invoices (id);

ALTER TABLE fiscal_invoices
    ADD COLUMN fiscal_job_id integer UNIQUE REFERENCES fiscal_jobs (id);

ALTER TABLE fiscal_invoice_events
    ADD COLUMN fiscal_job_id integer UNIQUE REFERENCES fiscal_jobs (id);

-- Jobs de evento criados pela versão anterior não guardavam a nota escolhida.
-- Só vinculamos quando há exatamente uma nota autorizada no ambiente atual;
-- qualquer ambiguidade para antes de uma operação fiscal irreversível.
WITH candidates AS (
    SELECT j.id AS job_id, min(i.id) AS invoice_id, count(*)::integer AS matches
      FROM fiscal_jobs j
      JOIN fiscal_invoices i ON i.order_id = j.order_id AND i.status = 'autorizada'
      JOIN company_settings s ON s.nfe_environment = i.environment
     WHERE j.kind IN ('correcao_nfe', 'cancelamento_nfe')
       AND j.status IN ('pendente', 'processando')
       AND j.invoice_id IS NULL
     GROUP BY j.id
)
UPDATE fiscal_jobs j
   SET invoice_id = candidates.invoice_id, updated_at = now()
  FROM candidates
 WHERE j.id = candidates.job_id AND candidates.matches = 1;

UPDATE fiscal_jobs
   SET status = 'revisao_manual', lease_until = NULL,
       last_error = 'Evento criado antes da identificação da nota; confira a nota e confirme novamente.',
       updated_at = now()
 WHERE kind IN ('correcao_nfe', 'cancelamento_nfe')
   AND status IN ('pendente', 'processando')
   AND invoice_id IS NULL;

-- O ambiente, a série e o número confirmados no clique pertencem ao trabalho.
-- Alterar os parâmetros da empresa enquanto o worker está dormindo não pode
-- redirecionar uma emissão nem consumir o contador da nova configuração.
ALTER TABLE fiscal_jobs
    ADD COLUMN environment text CHECK (environment IN ('homologacao', 'producao')),
    ADD COLUMN series integer CHECK (series >= 1 AND series <= 999),
    ADD COLUMN invoice_number integer CHECK (invoice_number >= 1 AND invoice_number <= 999999999),
    ADD CONSTRAINT fiscal_jobs_issue_target_pair CHECK (
        (environment IS NULL AND series IS NULL AND invoice_number IS NULL)
        OR (environment IS NOT NULL AND series IS NOT NULL AND invoice_number IS NOT NULL)
    );

-- Jobs já ligados a uma nota têm uma identidade comprovável.
UPDATE fiscal_jobs j
   SET environment = i.environment, series = i.series, invoice_number = i.number, updated_at = now()
  FROM fiscal_invoices i
 WHERE j.kind = 'emitir_nfe'
   AND j.invoice_id = i.id;

-- Para os demais jobs antigos, o ambiente confirmado no clique não foi
-- guardado. Inferi-lo pela configuração atual poderia emitir uma nota real.
UPDATE fiscal_jobs
   SET status = 'revisao_manual', lease_until = NULL,
       last_error = 'Emissão criada antes de o ambiente e a série serem preservados; confira a preparação fiscal e confirme novamente.',
       updated_at = now()
 WHERE kind = 'emitir_nfe'
   AND status IN ('pendente', 'processando')
   AND environment IS NULL;

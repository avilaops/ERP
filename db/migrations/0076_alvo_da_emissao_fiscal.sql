-- O ambiente e a série confirmados no clique pertencem ao trabalho. Alterar os
-- parâmetros da empresa enquanto o worker está dormindo não pode redirecionar
-- uma emissão de homologação para produção, nem trocar a série escolhida.
ALTER TABLE fiscal_jobs
    ADD COLUMN environment text CHECK (environment IN ('homologacao', 'producao')),
    ADD COLUMN series integer CHECK (series >= 1 AND series <= 999),
    ADD CONSTRAINT fiscal_jobs_issue_target_pair CHECK ((environment IS NULL) = (series IS NULL));

-- Jobs já ligados a uma nota têm uma identidade comprovável.
UPDATE fiscal_jobs j
   SET environment = i.environment, series = i.series, updated_at = now()
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

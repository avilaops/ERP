-- A recuperação precisa reconhecer exatamente a nota ou o evento produzido
-- por cada trabalho, sem inferir pelo ambiente atual ou repetir a operação.
ALTER TABLE fiscal_jobs
    ADD COLUMN invoice_id integer REFERENCES fiscal_invoices (id);

ALTER TABLE fiscal_invoices
    ADD COLUMN fiscal_job_id integer UNIQUE REFERENCES fiscal_jobs (id);

ALTER TABLE fiscal_invoice_events
    ADD COLUMN fiscal_job_id integer UNIQUE REFERENCES fiscal_jobs (id);

-- A versão anterior também não ligava a emissão à nota produzida. Não existe
-- informação suficiente para distinguir com segurança um job ainda não iniciado
-- de outro que caiu depois de transmitir; nenhum deles pode ser repetido sozinho.
UPDATE fiscal_jobs
   SET status = 'revisao_manual', lease_until = NULL,
       last_error = 'Emissão criada antes da identificação da nota; confira a nota e a SEFAZ antes de emitir novamente.',
       updated_at = now()
 WHERE kind = 'emitir_nfe'
   AND (status = 'processando' OR (status = 'pendente' AND attempts > 0))
   AND invoice_id IS NULL;

-- Um evento legado já marcado como processando pode ter sido aceito antes da
-- queda do worker. Sem fiscal_job_id no evento produzido, não há como provar
-- que a transmissão ainda não ocorreu; retomar poderia repetir uma CC-e ou um
-- cancelamento irreversível.
UPDATE fiscal_jobs
   SET status = 'revisao_manual', lease_until = NULL,
       last_error = 'Evento legado interrompido durante o processamento; confira a nota e a SEFAZ antes de confirmar novamente.',
       updated_at = now()
 WHERE kind IN ('correcao_nfe', 'cancelamento_nfe')
   AND status = 'processando'
   AND invoice_id IS NULL;

-- Jobs pendentes criados pela versão anterior não guardavam a nota escolhida.
-- Só vinculamos quando o pedido tem exatamente uma nota autorizada em todos os
-- ambientes. A configuração pode ter mudado depois do clique; usar o ambiente
-- atual nessa decisão poderia corrigir ou cancelar a nota errada.
WITH candidates AS (
    SELECT j.id AS job_id, min(i.id) AS invoice_id, count(*)::integer AS matches
      FROM fiscal_jobs j
      JOIN fiscal_invoices i ON i.order_id = j.order_id AND i.status = 'autorizada'
     WHERE j.kind IN ('correcao_nfe', 'cancelamento_nfe')
       AND j.status = 'pendente'
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
   AND status = 'pendente'
   AND invoice_id IS NULL;

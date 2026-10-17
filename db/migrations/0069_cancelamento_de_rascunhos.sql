-- Rascunhos cancelados conservam o que foi informado: não inventar cliente,
-- UF ou prazo só para encerrar uma venda. Aprovação e fechamento continuam completos.
ALTER TABLE orders DROP CONSTRAINT orders_check1;
ALTER TABLE orders ADD CONSTRAINT orders_commercial_data CHECK (
    status NOT IN ('aguardando_aprovacao', 'fechado')
    OR (customer_id IS NOT NULL AND delivery_uf IS NOT NULL AND production_days IS NOT NULL)
);

-- Consolidar duplicidade encerra a pendência, não comprova execução do trabalho.
-- O motivo fica no histórico e pode ser visto também pela equipe na UI.
ALTER TABLE opportunity_activities ADD COLUMN completion_note text
    CHECK (completion_note IS NULL OR (done_at IS NOT NULL AND length(completion_note) BETWEEN 1 AND 300));

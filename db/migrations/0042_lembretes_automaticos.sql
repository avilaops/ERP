-- Lembretes automáticos: o sistema cria a tarefa quando algo fica parado, em vez de alguém lembrar.
-- Cada regra tem um gatilho fixo e, editáveis pela empresa, o prazo em dias, o texto da tarefa e
-- se está ligada.
CREATE TABLE automation_rules (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- orcamento_parado: pedido em negociação sem alteração há N dias.
    -- contrato_pendente: contrato enviado e não assinado há N dias.
    -- parcela_vencendo: parcela em aberto que vence em até N dias.
    -- oportunidade_parada: oportunidade em andamento sem próximo passo há N dias.
    kind        text NOT NULL UNIQUE CHECK (kind IN ('orcamento_parado', 'contrato_pendente', 'parcela_vencendo', 'oportunidade_parada')),
    days        integer NOT NULL CHECK (days BETWEEN 0 AND 90),
    -- O texto da tarefa. {pedido} e {cliente} são trocados pelos dados do pedido.
    title       text NOT NULL CHECK (length(btrim(title)) BETWEEN 5 AND 200),
    active      boolean NOT NULL DEFAULT true,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text NOT NULL CHECK (btrim(updated_by) <> '')
);

INSERT INTO automation_rules (kind, days, title, updated_by) VALUES
    ('orcamento_parado', 3, 'Retomar o orçamento {pedido} com {cliente}', 'sistema'),
    ('contrato_pendente', 2, 'Cobrar a assinatura do contrato do pedido {pedido} ({cliente})', 'sistema'),
    ('parcela_vencendo', 3, 'Parcela do pedido {pedido} ({cliente}) está para vencer', 'sistema'),
    ('oportunidade_parada', 7, 'Definir o próximo passo desta oportunidade', 'sistema');

-- Uma tarefa passa a poder ser de um pedido, e não só de uma oportunidade.
ALTER TABLE opportunity_activities
    ALTER COLUMN opportunity_id DROP NOT NULL,
    ADD COLUMN order_id integer REFERENCES orders (id),
    -- O que gerou a tarefa automática. Único: o mesmo fato não gera a mesma tarefa duas vezes,
    -- nem depois de concluída.
    ADD COLUMN auto_key text UNIQUE,
    ADD CONSTRAINT opportunity_activities_subject CHECK (opportunity_id IS NOT NULL OR order_id IS NOT NULL);
CREATE INDEX opportunity_activities_order_idx ON opportunity_activities (order_id) WHERE order_id IS NOT NULL;

-- Comissão lançada à mão e cancelamento administrativo de pedido fechado.
-- Só acrescenta colunas, tabelas e uma situação de conta. Não apaga histórico.
-- Reversão:
-- DROP INDEX IF EXISTS order_cancellations_order_idx;
-- DROP TABLE IF EXISTS order_cancellations;
-- ALTER TABLE payables DROP CONSTRAINT IF EXISTS payables_status_check;
-- ALTER TABLE payables ADD CONSTRAINT payables_status_check CHECK (status IN ('aberta', 'paga'));
-- ALTER TABLE production_orders DROP CONSTRAINT IF EXISTS production_orders_cancelled_pair;
-- ALTER TABLE production_orders DROP CONSTRAINT IF EXISTS production_orders_cancelled_by_text;
-- ALTER TABLE production_orders DROP COLUMN IF EXISTS cancelled_at, DROP COLUMN IF EXISTS cancelled_by;
-- ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_one_origin;
-- ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_amount_by_origin;
-- ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_cancelled_pair;
-- ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_cancelled_unpaid;
-- ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_cancelled_by_text;
-- DROP INDEX IF EXISTS commissions_adjustment_id_key;
-- ALTER TABLE commissions DROP COLUMN IF EXISTS adjustment_id, DROP COLUMN IF EXISTS cancelled_at, DROP COLUMN IF EXISTS cancelled_by;
-- ALTER TABLE commissions ADD CONSTRAINT commissions_check CHECK ((receipt_id IS NOT NULL) <> (refund_id IS NOT NULL));
-- ALTER TABLE commissions ADD CONSTRAINT commissions_check1 CHECK ((receipt_id IS NOT NULL AND amount >= 0 AND base_amount > 0) OR (refund_id IS NOT NULL AND amount <= 0 AND base_amount < 0));
-- DROP INDEX IF EXISTS commission_adjustments_order_idx;
-- DROP INDEX IF EXISTS commission_adjustments_seller_idx;
-- DROP TABLE IF EXISTS commission_adjustments;

CREATE TABLE commission_adjustments (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    seller_email text NOT NULL CHECK (seller_email = lower(btrim(seller_email)) AND seller_email LIKE '%_@_%'),
    order_id     integer NOT NULL REFERENCES orders (id),
    action       text NOT NULL CHECK (action IN ('incluir', 'editar', 'cancelar')),
    amount       numeric(14,2) NOT NULL CHECK (amount <> 0),
    reason       text NOT NULL CHECK (length(btrim(reason)) >= 10),
    changed_by   text NOT NULL CHECK (btrim(changed_by) <> ''),
    changed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commission_adjustments_order_idx ON commission_adjustments (order_id, changed_at DESC);
CREATE INDEX commission_adjustments_seller_idx ON commission_adjustments (seller_email, changed_at DESC);

ALTER TABLE commissions
    ADD COLUMN adjustment_id bigint REFERENCES commission_adjustments (id),
    ADD COLUMN cancelled_at timestamptz,
    ADD COLUMN cancelled_by text;

-- As duas restrições antigas, nomeadas pelo PostgreSQL na criação da tabela,
-- exigiam recebimento ou estorno. O lançamento manual é a terceira origem.
-- O nome fica no esquema atual: varrer pg_class inteiro pega a mesma tabela
-- dos outros esquemas de teste e derruba a restrição duas vezes.
ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_check;
ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_check1;

ALTER TABLE commissions
    ADD CONSTRAINT commissions_one_origin CHECK (num_nonnulls(receipt_id, refund_id, adjustment_id) = 1),
    ADD CONSTRAINT commissions_amount_by_origin CHECK (
        (receipt_id IS NOT NULL AND amount >= 0 AND base_amount > 0)
        OR (refund_id IS NOT NULL AND amount <= 0 AND base_amount < 0)
        OR (adjustment_id IS NOT NULL AND amount <> 0 AND ((amount > 0 AND base_amount > 0) OR (amount < 0 AND base_amount < 0)))
    ),
    ADD CONSTRAINT commissions_cancelled_pair CHECK ((cancelled_at IS NULL) = (cancelled_by IS NULL)),
    ADD CONSTRAINT commissions_cancelled_unpaid CHECK (cancelled_at IS NULL OR paid_at IS NULL),
    ADD CONSTRAINT commissions_cancelled_by_text CHECK (cancelled_by IS NULL OR btrim(cancelled_by) <> '');

CREATE UNIQUE INDEX commissions_adjustment_id_key ON commissions (adjustment_id) WHERE adjustment_id IS NOT NULL;

ALTER TABLE production_orders
    ADD COLUMN cancelled_at timestamptz,
    ADD COLUMN cancelled_by text,
    ADD CONSTRAINT production_orders_cancelled_pair CHECK ((cancelled_at IS NULL) = (cancelled_by IS NULL)),
    ADD CONSTRAINT production_orders_cancelled_by_text CHECK (cancelled_by IS NULL OR btrim(cancelled_by) <> '');

ALTER TABLE payables DROP CONSTRAINT payables_status_check;
ALTER TABLE payables ADD CONSTRAINT payables_status_check CHECK (status IN ('aberta', 'paga', 'cancelada'));

CREATE TABLE order_cancellations (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id     integer NOT NULL REFERENCES orders (id),
    reason       text NOT NULL CHECK (length(btrim(reason)) BETWEEN 15 AND 300),
    summary      jsonb NOT NULL,
    cancelled_by text NOT NULL CHECK (btrim(cancelled_by) <> ''),
    cancelled_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_cancellations_order_idx ON order_cancellations (order_id, cancelled_at DESC);

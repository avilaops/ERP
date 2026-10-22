-- Alterações administrativas sem apagar a origem do recebível.
-- Reversão: DROP INDEX IF EXISTS receivable_adjustments_receivable_idx; DROP TABLE IF EXISTS receivable_adjustments;
CREATE TABLE receivable_adjustments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receivable_id integer NOT NULL REFERENCES receivables(id),
  action text NOT NULL CHECK (action IN ('incluir', 'editar', 'cancelar')),
  previous_state jsonb NOT NULL,
  new_state jsonb NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 10),
  changed_by text NOT NULL CHECK (btrim(changed_by) <> ''),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX receivable_adjustments_receivable_idx ON receivable_adjustments(receivable_id, changed_at DESC);

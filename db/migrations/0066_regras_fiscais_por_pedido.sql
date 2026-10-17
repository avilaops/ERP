-- A draft changes only this order's next invoice, never the accountant's defaults.
ALTER TABLE orders
  ADD COLUMN nfe_rules jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(nfe_rules) = 'object'),
  ADD COLUMN nfe_rules_revision integer NOT NULL DEFAULT 0 CHECK (nfe_rules_revision >= 0),
  ADD COLUMN nfe_rules_updated_by text,
  ADD COLUMN nfe_rules_updated_at timestamptz;

-- Provisões (perdas, garantia e inadimplência) e taxa fixa por pedido: parâmetros
-- da empresa. Entram com zero, de modo que nenhum preço muda até a diretoria
-- preencher. Cada versão publicada guarda os seus.
-- Sem nome de esquema: cada empresa tem estas tabelas no esquema dela.

ALTER TABLE pricing_params
    ADD COLUMN loss_provision      numeric(9,8) NOT NULL DEFAULT 0 CHECK (loss_provision >= 0 AND loss_provision < 1),
    ADD COLUMN warranty_provision  numeric(9,8) NOT NULL DEFAULT 0 CHECK (warranty_provision >= 0 AND warranty_provision < 1),
    ADD COLUMN default_provision   numeric(9,8) NOT NULL DEFAULT 0 CHECK (default_provision >= 0 AND default_provision < 1),
    ADD COLUMN fixed_fee_per_order numeric(14,2) NOT NULL DEFAULT 0 CHECK (fixed_fee_per_order >= 0);

ALTER TABLE price_table_versions
    ADD COLUMN loss_provision      numeric(9,8) NOT NULL DEFAULT 0 CHECK (loss_provision >= 0 AND loss_provision < 1),
    ADD COLUMN warranty_provision  numeric(9,8) NOT NULL DEFAULT 0 CHECK (warranty_provision >= 0 AND warranty_provision < 1),
    ADD COLUMN default_provision   numeric(9,8) NOT NULL DEFAULT 0 CHECK (default_provision >= 0 AND default_provision < 1),
    ADD COLUMN fixed_fee_per_order numeric(14,2) NOT NULL DEFAULT 0 CHECK (fixed_fee_per_order >= 0);

-- Despesas fixas em lista. A soma das que estão em uso é o parâmetro
-- "Despesas fixas por mês", atualizado junto com a lista.
CREATE TABLE fixed_expenses (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    label      text NOT NULL CHECK (btrim(label) <> ''),
    category   text NOT NULL CHECK (btrim(category) <> ''),
    amount     numeric(14,2) NOT NULL CHECK (amount > 0),
    -- Dia do vencimento: de 1 a 28, para existir em todo mês.
    due_day    integer NOT NULL CHECK (due_day BETWEEN 1 AND 28),
    active     boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
    UNIQUE (label)
);

-- A conta lançada a partir de uma despesa fixa diz de qual e de que mês: cada
-- despesa é lançada uma vez por mês.
ALTER TABLE payables
    ADD COLUMN fixed_expense_id integer REFERENCES fixed_expenses (id),
    ADD COLUMN reference_month  date CHECK (reference_month IS NULL OR extract(day FROM reference_month) = 1),
    ADD CHECK ((fixed_expense_id IS NULL) = (reference_month IS NULL));
CREATE UNIQUE INDEX payables_fixed_expense_month_key ON payables (fixed_expense_id, reference_month) WHERE fixed_expense_id IS NOT NULL;

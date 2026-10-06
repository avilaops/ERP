-- Formas de pagamento: lista da empresa, não do código. O pedido guarda o nome da
-- forma como estava quando foi escolhida.
-- Sem nome de esquema: cada empresa tem esta tabela no esquema dela.

CREATE TABLE payment_methods (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    label      text NOT NULL CHECK (btrim(label) <> ''),
    -- Ordem em que aparecem nas listas.
    position   integer NOT NULL DEFAULT 0,
    active     boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
    UNIQUE (label)
);

-- Valores iniciais: as formas do protótipo.
INSERT INTO payment_methods (label, position, updated_by) VALUES
    ('PIX', 1, 'migracao-0010'),
    ('Boleto', 2, 'migracao-0010'),
    ('Transferência', 3, 'migracao-0010'),
    ('Cartão de crédito', 4, 'migracao-0010'),
    ('Cartão de débito', 5, 'migracao-0010'),
    ('Cheque', 6, 'migracao-0010'),
    ('Dinheiro', 7, 'migracao-0010'),
    ('Financiamento', 8, 'migracao-0010')
ON CONFLICT (label) DO NOTHING;

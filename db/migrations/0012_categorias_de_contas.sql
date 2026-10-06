-- Categorias de contas a pagar: lista da empresa, não do código. A conta guarda o
-- nome da categoria como estava quando foi lançada.
-- Sem nome de esquema: cada empresa tem esta tabela no esquema dela.

CREATE TABLE payable_categories (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    label      text NOT NULL CHECK (btrim(label) <> ''),
    -- Ordem em que aparecem nas listas.
    position   integer NOT NULL DEFAULT 0,
    active     boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
    UNIQUE (label)
);

-- Valores iniciais: as categorias do protótipo.
INSERT INTO payable_categories (label, position, updated_by) VALUES
    ('Importação / China', 1, 'migracao-0012'),
    ('Frete e logística', 2, 'migracao-0012'),
    ('Impostos e taxas', 3, 'migracao-0012'),
    ('Folha e encargos', 4, 'migracao-0012'),
    ('Pró-labore', 5, 'migracao-0012'),
    ('Aluguel e condomínio', 6, 'migracao-0012'),
    ('Energia, água e internet', 7, 'migracao-0012'),
    ('Comissões', 8, 'migracao-0012'),
    ('Marketing', 9, 'migracao-0012'),
    ('Serviços e assessorias', 10, 'migracao-0012'),
    ('Sistemas e software', 11, 'migracao-0012'),
    ('Manutenção', 12, 'migracao-0012'),
    ('Veículos', 13, 'migracao-0012'),
    ('Empréstimos e financiamentos', 14, 'migracao-0012'),
    ('Outros', 15, 'migracao-0012')
ON CONFLICT (label) DO NOTHING;

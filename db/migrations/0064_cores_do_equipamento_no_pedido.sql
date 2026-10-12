-- O cliente escolhe a cor da estrutura e a cor do braço articulado de cada equipamento do pedido.
-- As cores disponíveis são uma lista da empresa, editada em Parâmetros → Cores; começa com as do
-- catálogo do fornecedor. O item guarda o nome da cor como foi escolhido: tirar uma cor da lista
-- não muda pedido já feito.
CREATE TABLE equipment_colors (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    part       text NOT NULL CHECK (part IN ('estrutura', 'braco')),
    name       text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 60),
    position   integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
    UNIQUE (part, name)
);

INSERT INTO equipment_colors (part, name, position, updated_by) VALUES
    ('estrutura', 'Piano Black', 1, 'sistema'),
    ('estrutura', 'Graphite Black', 2, 'sistema'),
    ('estrutura', 'Light Grey', 3, 'sistema'),
    ('estrutura', 'Performance Red', 4, 'sistema'),
    ('estrutura', 'Titanium Grey', 5, 'sistema'),
    ('braco', 'Piano Black', 1, 'sistema'),
    ('braco', 'Graphite Black', 2, 'sistema'),
    ('braco', 'Light Grey', 3, 'sistema'),
    ('braco', 'Performance Red', 4, 'sistema'),
    ('braco', 'Hermès Orange', 5, 'sistema'),
    ('braco', 'Apple Green', 6, 'sistema'),
    ('braco', 'Ocean Blue', 7, 'sistema');

ALTER TABLE order_items ADD COLUMN frame_color text, ADD COLUMN arm_color text;

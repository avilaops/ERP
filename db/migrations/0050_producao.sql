-- Controle de produção: o pedido fechado vira ordens de produção, uma por equipamento, que andam
-- por etapas que a empresa define, até ficarem prontas. Nenhum preço nem custo entra aqui.
CREATE TABLE production_stages (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 40),
    position    integer NOT NULL CHECK (position > 0),
    -- andamento: as etapas do chão de fábrica, na ordem. pronta: a última, onde a ordem termina.
    kind        text NOT NULL DEFAULT 'andamento' CHECK (kind IN ('andamento', 'pronta')),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text NOT NULL CHECK (btrim(updated_by) <> '')
);
CREATE UNIQUE INDEX production_stages_name_idx ON production_stages (lower(btrim(name)));
CREATE UNIQUE INDEX production_stages_done_idx ON production_stages (kind) WHERE kind = 'pronta';
INSERT INTO production_stages (name, position, kind, updated_by) VALUES
    ('A produzir', 1, 'andamento', 'sistema'), ('Corte', 2, 'andamento', 'sistema'), ('Solda', 3, 'andamento', 'sistema'),
    ('Pintura', 4, 'andamento', 'sistema'), ('Montagem', 5, 'andamento', 'sistema'), ('Pronto', 1, 'pronta', 'sistema');

CREATE TABLE production_orders (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- O número do pedido e a posição do equipamento nele: 261008-RUZL/2.
    number       text NOT NULL UNIQUE CHECK (btrim(number) <> ''),
    order_id     integer NOT NULL REFERENCES orders (id),
    product_id   integer NOT NULL REFERENCES products (id),
    quantity     integer NOT NULL CHECK (quantity > 0),
    stage_id     integer NOT NULL REFERENCES production_stages (id),
    -- Quando tem de ficar pronta: o prazo de fabricação do pedido, contado do fechamento. Pode ser mudado.
    due_on       date,
    notes        text CHECK (notes IS NULL OR length(notes) <= 2000),
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   text NOT NULL CHECK (btrim(created_by) <> ''),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    updated_by   text NOT NULL CHECK (btrim(updated_by) <> ''),
    finished_at  timestamptz,
    UNIQUE (order_id, product_id)
);
CREATE INDEX production_orders_stage_idx ON production_orders (stage_id, due_on);

-- Por onde cada ordem passou, com quem moveu e quando. O nome da etapa fica gravado: a etapa pode ser renomeada ou removida depois.
CREATE TABLE production_moves (
    id                   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    production_order_id  integer NOT NULL REFERENCES production_orders (id),
    stage_id             integer REFERENCES production_stages (id),
    stage_name           text NOT NULL,
    moved_at             timestamptz NOT NULL DEFAULT now(),
    moved_by             text NOT NULL CHECK (btrim(moved_by) <> '')
);
CREATE INDEX production_moves_order_idx ON production_moves (production_order_id, id);

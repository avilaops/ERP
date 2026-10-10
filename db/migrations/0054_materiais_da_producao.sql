-- Materiais da produção: o estoque de cada um, o que cada equipamento leva (lista de materiais) e
-- cada entrada e saída. Só quantidades: nenhum preço nem custo entra aqui.
CREATE TABLE materials (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
    unit        text NOT NULL CHECK (unit IN ('un', 'kg', 'm', 'm2', 'L', 'pc', 'cx')),
    -- O saldo de agora. Pode ficar negativo: a fábrica não para por causa do sistema, e a tela mostra.
    stock       numeric(14, 3) NOT NULL DEFAULT 0,
    -- Abaixo disto, a tela avisa para comprar.
    minimum     numeric(14, 3) NOT NULL DEFAULT 0 CHECK (minimum >= 0),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text NOT NULL CHECK (btrim(updated_by) <> '')
);
CREATE UNIQUE INDEX materials_name_idx ON materials (lower(btrim(name)));

-- Quanto de cada material vai em uma unidade do equipamento.
CREATE TABLE product_materials (
    product_id   integer NOT NULL REFERENCES products (id),
    material_id  integer NOT NULL REFERENCES materials (id),
    quantity     numeric(14, 4) NOT NULL CHECK (quantity > 0),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    updated_by   text NOT NULL CHECK (btrim(updated_by) <> ''),
    PRIMARY KEY (product_id, material_id)
);

-- Cada entrada e saída. A quantidade é o quanto o saldo mudou: positiva entra, negativa sai.
CREATE TABLE material_moves (
    id                   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    material_id          integer NOT NULL REFERENCES materials (id),
    -- entrada e saida: à mão. ajuste: acerto de contagem. consumo e estorno: da ordem de produção que ficou pronta, ou deixou de estar.
    kind                 text NOT NULL CHECK (kind IN ('entrada', 'saida', 'ajuste', 'consumo', 'estorno')),
    quantity             numeric(14, 3) NOT NULL CHECK (quantity <> 0),
    note                 text CHECK (note IS NULL OR length(note) <= 200),
    -- Vazio depois que a ordem sai da produção.
    production_order_id  integer REFERENCES production_orders (id),
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           text NOT NULL CHECK (btrim(created_by) <> '')
);
CREATE INDEX material_moves_material_idx ON material_moves (material_id, id DESC);
CREATE INDEX material_moves_order_idx ON material_moves (production_order_id) WHERE production_order_id IS NOT NULL;

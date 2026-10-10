-- Apontamento de horas na produção e as máquinas (ou postos de trabalho) da fábrica.
CREATE TABLE machines (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 60),
    active      boolean NOT NULL DEFAULT true,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text NOT NULL CHECK (btrim(updated_by) <> '')
);
CREATE UNIQUE INDEX machines_name_idx ON machines (lower(btrim(name)));

-- Cada período em que alguém trabalhou numa ordem: quem, em que etapa, em que máquina, de quando a quando.
CREATE TABLE production_work (
    id                   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    production_order_id  integer NOT NULL REFERENCES production_orders (id),
    -- O nome da etapa fica gravado: a etapa pode ser renomeada ou removida depois.
    stage_name           text NOT NULL,
    machine_id           integer REFERENCES machines (id),
    worker_email         text NOT NULL CHECK (btrim(worker_email) <> ''),
    worker_name          text NOT NULL CHECK (btrim(worker_name) <> ''),
    started_at           timestamptz NOT NULL DEFAULT now(),
    -- Vazio enquanto a pessoa está trabalhando.
    ended_at             timestamptz,
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);
-- Uma pessoa trabalha em uma ordem por vez.
CREATE UNIQUE INDEX production_work_open_idx ON production_work (worker_email) WHERE ended_at IS NULL;
CREATE INDEX production_work_order_idx ON production_work (production_order_id, id);

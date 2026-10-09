-- Funil comercial: o que acontece antes do pedido.
-- Uma oportunidade é uma venda possível, de um cliente do cadastro ou de uma empresa que ainda
-- não é cliente. Ela anda por etapas que a empresa define, tem atividades (tarefa, ligação,
-- reunião, anotação) e, quando vira orçamento, fica ligada ao pedido.

-- As etapas do funil, na ordem em que aparecem. A empresa cria, renomeia, reordena e remove.
CREATE TABLE pipeline_stages (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 40),
    position    integer NOT NULL CHECK (position > 0),
    -- aberta: a venda está em andamento. ganha e perdida fecham a oportunidade; há uma de cada.
    kind        text NOT NULL DEFAULT 'aberta' CHECK (kind IN ('aberta', 'ganha', 'perdida')),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text NOT NULL CHECK (btrim(updated_by) <> ''),
    UNIQUE (name)
);
CREATE UNIQUE INDEX pipeline_stages_closing_idx ON pipeline_stages (kind) WHERE kind <> 'aberta';

INSERT INTO pipeline_stages (name, position, kind, updated_by) VALUES
    ('Novo', 1, 'aberta', 'sistema'),
    ('Contato feito', 2, 'aberta', 'sistema'),
    ('Proposta enviada', 3, 'aberta', 'sistema'),
    ('Negociação', 4, 'aberta', 'sistema'),
    ('Ganho', 5, 'ganha', 'sistema'),
    ('Perdido', 6, 'perdida', 'sistema');

CREATE TABLE opportunities (
    id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- O que está sendo vendido, em poucas palavras: "Academia nova, 12 estações".
    title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 120),
    -- Cliente do cadastro, quando já é um; senão, o nome da empresa ou da pessoa.
    customer_id      integer REFERENCES customers (id),
    company          text CHECK (company IS NULL OR length(btrim(company)) BETWEEN 2 AND 120),
    contact_name     text,
    phone            text,
    email            text CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    -- De onde veio: indicação, Instagram, feira...
    source           text,
    estimated_value  numeric(14, 2) CHECK (estimated_value IS NULL OR estimated_value >= 0),
    stage_id         integer NOT NULL REFERENCES pipeline_stages (id),
    -- De quem é: o vendedor que a acompanha.
    owner_email      text NOT NULL CHECK (btrim(owner_email) <> ''),
    owner_name       text NOT NULL CHECK (btrim(owner_name) <> ''),
    -- O pedido em que virou. Excluir o pedido desfaz a ligação antes (na mesma instrução que o exclui).
    order_id         integer REFERENCES orders (id),
    lost_reason      text,
    notes            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       text NOT NULL CHECK (btrim(created_by) <> ''),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       text NOT NULL CHECK (btrim(updated_by) <> ''),
    -- Quando foi ganha ou perdida.
    closed_at        timestamptz,
    CHECK (customer_id IS NOT NULL OR company IS NOT NULL)
);
CREATE INDEX opportunities_stage_idx ON opportunities (stage_id, updated_at DESC);
CREATE INDEX opportunities_owner_idx ON opportunities (owner_email);

-- O que foi feito e o que falta fazer em cada oportunidade.
CREATE TABLE opportunity_activities (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    opportunity_id  integer NOT NULL REFERENCES opportunities (id),
    kind            text NOT NULL CHECK (kind IN ('tarefa', 'ligacao', 'reuniao', 'nota')),
    title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 300),
    -- Para quando é. Uma anotação não tem data nem fica pendente.
    due_on          date,
    done_at         timestamptz,
    done_by         text,
    owner_email     text NOT NULL CHECK (btrim(owner_email) <> ''),
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text NOT NULL CHECK (btrim(created_by) <> ''),
    CHECK ((done_at IS NULL) = (done_by IS NULL)),
    CHECK (kind <> 'nota' OR due_on IS NULL)
);
CREATE INDEX opportunity_activities_pending_idx ON opportunity_activities (owner_email, due_on) WHERE done_at IS NULL AND kind <> 'nota';
CREATE INDEX opportunity_activities_opportunity_idx ON opportunity_activities (opportunity_id, id DESC);

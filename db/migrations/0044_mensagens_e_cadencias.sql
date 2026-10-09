-- Mensagens por e-mail a partir da oportunidade, com modelos, e cadências: uma sequência de
-- e-mails e tarefas que o sistema segue sozinho.

-- Modelos de mensagem da empresa. O texto aceita {contato}, {empresa}, {vendedor} e {minha_empresa}.
CREATE TABLE message_templates (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 2 AND 60),
    subject     text NOT NULL CHECK (length(btrim(subject)) BETWEEN 3 AND 150 AND subject !~ '[\r\n]'),
    body        text NOT NULL CHECK (length(btrim(body)) BETWEEN 10 AND 4000),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text NOT NULL CHECK (btrim(updated_by) <> '')
);

-- Cada e-mail que saiu de uma oportunidade, com o resultado. Nenhum sai sem registro.
CREATE TABLE opportunity_messages (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    opportunity_id  integer NOT NULL REFERENCES opportunities (id),
    recipient       text NOT NULL CHECK (recipient ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    subject         text NOT NULL CHECK (btrim(subject) <> ''),
    body            text NOT NULL CHECK (btrim(body) <> ''),
    status          text NOT NULL CHECK (status IN ('enviado', 'falhou')),
    detail          text,
    -- Quem enviou: o e-mail do usuário, ou "cadência" para o que o sistema enviou sozinho.
    sent_by         text NOT NULL CHECK (btrim(sent_by) <> ''),
    sent_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX opportunity_messages_opportunity_idx ON opportunity_messages (opportunity_id, id DESC);

-- A cadência: um nome e os seus passos, na ordem.
CREATE TABLE cadences (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 2 AND 60),
    active      boolean NOT NULL DEFAULT true,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text NOT NULL CHECK (btrim(updated_by) <> '')
);

CREATE TABLE cadence_steps (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cadence_id   integer NOT NULL REFERENCES cadences (id),
    position     integer NOT NULL CHECK (position > 0),
    -- Dias de espera depois do passo anterior (ou do início, para o primeiro).
    wait_days    integer NOT NULL CHECK (wait_days BETWEEN 0 AND 90),
    -- email: envia o modelo. tarefa: cria a tarefa para o vendedor.
    kind         text NOT NULL CHECK (kind IN ('email', 'tarefa')),
    template_id  integer REFERENCES message_templates (id),
    task_title   text CHECK (task_title IS NULL OR length(btrim(task_title)) BETWEEN 2 AND 200),
    UNIQUE (cadence_id, position),
    CHECK ((kind = 'email') = (template_id IS NOT NULL)),
    CHECK ((kind = 'tarefa') = (task_title IS NOT NULL))
);

-- Uma oportunidade seguindo uma cadência.
CREATE TABLE opportunity_cadences (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    opportunity_id  integer NOT NULL REFERENCES opportunities (id),
    cadence_id      integer NOT NULL REFERENCES cadences (id),
    -- O próximo passo a executar e quando.
    next_position   integer NOT NULL CHECK (next_position > 0),
    next_at         timestamptz NOT NULL,
    status          text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'concluida', 'parada')),
    -- Por que parou: pela pessoa, porque a venda fechou, porque falta o e-mail do contato.
    stopped_reason  text,
    started_at      timestamptz NOT NULL DEFAULT now(),
    started_by      text NOT NULL CHECK (btrim(started_by) <> ''),
    finished_at     timestamptz
);
-- Uma cadência ativa por oportunidade.
CREATE UNIQUE INDEX opportunity_cadences_active_idx ON opportunity_cadences (opportunity_id) WHERE status = 'ativa';
CREATE INDEX opportunity_cadences_due_idx ON opportunity_cadences (next_at) WHERE status = 'ativa';

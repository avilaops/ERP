-- Reunião marcada a partir de uma oportunidade, com convite por e-mail (arquivo de agenda) ao contato.
-- A ligação registrada não pede tabela: é uma atividade do tipo "ligacao" já concluída.
CREATE TABLE opportunity_meetings (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    opportunity_id  integer NOT NULL REFERENCES opportunities (id),
    -- A tarefa que faz a reunião aparecer em Tarefas e no funil. Vazia se alguém a removeu.
    activity_id     integer REFERENCES opportunity_activities (id),
    title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 120),
    starts_at       timestamptz NOT NULL,
    minutes         integer NOT NULL CHECK (minutes BETWEEN 15 AND 480),
    -- Endereço da videochamada (https) ou o lugar do encontro. Um dos dois, ou nenhum.
    link            text CHECK (link IS NULL OR (link ~ '^https://[^[:space:]]+$' AND length(link) <= 500)),
    place           text CHECK (place IS NULL OR length(btrim(place)) BETWEEN 2 AND 200),
    -- Para quem o convite foi; vazio quando a reunião não foi enviada a ninguém.
    invited         text CHECK (invited IS NULL OR invited ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    -- O que identifica a reunião na agenda de quem recebe, e a versão dela: sobe a cada remarcação.
    uid             text NOT NULL UNIQUE CHECK (btrim(uid) <> ''),
    sequence        integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
    status          text NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada', 'cancelada')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text NOT NULL CHECK (btrim(created_by) <> ''),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      text NOT NULL CHECK (btrim(updated_by) <> '')
);
CREATE INDEX opportunity_meetings_opportunity_idx ON opportunity_meetings (opportunity_id, starts_at);

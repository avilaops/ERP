-- Marketing: campanha de e-mail para um público da própria base, com descadastro, e formulário
-- de captura que cria a oportunidade no funil.

-- Quem pediu para não receber mais e-mail automático (campanha e cadência). Vale para a empresa toda.
CREATE TABLE mail_optouts (
    email       text PRIMARY KEY CHECK (email = lower(btrim(email)) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    -- descadastro: a própria pessoa, pelo link do e-mail. manual: alguém da equipe, a pedido.
    origin      text NOT NULL CHECK (origin IN ('descadastro', 'manual')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  text NOT NULL CHECK (btrim(created_by) <> '')
);

-- O endereço de descadastro de cada destinatário: um por e-mail, o mesmo em todo envio.
CREATE TABLE mail_unsubscribe_links (
    email       text PRIMARY KEY CHECK (email = lower(btrim(email))),
    token       text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{43}$'),
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Quantos e-mails de campanha a empresa envia por dia. A caixa de e-mail comum bloqueia quem passa disso.
CREATE TABLE marketing_settings (
    id           boolean PRIMARY KEY DEFAULT true CHECK (id),
    daily_limit  integer NOT NULL DEFAULT 200 CHECK (daily_limit BETWEEN 1 AND 5000),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    updated_by   text NOT NULL DEFAULT 'sistema' CHECK (btrim(updated_by) <> '')
);
INSERT INTO marketing_settings (id) VALUES (true);

CREATE TABLE campaigns (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
    subject      text NOT NULL CHECK (length(btrim(subject)) BETWEEN 3 AND 150 AND subject !~ '[\r\n]'),
    body         text NOT NULL CHECK (length(btrim(body)) BETWEEN 10 AND 4000),
    -- Para quem: os clientes do cadastro, os contatos das oportunidades em andamento ou os das perdidas.
    audience     text NOT NULL CHECK (audience IN ('clientes', 'abertas', 'perdidas')),
    -- Só os clientes deste estado; vazio é todos. Vale para o público "clientes".
    uf           text CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
    status       text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviando', 'concluida', 'cancelada')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   text NOT NULL CHECK (btrim(created_by) <> ''),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    updated_by   text NOT NULL CHECK (btrim(updated_by) <> ''),
    started_at   timestamptz,
    started_by   text,
    finished_at  timestamptz
);
CREATE UNIQUE INDEX campaigns_name_idx ON campaigns (lower(btrim(name)));

-- A lista de quem recebe, tirada no momento em que a campanha começa. Cada linha sai uma vez só.
CREATE TABLE campaign_recipients (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_id  integer NOT NULL REFERENCES campaigns (id),
    email        text NOT NULL CHECK (email = lower(btrim(email))),
    contact      text NOT NULL,
    company      text NOT NULL,
    -- fila: ainda não saiu. pulado: a pessoa se descadastrou antes, ou a campanha foi cancelada.
    status       text NOT NULL DEFAULT 'fila' CHECK (status IN ('fila', 'enviado', 'falhou', 'pulado')),
    detail       text,
    -- Quando a rotina pegou a linha para enviar: quem pega é o único a enviar.
    taken_at     timestamptz,
    sent_at      timestamptz,
    UNIQUE (campaign_id, email)
);
CREATE INDEX campaign_recipients_queue_idx ON campaign_recipients (campaign_id, id) WHERE status = 'fila';
CREATE INDEX campaign_recipients_sent_idx ON campaign_recipients (sent_at) WHERE status = 'enviado';

-- Formulário de captura: uma página pública, sem login, que cria uma oportunidade na primeira etapa.
CREATE TABLE capture_forms (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 60),
    -- O que o visitante lê no alto da página.
    title        text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 100),
    intro        text CHECK (intro IS NULL OR length(intro) <= 600),
    -- O fim do endereço da página. Não é segredo: é o que deixa o endereço impossível de adivinhar em série.
    token        text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{22}$'),
    -- Quem recebe as oportunidades deste formulário.
    owner_email  text NOT NULL CHECK (btrim(owner_email) <> ''),
    owner_name   text NOT NULL CHECK (btrim(owner_name) <> ''),
    active       boolean NOT NULL DEFAULT true,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    updated_by   text NOT NULL CHECK (btrim(updated_by) <> '')
);
CREATE UNIQUE INDEX capture_forms_name_idx ON capture_forms (lower(btrim(name)));

-- Cada envio do formulário: a prova do aceite e o que segura o abuso (envios por endereço de rede).
CREATE TABLE capture_submissions (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    form_id         integer NOT NULL REFERENCES capture_forms (id),
    -- Vazio depois que a oportunidade é removida.
    opportunity_id  integer REFERENCES opportunities (id),
    email           text NOT NULL,
    -- O texto do aceite como a pessoa leu.
    consent         text NOT NULL CHECK (btrim(consent) <> ''),
    ip              text,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX capture_submissions_form_idx ON capture_submissions (form_id, created_at DESC);

-- Dados da empresa (logo), usuários, histórico de parâmetros e auditoria.
-- Sem nome de esquema: cada empresa tem estas tabelas no esquema dela.

-- A empresa: uma linha só. A logo é editável pela diretoria, em Parâmetros.
CREATE TABLE company_settings (
    id              boolean PRIMARY KEY DEFAULT true CHECK (id),
    -- A imagem da logo, como foi enviada. Nulo: o menu mostra o nome da empresa.
    logo            bytea CHECK (logo IS NULL OR octet_length(logo) BETWEEN 1 AND 524288),
    logo_type       text CHECK (logo_type IN ('image/png', 'image/jpeg', 'image/webp')),
    logo_updated_at timestamptz,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      text NOT NULL CHECK (btrim(updated_by) <> ''),
    CHECK ((logo IS NULL) = (logo_type IS NULL))
);

INSERT INTO company_settings (id, updated_by) VALUES (true, 'migracao-0008') ON CONFLICT (id) DO NOTHING;

-- Usuários da empresa e o perfil de cada um. Enquanto a tela Equipe e acessos não
-- existir, quem entra continua vindo da configuração (ERP_USERS).
CREATE TABLE users (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Sempre em minúsculas: é como o login central entrega.
    email      text NOT NULL CHECK (email = lower(btrim(email)) AND email LIKE '%_@_%'),
    name       text NOT NULL CHECK (btrim(name) <> ''),
    role       text NOT NULL CHECK (role IN ('DIRETORIA', 'GERENTE_COMERCIAL', 'VENDEDOR', 'FINANCEIRO')),
    active     boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
    UNIQUE (email)
);

-- Cada gravação dos parâmetros, como ficou: quem mudou, quando e para quê.
CREATE TABLE pricing_params_history (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    changed_at timestamptz NOT NULL DEFAULT now(),
    changed_by text NOT NULL CHECK (btrim(changed_by) <> ''),
    -- Os parâmetros inteiros daquele momento, com as alíquotas por estado.
    params     jsonb NOT NULL
);

CREATE INDEX pricing_params_history_changed_at_idx ON pricing_params_history (changed_at DESC);

-- Auditoria: quem fez o quê, em qual registro, com o antes e o depois.
-- Só se acrescenta: linha de auditoria não se altera nem se apaga.
CREATE TABLE audit_log (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at        timestamptz NOT NULL DEFAULT now(),
    actor     text NOT NULL CHECK (btrim(actor) <> ''),
    -- O que foi feito, em minúsculas: 'pedido.fechar', 'tabela.publicar'…
    action    text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.]*$'),
    entity    text NOT NULL CHECK (btrim(entity) <> ''),
    entity_id text NOT NULL,
    before    jsonb,
    after     jsonb
);

CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id, at DESC);
CREATE INDEX audit_log_at_idx ON audit_log (at DESC);

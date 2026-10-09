-- Empresas que entraram pelo cadastro do site (as de ERP_TENANTS continuam na
-- configuração). Este esquema é do sistema, não de uma empresa: guarda só quem
-- existe, de quem é e como está a mensalidade. Nenhum dado de operação mora aqui.
CREATE TABLE companies (
    -- Vira o nome do esquema da empresa (tenant_<slug>): mesmo formato de ERP_TENANTS.
    slug              text PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9_]{1,30}$'),
    name              text NOT NULL CHECK (btrim(name) <> ''),
    owner_email       text NOT NULL CHECK (owner_email = lower(btrim(owner_email)) AND owner_email LIKE '%_@_%'),
    owner_name        text NOT NULL CHECK (btrim(owner_name) <> ''),
    -- AGUARDANDO_CARTAO: cadastrou e ainda não cadastrou o cartão; não entra.
    -- EM_TESTE: cartão cadastrado, dentro dos dias grátis. ATIVA: mensalidade em dia.
    -- INADIMPLENTE: a cobrança falhou. CANCELADA: mensalidade encerrada.
    status            text NOT NULL CHECK (status IN ('AGUARDANDO_CARTAO', 'EM_TESTE', 'ATIVA', 'INADIMPLENTE', 'CANCELADA')),
    monthly_cents     integer NOT NULL CHECK (monthly_cents > 0),
    trial_ends_at     timestamptz,
    -- A mensalidade no Mercado Pago (preapproval) e o link em que se cadastra o cartão.
    mp_preapproval_id text UNIQUE,
    mp_init_point     text,
    last_payment_at   timestamptz,
    -- Quando o esquema da empresa foi criado e migrado. Nulo: ainda não existe.
    provisioned_at    timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Em quais empresas cadastradas um e-mail entra. É o índice que o login consulta:
-- sem ele seria preciso perguntar a cada empresa do sistema, uma a uma. O perfil
-- e as telas continuam no cadastro de usuários da própria empresa.
CREATE TABLE members (
    email text NOT NULL CHECK (email = lower(btrim(email)) AND email LIKE '%_@_%'),
    slug  text NOT NULL REFERENCES companies (slug) ON DELETE CASCADE,
    PRIMARY KEY (email, slug)
);
CREATE INDEX members_slug_idx ON members (slug);

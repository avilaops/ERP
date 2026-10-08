-- Perfis de acesso da própria empresa (ex.: "Fiscal", "Vendedor sem comissão"). Cada um parte de
-- um dos quatro tipos do sistema e só tira dele: telas e poderes. Nunca dá o que o tipo de origem
-- não tem. Quem tem o perfil recebe as telas e os poderes dele; mudar o perfil muda para todos.
CREATE TABLE access_profiles (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 40),
    -- O tipo de origem: é ele que diz o máximo que o perfil alcança.
    base_role  text NOT NULL CHECK (base_role IN ('DIRETORIA', 'GERENTE_COMERCIAL', 'VENDEDOR', 'FINANCEIRO')),
    -- As telas que o perfil abre, dentre as do tipo de origem.
    items      text[] NOT NULL CHECK (cardinality(items) > 0),
    -- Os poderes do tipo de origem que este perfil NÃO tem (ver POWERS em src/lib/auth/permissions.ts).
    denied     text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL CHECK (btrim(updated_by) <> '')
);
CREATE UNIQUE INDEX access_profiles_name_idx ON access_profiles (lower(btrim(name)));

-- A pessoa com perfil próprio: o tipo (`role`) fica igual ao de origem do perfil, e as telas vêm dele.
ALTER TABLE users ADD COLUMN profile_id integer REFERENCES access_profiles (id);
CREATE INDEX users_profile_idx ON users (profile_id) WHERE profile_id IS NOT NULL;

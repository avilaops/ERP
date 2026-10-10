-- Prospecção pela base aberta da Receita Federal: a empresa escolhe os ramos (CNAE) e os estados que
-- interessam, e só as empresas ativas desse recorte são trazidas. A base inteira não é guardada.
CREATE TABLE prospect_filters (
    id          boolean PRIMARY KEY DEFAULT true CHECK (id),
    -- Códigos de atividade principal (CNAE), 7 dígitos cada.
    cnaes       text[] NOT NULL DEFAULT '{}',
    -- Estados (UF). Vazio é o Brasil todo.
    ufs         text[] NOT NULL DEFAULT '{}',
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text NOT NULL DEFAULT 'sistema' CHECK (btrim(updated_by) <> '')
);
INSERT INTO prospect_filters (id) VALUES (true);

-- Cada carga pedida, com o andamento. Uma por vez.
CREATE TABLE prospect_loads (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    status        text NOT NULL DEFAULT 'pedida' CHECK (status IN ('pedida', 'rodando', 'concluida', 'falhou')),
    -- O recorte como estava quando a carga foi pedida.
    cnaes         text[] NOT NULL,
    ufs           text[] NOT NULL,
    -- O mês da base da Receita que foi lido, como 2026-09.
    month         text,
    -- Quantos arquivos já foram lidos por inteiro: a carga interrompida continua do seguinte.
    step          integer NOT NULL DEFAULT 0 CHECK (step BETWEEN 0 AND 20),
    read_rows     bigint NOT NULL DEFAULT 0,
    kept_rows     integer NOT NULL DEFAULT 0,
    -- Em que passo está, ou por que falhou.
    detail        text,
    requested_at  timestamptz NOT NULL DEFAULT now(),
    requested_by  text NOT NULL CHECK (btrim(requested_by) <> ''),
    started_at    timestamptz,
    finished_at   timestamptz
);
CREATE UNIQUE INDEX prospect_loads_one_idx ON prospect_loads ((true)) WHERE status IN ('pedida', 'rodando');

ALTER TABLE prospects ADD COLUMN cnae text CHECK (cnae IS NULL OR cnae ~ '^[0-9]{7}$');
CREATE INDEX prospects_cnae_idx ON prospects (cnae);

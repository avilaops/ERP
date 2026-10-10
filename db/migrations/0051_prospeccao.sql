-- Prospecção: empresas que ainda não são clientes, trazidas da Receita Federal pelo CNPJ, para a
-- equipe filtrar e transformar em oportunidade. Só dados da empresa: nenhum sócio, nenhuma pessoa.
CREATE TABLE prospects (
    cnpj            text PRIMARY KEY CHECK (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
    legal_name      text NOT NULL CHECK (btrim(legal_name) <> ''),
    trade_name      text,
    -- Como a Receita informou: ATIVA, BAIXADA, INAPTA…
    registry_status text NOT NULL,
    activity        text,
    size            text,
    opened_on       date,
    street          text,
    street_number   text,
    district        text,
    city            text,
    uf              text CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
    cep             text CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$'),
    phone           text CHECK (phone IS NULL OR phone ~ '^[0-9]{10,11}$'),
    email           text,
    -- novo: ainda ninguém trabalhou. descartado: não interessa. virou: já é oportunidade.
    status          text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'descartado', 'virou')),
    opportunity_id  integer REFERENCES opportunities (id),
    -- De onde veio o dado e quando: a origem fica registrada.
    source          text NOT NULL DEFAULT 'Receita Federal (consulta pública)',
    loaded_at       timestamptz NOT NULL DEFAULT now(),
    loaded_by       text NOT NULL CHECK (btrim(loaded_by) <> ''),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      text NOT NULL CHECK (btrim(updated_by) <> ''),
    CHECK ((status = 'virou') = (opportunity_id IS NOT NULL))
);
CREATE INDEX prospects_place_idx ON prospects (uf, city);
CREATE INDEX prospects_status_idx ON prospects (status, loaded_at DESC);

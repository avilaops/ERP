-- Ligação pelo sistema: o provedor de telefonia liga para o vendedor e, quando ele atende, conecta
-- com o cliente. Desligada por padrão: cada ligação tem custo por minuto.
CREATE TABLE voice_settings (
    id             boolean PRIMARY KEY DEFAULT true CHECK (id),
    enabled        boolean NOT NULL DEFAULT false,
    -- Quantas ligações a empresa faz pelo sistema por mês.
    monthly_limit  integer NOT NULL DEFAULT 300 CHECK (monthly_limit BETWEEN 1 AND 20000),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    updated_by     text NOT NULL DEFAULT 'sistema' CHECK (btrim(updated_by) <> '')
);
INSERT INTO voice_settings (id) VALUES (true);

-- Cada ligação pedida, com o identificador que o provedor devolveu. É o registro do uso.
CREATE TABLE voice_calls (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Vazio depois que a oportunidade é removida: o uso continua contado.
    opportunity_id  integer REFERENCES opportunities (id),
    provider_id     text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text NOT NULL CHECK (btrim(created_by) <> '')
);
CREATE INDEX voice_calls_month_idx ON voice_calls (created_at);

-- O telefone em que cada pessoa da equipe atende as ligações do sistema. Quem informa é a própria pessoa.
ALTER TABLE users ADD COLUMN call_phone text CHECK (call_phone IS NULL OR call_phone ~ '^55[0-9]{10,11}$');

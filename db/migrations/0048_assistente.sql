-- Assistente (inteligência artificial): resume a oportunidade, sugere o próximo passo e rascunha a
-- resposta ao cliente. Desligado por padrão: ligar é decisão da empresa, porque o texto da
-- oportunidade é enviado a um serviço de fora para ser lido.
CREATE TABLE ai_settings (
    id             boolean PRIMARY KEY DEFAULT true CHECK (id),
    enabled        boolean NOT NULL DEFAULT false,
    -- Quantos pedidos ao assistente a empresa faz por mês. Cada um tem custo.
    monthly_limit  integer NOT NULL DEFAULT 200 CHECK (monthly_limit BETWEEN 1 AND 20000),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    updated_by     text NOT NULL DEFAULT 'sistema' CHECK (btrim(updated_by) <> '')
);
INSERT INTO ai_settings (id) VALUES (true);

-- Cada pedido ao assistente, com o que ele devolveu: é o registro do uso e o que a tela mostra.
CREATE TABLE opportunity_assists (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Vazio depois que a oportunidade é removida: o uso continua contado.
    opportunity_id  integer REFERENCES opportunities (id),
    kind            text NOT NULL CHECK (kind IN ('resumo', 'rascunho')),
    -- resumo: {resumo, proxima_acao, nota, motivo}. rascunho: {assunto, texto}.
    content         jsonb NOT NULL,
    model           text NOT NULL,
    input_tokens    integer NOT NULL CHECK (input_tokens >= 0),
    output_tokens   integer NOT NULL CHECK (output_tokens >= 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text NOT NULL CHECK (btrim(created_by) <> '')
);
CREATE INDEX opportunity_assists_opportunity_idx ON opportunity_assists (opportunity_id, kind, id DESC);
CREATE INDEX opportunity_assists_month_idx ON opportunity_assists (created_at);

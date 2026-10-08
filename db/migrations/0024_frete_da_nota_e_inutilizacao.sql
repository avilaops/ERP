-- Modalidade do frete da nota, escolhida no pedido entre as opções do leiaute
-- (modFrete), e a inutilização de faixas de numeração.
-- Sem nome de esquema: cada empresa tem estas tabelas no esquema dela.

-- 0 remetente (CIF), 1 destinatário (FOB), 2 terceiros, 3 transporte próprio do
-- remetente, 4 transporte próprio do destinatário, 9 sem transporte. Nulo: ninguém
-- escolheu ainda, e a nota usa a sugestão (0 se o pedido tem frete por nossa conta, senão 1).
ALTER TABLE orders ADD COLUMN nfe_freight_mode text CHECK (nfe_freight_mode IN ('0', '1', '2', '3', '4', '9'));

-- Números que a SEFAZ registrou como inutilizados: não viram nota nunca mais.
CREATE TABLE fiscal_number_voids (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    environment  text NOT NULL CHECK (environment IN ('homologacao', 'producao')),
    series       integer NOT NULL CHECK (series BETWEEN 1 AND 999),
    first_number integer NOT NULL CHECK (first_number BETWEEN 1 AND 999999999),
    last_number  integer NOT NULL CHECK (last_number BETWEEN 1 AND 999999999),
    reason       text NOT NULL CHECK (length(btrim(reason)) >= 15),
    signed_xml   text NOT NULL,
    protocol     text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   text NOT NULL CHECK (btrim(created_by) <> ''),
    CHECK (last_number >= first_number)
);

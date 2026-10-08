-- Notas fiscais emitidas: cada tentativa de emissão de um pedido, com o XML
-- assinado e, quando a SEFAZ autoriza, o protocolo e o arquivo final.
-- Sem nome de esquema: cada empresa tem estas tabelas no esquema dela.

CREATE TABLE fiscal_invoices (
    id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id       integer NOT NULL REFERENCES orders (id),
    -- Nota de homologação não tem valor fiscal e tem numeração à parte.
    environment    text NOT NULL CHECK (environment IN ('homologacao', 'producao')),
    series         integer NOT NULL CHECK (series BETWEEN 1 AND 999),
    number         integer NOT NULL CHECK (number BETWEEN 1 AND 999999999),
    access_key     text NOT NULL CHECK (access_key ~ '^[0-9]{44}$'),
    -- assinada: enviada ou a enviar, sem veredito. autorizada e denegada gastam o número; rejeitada pode ser corrigida e reenviada com ele.
    status         text NOT NULL CHECK (status IN ('assinada', 'autorizada', 'rejeitada', 'denegada')),
    signed_xml     text NOT NULL,
    -- A nota com o protocolo (nfeProc): o arquivo que a empresa guarda e manda ao cliente.
    authorized_xml text,
    protocol       text,
    -- O que a SEFAZ respondeu por último: código e motivo.
    status_code    text,
    status_reason  text,
    issued_at      timestamptz NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     text NOT NULL CHECK (btrim(created_by) <> ''),
    UNIQUE (environment, series, number),
    CHECK ((status = 'autorizada') = (authorized_xml IS NOT NULL AND protocol IS NOT NULL) OR status = 'denegada')
);

-- Um pedido tem no máximo uma nota autorizada por ambiente.
CREATE UNIQUE INDEX fiscal_invoices_one_authorized_idx ON fiscal_invoices (order_id, environment) WHERE status = 'autorizada';
CREATE INDEX fiscal_invoices_order_idx ON fiscal_invoices (order_id, id DESC);

-- Eventos da nota autorizada: cancelamento e carta de correção. A nota cancelada
-- continua guardada, com o XML e o protocolo; só deixa de ser a nota do pedido.
-- Sem nome de esquema: cada empresa tem estas tabelas no esquema dela.

ALTER TABLE fiscal_invoices DROP CONSTRAINT fiscal_invoices_status_check;
ALTER TABLE fiscal_invoices ADD CONSTRAINT fiscal_invoices_status_check
    CHECK (status IN ('assinada', 'autorizada', 'rejeitada', 'denegada', 'cancelada'));
ALTER TABLE fiscal_invoices DROP CONSTRAINT fiscal_invoices_check;
ALTER TABLE fiscal_invoices ADD CONSTRAINT fiscal_invoices_check
    CHECK ((status IN ('autorizada', 'cancelada')) = (authorized_xml IS NOT NULL AND protocol IS NOT NULL) OR status = 'denegada');

CREATE TABLE fiscal_invoice_events (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id  integer NOT NULL REFERENCES fiscal_invoices (id),
    kind        text NOT NULL CHECK (kind IN ('cancelamento', 'correcao')),
    -- 1 no cancelamento; nas cartas de correção, 1, 2, 3…: vale a última.
    sequence    integer NOT NULL CHECK (sequence BETWEEN 1 AND 20),
    -- O motivo do cancelamento ou o texto da correção, como foi enviado.
    text        text NOT NULL CHECK (length(btrim(text)) >= 15),
    signed_xml  text NOT NULL,
    -- O protocolo do registro do evento na SEFAZ.
    protocol    text NOT NULL,
    status_code text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  text NOT NULL CHECK (btrim(created_by) <> ''),
    UNIQUE (invoice_id, kind, sequence)
);

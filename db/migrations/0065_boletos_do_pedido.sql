-- Arquivos externos: não emite nem registra cobrança no banco. Cada troca mantém o anterior.
CREATE TABLE receivable_bills (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receivable_id integer NOT NULL REFERENCES receivables (id),
    pdf bytea,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL CHECK (btrim(created_by) <> ''),
    CHECK (pdf IS NULL OR octet_length(pdf) BETWEEN 1 AND 2097152)
);
CREATE INDEX receivable_bills_latest_idx ON receivable_bills (receivable_id, id DESC);
ALTER TABLE fiscal_invoice_mails ADD COLUMN bill_ids integer[] NOT NULL DEFAULT '{}';

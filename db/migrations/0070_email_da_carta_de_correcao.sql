-- Preserve existing attempts; only new correction deliveries require an event.
ALTER TABLE fiscal_invoice_events ADD CONSTRAINT fiscal_invoice_events_id_invoice_unique UNIQUE (id, invoice_id);
ALTER TABLE fiscal_invoice_mails DROP CONSTRAINT fiscal_invoice_mails_kind_check;
ALTER TABLE fiscal_invoice_mails ADD COLUMN event_id integer;
ALTER TABLE fiscal_invoice_mails ADD CONSTRAINT fiscal_invoice_mails_kind_check CHECK (kind IN ('nota', 'cancelamento', 'correcao'));
ALTER TABLE fiscal_invoice_mails ADD CONSTRAINT fiscal_invoice_mails_event_fk FOREIGN KEY (event_id, invoice_id) REFERENCES fiscal_invoice_events (id, invoice_id);
ALTER TABLE fiscal_invoice_mails ADD CONSTRAINT fiscal_invoice_mails_correction_event_check CHECK (kind <> 'correcao' OR event_id IS NOT NULL);

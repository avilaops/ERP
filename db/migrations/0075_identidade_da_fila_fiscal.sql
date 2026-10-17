-- A recuperação precisa reconhecer exatamente a nota ou o evento produzido
-- por cada trabalho, sem inferir pelo ambiente atual ou repetir a operação.
ALTER TABLE fiscal_jobs
    ADD COLUMN invoice_id integer REFERENCES fiscal_invoices (id);

ALTER TABLE fiscal_invoices
    ADD COLUMN fiscal_job_id integer UNIQUE REFERENCES fiscal_jobs (id);

ALTER TABLE fiscal_invoice_events
    ADD COLUMN fiscal_job_id integer UNIQUE REFERENCES fiscal_jobs (id);

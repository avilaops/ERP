-- Informações impressas na proposta; não alteram preços, impostos ou recebimentos.
ALTER TABLE company_settings
    ADD COLUMN proposal_details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(proposal_details) = 'object'),
    ADD COLUMN proposal_details_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE orders
    ADD COLUMN proposal_details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(proposal_details) = 'object'),
    ADD COLUMN proposal_details_revision bigint NOT NULL DEFAULT 0,
    ADD COLUMN proposal_details_updated_by text,
    ADD COLUMN proposal_details_updated_at timestamptz;

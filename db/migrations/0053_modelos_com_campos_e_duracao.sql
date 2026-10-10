-- Modelos de WhatsApp com campos ({{1}}, {{2}}…): o que cada campo recebe, na ordem.
-- E a duração de cada ligação pelo sistema, que o provedor avisa quando ela termina.
ALTER TABLE whatsapp_templates
    ADD COLUMN params text NOT NULL DEFAULT '' CHECK (params ~ '^((contato|empresa|vendedor|minha_empresa)(,(contato|empresa|vendedor|minha_empresa)){0,9})?$');

ALTER TABLE voice_calls
    ADD COLUMN activity_id      integer REFERENCES opportunity_activities (id),
    -- Como terminou, nas palavras do provedor (completed, no-answer, busy, failed, canceled), e quanto durou.
    ADD COLUMN status           text,
    ADD COLUMN duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0);
CREATE UNIQUE INDEX voice_calls_provider_idx ON voice_calls (provider_id);

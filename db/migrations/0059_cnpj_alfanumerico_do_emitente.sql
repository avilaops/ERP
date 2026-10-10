-- CNPJ alfanumérico (IN RFB 2.229/2024; NT Conjunta 2025.001 e NT 2026.004 da NF-e, em produção
-- desde 01/07/2026): as doze primeiras posições do CNPJ podem ter letras maiúsculas, e a chave de
-- acesso leva o CNPJ do emitente nas posições 7 a 20. O cadastro da empresa, o certificado e a nota
-- guardada passam a aceitar o que o leiaute aceita. Quem já está gravado continua valendo.
-- Sem nome de esquema: cada empresa tem estas tabelas no esquema dela.
ALTER TABLE company_settings DROP CONSTRAINT company_settings_cnpj_check;
ALTER TABLE company_settings ADD CONSTRAINT company_settings_cnpj_check
    CHECK (cnpj IS NULL OR cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$');

ALTER TABLE fiscal_certificates DROP CONSTRAINT fiscal_certificates_holder_cnpj_check;
ALTER TABLE fiscal_certificates ADD CONSTRAINT fiscal_certificates_holder_cnpj_check
    CHECK (holder_cnpj IS NULL OR holder_cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$');

ALTER TABLE fiscal_invoices DROP CONSTRAINT fiscal_invoices_access_key_check;
ALTER TABLE fiscal_invoices ADD CONSTRAINT fiscal_invoices_access_key_check
    CHECK (access_key ~ '^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$');

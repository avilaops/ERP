-- Três reforços do contrato assinado pelo ERP.
ALTER TABLE contract_settings
    -- Por quantos dias, depois de assinado, o link do cliente ainda entrega o PDF.
    ADD COLUMN download_days integer NOT NULL DEFAULT 30 CHECK (download_days BETWEEN 1 AND 365),
    -- Selar o PDF assinado com o certificado digital (A1) da empresa: qualquer alteração aparece no leitor.
    ADD COLUMN seal boolean NOT NULL DEFAULT false,
    -- Pedir também um código enviado ao celular de quem assina, além do do e-mail.
    ADD COLUMN second_factor boolean NOT NULL DEFAULT false;

ALTER TABLE order_contracts
    -- Celular de quem assina, só dígitos com o código do país (5517999998888), quando o contrato pede o segundo código.
    ADD COLUMN recipient_phone text CHECK (recipient_phone IS NULL OR recipient_phone ~ '^[1-9][0-9]{9,14}$'),
    -- Resumo do código enviado ao celular; vence junto com o do e-mail.
    ADD COLUMN phone_code_hash text CHECK (phone_code_hash IS NULL OR phone_code_hash ~ '^[0-9a-f]{64}$');

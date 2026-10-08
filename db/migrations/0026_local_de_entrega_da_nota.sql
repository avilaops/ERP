-- Local de entrega da nota (grupo G do leiaute, `entrega`): só quando a mercadoria vai para
-- um endereço diferente do cadastro do cliente. Em branco, a nota sai com o endereço do cadastro.
-- Ou o endereço inteiro (rua, número, bairro, cidade, UF e CEP), ou nada.
ALTER TABLE orders
    -- Quem recebe, quando não é o próprio cliente. Em branco, vai o documento do cliente.
    ADD COLUMN nfe_delivery_name       text CHECK (nfe_delivery_name IS NULL OR length(btrim(nfe_delivery_name)) BETWEEN 2 AND 60),
    ADD COLUMN nfe_delivery_document   text CHECK (nfe_delivery_document IS NULL OR nfe_delivery_document ~ '^([0-9A-Z]{12}[0-9]{2}|[0-9]{11})$'),
    ADD COLUMN nfe_delivery_cep        text CHECK (nfe_delivery_cep IS NULL OR nfe_delivery_cep ~ '^[0-9]{8}$'),
    ADD COLUMN nfe_delivery_street     text CHECK (nfe_delivery_street IS NULL OR length(btrim(nfe_delivery_street)) BETWEEN 2 AND 60),
    ADD COLUMN nfe_delivery_number     text CHECK (nfe_delivery_number IS NULL OR length(btrim(nfe_delivery_number)) BETWEEN 1 AND 60),
    ADD COLUMN nfe_delivery_complement text CHECK (nfe_delivery_complement IS NULL OR length(btrim(nfe_delivery_complement)) BETWEEN 1 AND 60),
    ADD COLUMN nfe_delivery_district   text CHECK (nfe_delivery_district IS NULL OR length(btrim(nfe_delivery_district)) BETWEEN 2 AND 60),
    ADD COLUMN nfe_delivery_city       text CHECK (nfe_delivery_city IS NULL OR length(btrim(nfe_delivery_city)) BETWEEN 2 AND 60),
    ADD COLUMN nfe_delivery_uf         text CHECK (nfe_delivery_uf IS NULL OR nfe_delivery_uf ~ '^[A-Z]{2}$'),
    ADD COLUMN nfe_delivery_phone      text CHECK (nfe_delivery_phone IS NULL OR nfe_delivery_phone ~ '^[0-9]{6,14}$'),
    ADD CONSTRAINT orders_nfe_delivery_whole CHECK (
        (nfe_delivery_street IS NULL AND nfe_delivery_number IS NULL AND nfe_delivery_district IS NULL AND nfe_delivery_city IS NULL
         AND nfe_delivery_uf IS NULL AND nfe_delivery_cep IS NULL AND nfe_delivery_name IS NULL AND nfe_delivery_document IS NULL
         AND nfe_delivery_complement IS NULL AND nfe_delivery_phone IS NULL)
        OR (nfe_delivery_street IS NOT NULL AND nfe_delivery_number IS NOT NULL AND nfe_delivery_district IS NOT NULL
            AND nfe_delivery_city IS NOT NULL AND nfe_delivery_uf IS NOT NULL AND nfe_delivery_cep IS NOT NULL)
    );

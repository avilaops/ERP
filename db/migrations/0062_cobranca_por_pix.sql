-- Cobrança por PIX: a chave da empresa e como o recebedor aparece no aplicativo do banco de quem paga.
-- Com os três campos, cada parcela em aberto ganha o seu "PIX copia e cola" com o valor.
ALTER TABLE company_settings
    ADD COLUMN pix_key  text CHECK (pix_key IS NULL OR length(pix_key) BETWEEN 5 AND 77),
    ADD COLUMN pix_name text CHECK (pix_name IS NULL OR length(btrim(pix_name)) BETWEEN 1 AND 25),
    ADD COLUMN pix_city text CHECK (pix_city IS NULL OR length(btrim(pix_city)) BETWEEN 1 AND 15),
    ADD CONSTRAINT company_settings_pix_whole CHECK ((pix_key IS NULL) = (pix_name IS NULL) AND (pix_key IS NULL) = (pix_city IS NULL));

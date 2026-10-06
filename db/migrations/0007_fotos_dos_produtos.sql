-- Descrição do equipamento e uma foto por equipamento.
-- Sem nome de esquema: a mesma migração vale para o esquema de cada empresa.

ALTER TABLE products ADD COLUMN description text;

-- Fora de products para a listagem nunca carregar os bytes.
-- A foto entra sempre normalizada (JPEG, até 1200 × 1200) por saveProductPhoto.
-- A chave estrangeira não apaga em cascata, como as demais do banco: quem exclui o
-- equipamento (deleteProduct) apaga a foto no mesmo comando.
CREATE TABLE product_photos (
    product_id integer PRIMARY KEY REFERENCES products(id),
    mime_type  text NOT NULL CHECK (mime_type = 'image/jpeg'),
    bytes      bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 1048576),
    width      integer NOT NULL CHECK (width BETWEEN 1 AND 1200),
    height     integer NOT NULL CHECK (height BETWEEN 1 AND 1200),
    sha256     text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL
);

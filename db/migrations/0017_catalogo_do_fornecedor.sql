-- Catálogo do fornecedor: o que o fornecedor vende, com o código dele, as
-- medidas e a foto, e o código do equipamento da empresa a que corresponde.
-- É referência interna: só a diretoria vê. A foto é a cópia normalizada (JPEG).
-- Sem nome de esquema: cada empresa tem esta tabela no esquema dela.
CREATE TABLE supplier_items (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier      text NOT NULL CHECK (btrim(supplier) <> ''),
    -- O catálogo do fornecedor em que o item aparece: o mesmo código pode estar em mais de um.
    catalog       text NOT NULL CHECK (btrim(catalog) <> ''),
    line          text,
    code          text NOT NULL CHECK (btrim(code) <> ''),
    name          text NOT NULL CHECK (btrim(name) <> ''),
    description   text,
    length_mm     integer CHECK (length_mm > 0),
    width_mm      integer CHECK (width_mm > 0),
    height_mm     integer CHECK (height_mm > 0),
    weight_kg     numeric(8,2) CHECK (weight_kg > 0),
    load_type     text,
    -- O código do equipamento da empresa (products.code). Texto, não chave: o
    -- catálogo pode chegar antes do equipamento, e o vínculo é pelo código.
    product_code  text,
    photo         bytea CHECK (photo IS NULL OR octet_length(photo) BETWEEN 1 AND 1048576),
    photo_sha256  text CHECK (photo_sha256 IS NULL OR photo_sha256 ~ '^[0-9a-f]{64}$'),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    text NOT NULL CHECK (btrim(updated_by) <> ''),
    UNIQUE (supplier, catalog, code),
    CHECK ((photo IS NULL) = (photo_sha256 IS NULL))
);
CREATE INDEX supplier_items_product_code_idx ON supplier_items (product_code) WHERE product_code IS NOT NULL;

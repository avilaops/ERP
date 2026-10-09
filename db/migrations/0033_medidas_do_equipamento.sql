-- Dimensões e peso do equipamento, para a proposta: o cliente precisa saber se cabe e quanto pesa.
-- Ficam no equipamento, editáveis na tela dele; em branco, a proposta não mostra a linha.
ALTER TABLE products
    ADD COLUMN length_mm integer CHECK (length_mm IS NULL OR length_mm BETWEEN 1 AND 99999),
    ADD COLUMN width_mm  integer CHECK (width_mm IS NULL OR width_mm BETWEEN 1 AND 99999),
    ADD COLUMN height_mm integer CHECK (height_mm IS NULL OR height_mm BETWEEN 1 AND 99999),
    ADD COLUMN weight_kg numeric(8,2) CHECK (weight_kg IS NULL OR weight_kg > 0);

-- O que o catálogo do fornecedor já traz entra de uma vez, pelo código do equipamento.
UPDATE products p
   SET length_mm = s.length_mm, width_mm = s.width_mm, height_mm = s.height_mm, weight_kg = s.weight_kg
  FROM (
        SELECT DISTINCT ON (product_code) product_code, length_mm, width_mm, height_mm, weight_kg
          FROM supplier_items
         WHERE product_code IS NOT NULL AND (length_mm IS NOT NULL OR weight_kg IS NOT NULL)
         ORDER BY product_code, updated_at DESC, id DESC
       ) s
 WHERE p.code = s.product_code;

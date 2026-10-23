-- Indústrias e distribuidores também compram e estocam kg, m, l e outras unidades fracionadas.
ALTER TABLE purchase_items ALTER COLUMN quantity TYPE numeric(15,4) USING quantity::numeric(15,4);
ALTER TABLE stock_moves ALTER COLUMN quantity TYPE numeric(15,4) USING quantity::numeric(15,4);


-- Equipamento de peso livre sai com anilheiro olímpico ou standard, e quem escolhe é o cliente,
-- no pedido. O cadastro diz quais equipamentos têm anilheiro; o item do pedido guarda a escolha.
ALTER TABLE products ADD COLUMN plate_loaded boolean NOT NULL DEFAULT false;
ALTER TABLE order_items ADD COLUMN plates text CHECK (plates IN ('olimpico', 'standard'));

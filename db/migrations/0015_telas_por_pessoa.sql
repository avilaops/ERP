-- As telas que a pessoa abre, dentro do tipo de acesso dela. Nulo: todas as do
-- tipo de acesso. A lista só restringe: nunca dá tela que o tipo de acesso não tem.
-- Sem nome de esquema: cada empresa tem esta tabela no esquema dela.
ALTER TABLE users ADD COLUMN allowed_items text[] CHECK (allowed_items IS NULL OR cardinality(allowed_items) > 0);

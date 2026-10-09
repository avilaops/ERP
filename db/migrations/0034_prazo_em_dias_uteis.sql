-- O prazo de fabricação pode ser combinado em dias úteis ou em dias corridos, como no protótipo
-- do cliente. O que já existe é em dias corridos, e continua sendo.
-- Dia útil aqui é de segunda a sexta: feriado não é descontado (a previsão é uma estimativa).
ALTER TABLE orders ADD COLUMN production_unit text NOT NULL DEFAULT 'corridos' CHECK (production_unit IN ('corridos', 'uteis'));

-- Saldo "na entrega": o cliente paga o que falta no dia em que o equipamento fica pronto.
-- Não é um meio de pagamento, é um prazo: a forma marcada assim faz o saldo virar uma parcela só,
-- com vencimento na data de conclusão do pedido. A empresa escolhe quais formas são assim.
ALTER TABLE payment_methods ADD COLUMN on_delivery boolean NOT NULL DEFAULT false;

-- Valor inicial, como as outras formas: a empresa renomeia, desliga ou remove na tela.
INSERT INTO payment_methods (label, position, on_delivery, updated_by)
SELECT 'Na entrega', COALESCE((SELECT max(position) FROM payment_methods), 0) + 1, true, 'migracao-0032'
 WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE lower(btrim(label)) = 'na entrega');

-- Fica no pedido como foi combinado: mudar a forma depois não muda o pedido já gravado.
ALTER TABLE orders ADD COLUMN balance_on_delivery boolean NOT NULL DEFAULT false;

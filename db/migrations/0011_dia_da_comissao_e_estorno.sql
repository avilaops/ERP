-- Dia do pagamento da comissão: parâmetro da empresa, não do código.
-- Vai de 1 a 28 para existir em todos os meses.
ALTER TABLE company_settings
    ADD COLUMN commission_payment_day integer NOT NULL DEFAULT 5
        CHECK (commission_payment_day BETWEEN 1 AND 28);

-- O pedido de estorno diz qual recebimento ele desfaz (todo pedido feito pela tela
-- diz). Um recebimento tem no máximo um pedido pendente ou confirmado: recusado
-- pode ser pedido de novo.
ALTER TABLE refund_requests ADD COLUMN receipt_id integer REFERENCES receipts (id);
CREATE UNIQUE INDEX refund_requests_receipt_id_key ON refund_requests (receipt_id) WHERE status <> 'recusada';

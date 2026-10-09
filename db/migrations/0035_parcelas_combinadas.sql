-- Parcelas do saldo combinadas uma a uma: data, valor e forma de cada parcela, quando o cliente
-- não paga em parcelas iguais a intervalo fixo. Com linhas aqui (e a soma igual ao saldo), valem
-- estas; sem elas, as parcelas são calculadas pelo número de parcelas e pelos prazos do pedido.
CREATE TABLE order_installments (
    order_id integer NOT NULL REFERENCES orders (id),
    number   integer NOT NULL CHECK (number BETWEEN 1 AND 60),
    due_date date NOT NULL,
    amount   numeric(14,2) NOT NULL CHECK (amount > 0),
    method   text CHECK (method IS NULL OR btrim(method) <> ''),
    PRIMARY KEY (order_id, number)
);

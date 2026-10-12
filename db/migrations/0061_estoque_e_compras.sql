-- Compras (do fornecedor nacional ou importação) e estoque de equipamento pronto.
-- A compra recebida dá entrada no estoque; o pedido fechado compromete o saldo e a expedição dá a saída.
CREATE TABLE purchases (
    id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier_id    integer NOT NULL REFERENCES suppliers (id),
    kind           text NOT NULL CHECK (kind IN ('importacao', 'nacional')),
    -- pedido: combinado com o fornecedor. em_transito: embarcado. recebida: chegou e entrou no estoque.
    status         text NOT NULL DEFAULT 'pedido' CHECK (status IN ('pedido', 'em_transito', 'recebida', 'cancelada')),
    -- Como a empresa chama esta compra: número da proforma, da invoice ou da DI.
    reference      text CHECK (reference IS NULL OR length(reference) <= 60),
    ordered_on     date NOT NULL,
    expected_on    date,
    received_on    date,
    -- Moeda dos preços dos itens e quantos reais vale uma unidade dela. Os custos da compra são sempre em reais.
    currency       text NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL', 'USD', 'EUR', 'CNY')),
    exchange_rate  numeric(12, 6) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
    -- A nota de entrada, emitida por quem for: número e chave, para o contador achar.
    invoice_number text CHECK (invoice_number IS NULL OR length(invoice_number) <= 20),
    invoice_key    text CHECK (invoice_key IS NULL OR invoice_key ~ '^[0-9A-Z]{44}$'),
    notes          text CHECK (notes IS NULL OR length(notes) <= 1000),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    updated_by     text NOT NULL CHECK (btrim(updated_by) <> ''),
    CHECK ((status = 'recebida') = (received_on IS NOT NULL)),
    CHECK (currency <> 'BRL' OR exchange_rate = 1)
);
CREATE INDEX purchases_status_idx ON purchases (status, ordered_on DESC);

CREATE TABLE purchase_items (
    purchase_id integer NOT NULL REFERENCES purchases (id),
    product_id  integer NOT NULL REFERENCES products (id),
    quantity    integer NOT NULL CHECK (quantity > 0),
    -- Na moeda da compra.
    unit_price  numeric(14, 4) NOT NULL CHECK (unit_price >= 0),
    PRIMARY KEY (purchase_id, product_id)
);

-- O que a compra custa além da mercadoria: frete, seguro, impostos da importação, despachante, armazenagem.
CREATE TABLE purchase_costs (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    purchase_id integer NOT NULL REFERENCES purchases (id),
    label       text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
    amount      numeric(14, 2) NOT NULL CHECK (amount > 0),
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  text NOT NULL CHECK (btrim(created_by) <> '')
);
CREATE INDEX purchase_costs_purchase_idx ON purchase_costs (purchase_id);

CREATE TABLE stock_moves (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id  integer NOT NULL REFERENCES products (id),
    -- compra: a compra recebida. venda: a expedição do pedido. ajuste: acerto de contagem. estorno: desfaz uma compra ou uma expedição.
    kind        text NOT NULL CHECK (kind IN ('compra', 'venda', 'ajuste', 'estorno')),
    quantity    integer NOT NULL CHECK (quantity <> 0),
    note        text CHECK (note IS NULL OR length(note) <= 200),
    purchase_id integer REFERENCES purchases (id),
    order_id    integer REFERENCES orders (id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  text NOT NULL CHECK (btrim(created_by) <> ''),
    CHECK (purchase_id IS NULL OR order_id IS NULL)
);
CREATE INDEX stock_moves_product_idx ON stock_moves (product_id, id DESC);
CREATE INDEX stock_moves_order_idx ON stock_moves (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX stock_moves_purchase_idx ON stock_moves (purchase_id) WHERE purchase_id IS NOT NULL;

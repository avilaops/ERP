-- Pedidos. O pedido fica preso à versão da tabela em que foi feito: não há coluna de
-- preço, de custo nem de total aqui. O preço de cada item é a linha de
-- price_table_items para a qual ele aponta, e versão publicada não muda.
-- Nenhuma chave estrangeira apaga em cascata.
-- Sem nome de esquema: os testes aplicam este arquivo num esquema próprio.

CREATE TABLE orders (
    id                        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- AAMMDD-XXXX; a tela mostra com '#' na frente.
    number                    text NOT NULL CHECK (number ~ '^[0-9]{6}-[A-Z0-9]{4}$'),
    status                    text NOT NULL DEFAULT 'em_negociacao'
                              CHECK (status IN ('em_negociacao', 'aguardando_aprovacao', 'fechado', 'perdido', 'cancelado')),
    seller_email              text NOT NULL CHECK (btrim(seller_email) <> ''),
    seller_name               text NOT NULL CHECK (btrim(seller_name) <> ''),
    customer_id               integer REFERENCES customers (id),
    -- A versão em que o pedido foi feito. Não muda depois.
    price_table_version       integer NOT NULL REFERENCES price_table_versions (version),
    discount                  numeric(9,8) NOT NULL DEFAULT 0 CHECK (discount >= 0 AND discount < 1),
    delivery_uf               text CHECK (delivery_uf IS NULL OR delivery_uf IN (
                                  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA',
                                  'PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO')),
    taxpayer                  boolean NOT NULL DEFAULT false,
    production_days           integer CHECK (production_days > 0),
    freight                   numeric(14,2) NOT NULL DEFAULT 0 CHECK (freight >= 0),
    notes                     text,
    down_payment              numeric(14,2) NOT NULL DEFAULT 0 CHECK (down_payment >= 0),
    down_payment_method       text,
    down_payment_date         date,
    balance_method            text,
    installment_count         integer CHECK (installment_count > 0),
    first_installment_days    integer CHECK (first_installment_days >= 0),
    installment_interval_days integer CHECK (installment_interval_days >= 0),
    payment_notes             text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    updated_by                text NOT NULL CHECK (btrim(updated_by) <> ''),
    closed_at                 timestamptz,
    UNIQUE (number),
    -- Alvo da chave composta dos itens: o item carrega a versão do próprio pedido.
    UNIQUE (id, price_table_version),
    CHECK ((status = 'fechado') = (closed_at IS NOT NULL)),
    -- Fora de negociação o pedido já tem o que a conta e o fechamento exigem.
    CHECK (status = 'em_negociacao'
           OR (customer_id IS NOT NULL AND delivery_uf IS NOT NULL AND production_days IS NOT NULL))
);

CREATE INDEX orders_seller_email_idx ON orders (seller_email);
CREATE INDEX orders_customer_id_idx ON orders (customer_id);

CREATE TABLE order_items (
    order_id            integer NOT NULL,
    price_table_version integer NOT NULL,
    product_id          integer NOT NULL,
    quantity            integer NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (order_id, product_id),
    -- O item é da mesma versão do pedido…
    FOREIGN KEY (order_id, price_table_version) REFERENCES orders (id, price_table_version),
    -- …e só entra equipamento que está nessa versão. É daqui que sai o preço.
    FOREIGN KEY (price_table_version, product_id) REFERENCES price_table_items (version, product_id)
);

CREATE INDEX order_items_version_product_idx ON order_items (price_table_version, product_id);

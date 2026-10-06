-- Aprovações, fechamentos, recebimentos, estornos, comissões, contas a pagar,
-- fornecedores, motivos de perda, metas e chaves de idempotência.
-- Nenhuma chave estrangeira apaga em cascata: o que tem histórico não se apaga.
-- Datas de calendário em date; acontecimentos em timestamptz.
-- Sem nome de esquema: cada empresa tem estas tabelas no esquema dela.

-- Por que um pedido foi perdido. Lista da empresa, editável.
CREATE TABLE lost_reasons (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    label      text NOT NULL CHECK (btrim(label) <> ''),
    active     boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
    UNIQUE (label)
);

ALTER TABLE orders
    ADD COLUMN lost_reason_id integer REFERENCES lost_reasons (id),
    ADD COLUMN lost_note      text,
    ADD COLUMN cancel_reason  text;

-- Fornecedores: empresa, pessoa ou do exterior.
CREATE TABLE suppliers (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind         text NOT NULL CHECK (kind IN ('PJ', 'PF', 'EX')),
    -- CNPJ ou CPF sem pontuação; no exterior, a identificação fiscal como vier.
    document     text,
    name         text NOT NULL CHECK (btrim(name) <> ''),
    trade_name   text,
    contact_name text,
    phone        text,
    email        text,
    country      text,
    -- Banco, agência, conta, chave PIX, SWIFT…: o que o pagamento precisar.
    bank_details jsonb NOT NULL DEFAULT '{}'::jsonb,
    notes        text,
    active       boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    updated_by   text NOT NULL CHECK (btrim(updated_by) <> ''),
    CHECK ((kind = 'PJ' AND document ~ '^[0-9A-Z]{12}[0-9]{2}$')
        OR (kind = 'PF' AND document ~ '^[0-9]{11}$')
        OR (kind = 'EX' AND country IS NOT NULL AND btrim(country) <> ''))
);

CREATE UNIQUE INDEX suppliers_document_key ON suppliers (document) WHERE document IS NOT NULL;

-- Cada pedido de aprovação e a decisão. Reenviar cria outra linha: as anteriores ficam.
CREATE TABLE order_approvals (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id      integer NOT NULL REFERENCES orders (id),
    requested_at  timestamptz NOT NULL DEFAULT now(),
    requested_by  text NOT NULL CHECK (btrim(requested_by) <> ''),
    -- Resumo do que afeta preço e política no momento do pedido de aprovação.
    -- Mudou qualquer coisa disso, a aprovação deixa de valer.
    revision_hash text NOT NULL CHECK (revision_hash ~ '^[0-9a-f]{64}$'),
    reasons       text[] NOT NULL CHECK (cardinality(reasons) > 0),
    status        text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'reprovado')),
    decided_at    timestamptz,
    decided_by    text,
    decided_role  text CHECK (decided_role IN ('DIRETORIA', 'GERENTE_COMERCIAL')),
    comment       text,
    CHECK ((status = 'pendente') = (decided_at IS NULL)),
    CHECK ((status = 'pendente') = (decided_by IS NULL)),
    CHECK ((status = 'pendente') = (decided_role IS NULL))
);

CREATE INDEX order_approvals_order_id_idx ON order_approvals (order_id, requested_at DESC);
CREATE INDEX order_approvals_status_idx ON order_approvals (status) WHERE status = 'pendente';

-- Histórico de fechamentos: reabrir e fechar de novo deixa as duas linhas.
CREATE TABLE order_closings (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id      integer NOT NULL REFERENCES orders (id),
    closed_at     timestamptz NOT NULL DEFAULT now(),
    closed_by     text NOT NULL CHECK (btrim(closed_by) <> ''),
    -- O total da nota no fechamento. A versão da tabela é a do pedido.
    invoice_total numeric(14,2) NOT NULL CHECK (invoice_total > 0),
    reopened_at   timestamptz,
    reopened_by   text,
    CHECK ((reopened_at IS NULL) = (reopened_by IS NULL)),
    CHECK (reopened_at IS NULL OR reopened_at >= closed_at)
);

CREATE INDEX order_closings_order_id_idx ON order_closings (order_id, closed_at DESC);

-- O que há a receber de um pedido fechado: a entrada e cada parcela do saldo.
CREATE TABLE receivables (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id   integer NOT NULL REFERENCES orders (id),
    kind       text NOT NULL CHECK (kind IN ('entrada', 'parcela')),
    -- 0 para a entrada; 1, 2, 3… para as parcelas.
    number     integer NOT NULL CHECK (number >= 0),
    -- Nulo: "na entrega", sem data marcada.
    due_date   date,
    amount     numeric(14,2) NOT NULL CHECK (amount > 0),
    method     text,
    status     text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'recebida', 'cancelada')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL CHECK (btrim(updated_by) <> ''),
    UNIQUE (order_id, kind, number),
    CHECK ((kind = 'entrada') = (number = 0))
);

CREATE INDEX receivables_due_date_idx ON receivables (due_date) WHERE status = 'aberta';

-- Cada recebimento, inteiro ou parcial. Não se altera nem se apaga: erro se corrige com estorno.
CREATE TABLE receipts (
    id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receivable_id      integer NOT NULL REFERENCES receivables (id),
    received_at        timestamptz NOT NULL,
    amount             numeric(14,2) NOT NULL CHECK (amount > 0),
    -- A parte sem IPI: é sobre ela que a comissão incide.
    amount_without_ipi numeric(14,2) NOT NULL CHECK (amount_without_ipi > 0 AND amount_without_ipi <= amount),
    method             text,
    note               text,
    recorded_at        timestamptz NOT NULL DEFAULT now(),
    recorded_by        text NOT NULL CHECK (btrim(recorded_by) <> '')
);

CREATE INDEX receipts_receivable_id_idx ON receipts (receivable_id);
CREATE INDEX receipts_received_at_idx ON receipts (received_at);

-- Devolução pedida: mexer no pedido não lança dinheiro. Só o financeiro ou a diretoria confirmam.
CREATE TABLE refund_requests (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id      integer NOT NULL REFERENCES orders (id),
    receivable_id integer NOT NULL REFERENCES receivables (id),
    amount        numeric(14,2) NOT NULL CHECK (amount > 0),
    reason        text NOT NULL CHECK (btrim(reason) <> ''),
    requested_at  timestamptz NOT NULL DEFAULT now(),
    requested_by  text NOT NULL CHECK (btrim(requested_by) <> ''),
    status        text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmada', 'recusada')),
    decided_at    timestamptz,
    decided_by    text,
    CHECK ((status = 'pendente') = (decided_at IS NULL)),
    CHECK ((status = 'pendente') = (decided_by IS NULL))
);

CREATE INDEX refund_requests_status_idx ON refund_requests (status) WHERE status = 'pendente';

-- Estorno ou devolução confirmados: valor negativo, ligado à parcela. Não se altera nem se apaga.
CREATE TABLE refunds (
    id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    refund_request_id  integer NOT NULL REFERENCES refund_requests (id),
    order_id           integer NOT NULL REFERENCES orders (id),
    receivable_id      integer NOT NULL REFERENCES receivables (id),
    refunded_at        timestamptz NOT NULL,
    amount             numeric(14,2) NOT NULL CHECK (amount < 0),
    amount_without_ipi numeric(14,2) NOT NULL CHECK (amount_without_ipi < 0 AND amount_without_ipi >= amount),
    reason             text NOT NULL CHECK (btrim(reason) <> ''),
    requested_by       text NOT NULL CHECK (btrim(requested_by) <> ''),
    confirmed_by       text NOT NULL CHECK (btrim(confirmed_by) <> ''),
    UNIQUE (refund_request_id)
);

CREATE INDEX refunds_receivable_id_idx ON refunds (receivable_id);

-- Comissão: nasce de um recebimento (positiva) ou de um estorno (negativa), nunca dos dois.
-- Guarda só a comissão e o pagamento dela ao vendedor; o dinheiro recebido está em receipts.
CREATE TABLE commissions (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    seller_email text NOT NULL CHECK (btrim(seller_email) <> ''),
    receipt_id   integer REFERENCES receipts (id),
    refund_id    integer REFERENCES refunds (id),
    -- O mês em que a origem aconteceu, em São Paulo: sempre o dia 1.
    competence   date NOT NULL CHECK (extract(day FROM competence) = 1),
    base_amount  numeric(14,2) NOT NULL,
    rate         numeric(9,8) NOT NULL CHECK (rate >= 0 AND rate < 1),
    amount       numeric(14,2) NOT NULL,
    -- Quando é para pagar ao vendedor (hoje, dia 5 do mês seguinte).
    payment_due  date NOT NULL,
    paid_at      timestamptz,
    paid_by      text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    -- Exatamente uma origem.
    CHECK ((receipt_id IS NOT NULL) <> (refund_id IS NOT NULL)),
    -- De recebimento é positiva; de estorno, negativa.
    CHECK ((receipt_id IS NOT NULL AND amount >= 0 AND base_amount > 0)
        OR (refund_id IS NOT NULL AND amount <= 0 AND base_amount < 0)),
    CHECK ((paid_at IS NULL) = (paid_by IS NULL)),
    CHECK (payment_due > competence)
);

CREATE UNIQUE INDEX commissions_receipt_id_key ON commissions (receipt_id) WHERE receipt_id IS NOT NULL;
CREATE UNIQUE INDEX commissions_refund_id_key ON commissions (refund_id) WHERE refund_id IS NOT NULL;
CREATE INDEX commissions_seller_competence_idx ON commissions (seller_email, competence);

-- Contas a pagar. Pode estar ligada a um fornecedor e a um pedido (o pagamento na China).
CREATE TABLE payables (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    description text NOT NULL CHECK (btrim(description) <> ''),
    supplier_id integer REFERENCES suppliers (id),
    order_id    integer REFERENCES orders (id),
    category    text NOT NULL CHECK (btrim(category) <> ''),
    amount      numeric(14,2) NOT NULL CHECK (amount > 0),
    due_date    date NOT NULL,
    method      text,
    status      text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga')),
    paid_on     date,
    paid_amount numeric(14,2) CHECK (paid_amount > 0),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text NOT NULL CHECK (btrim(updated_by) <> ''),
    CHECK ((status = 'paga') = (paid_on IS NOT NULL)),
    CHECK ((status = 'paga') = (paid_amount IS NOT NULL))
);

CREATE INDEX payables_due_date_idx ON payables (due_date) WHERE status = 'aberta';

-- Meta de venda do mês: da equipe (sem vendedor) ou de um vendedor.
CREATE TABLE sales_goals (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    seller_email text CHECK (seller_email IS NULL OR btrim(seller_email) <> ''),
    month        date NOT NULL CHECK (extract(day FROM month) = 1),
    amount       numeric(14,2) NOT NULL CHECK (amount >= 0),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    updated_by   text NOT NULL CHECK (btrim(updated_by) <> '')
);

CREATE UNIQUE INDEX sales_goals_seller_month_key ON sales_goals (seller_email, month) WHERE seller_email IS NOT NULL;
CREATE UNIQUE INDEX sales_goals_team_month_key ON sales_goals (month) WHERE seller_email IS NULL;

-- Reenviar a mesma operação (fechar pedido, dar baixa) não a executa duas vezes.
CREATE TABLE idempotency_keys (
    key        text PRIMARY KEY CHECK (btrim(key) <> ''),
    operation  text NOT NULL CHECK (btrim(operation) <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL CHECK (btrim(created_by) <> ''),
    -- O que a operação respondeu da primeira vez.
    result     jsonb
);

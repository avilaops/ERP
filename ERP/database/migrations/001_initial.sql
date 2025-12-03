-- Tabela de Clientes
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cpf_cnpj TEXT NOT NULL UNIQUE,
    telefone TEXT,
    email TEXT,
    endereco TEXT,
    cidade TEXT,
    estado TEXT,
    cep TEXT,
    ativo BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_clientes_cpf_cnpj ON clientes(cpf_cnpj);
CREATE INDEX idx_clientes_nome ON clientes(nome);

-- Tabela de Produtos
CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    descricao TEXT,
    codigo_barras TEXT UNIQUE,
    preco_custo REAL NOT NULL DEFAULT 0,
    preco_venda REAL NOT NULL DEFAULT 0,
    estoque_atual INTEGER NOT NULL DEFAULT 0,
    estoque_minimo INTEGER NOT NULL DEFAULT 0,
    unidade TEXT NOT NULL DEFAULT 'UN',
    ativo BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_produtos_nome ON produtos(nome);
CREATE INDEX idx_produtos_codigo_barras ON produtos(codigo_barras);
CREATE INDEX idx_produtos_estoque ON produtos(estoque_atual);

-- Tabela de Movimentações de Estoque
CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('ENTRADA', 'SAIDA')),
    quantidade INTEGER NOT NULL,
    motivo TEXT NOT NULL,
    usuario TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
);

CREATE INDEX idx_movimentacoes_produto ON movimentacoes_estoque(produto_id);
CREATE INDEX idx_movimentacoes_data ON movimentacoes_estoque(created_at);

-- Tabela de Vendas
CREATE TABLE IF NOT EXISTS vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    total REAL NOT NULL DEFAULT 0,
    desconto REAL NOT NULL DEFAULT 0,
    total_final REAL NOT NULL DEFAULT 0,
    forma_pagamento TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ABERTA' CHECK(status IN ('ABERTA', 'FINALIZADA', 'CANCELADA')),
    observacoes TEXT,
    usuario TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

CREATE INDEX idx_vendas_cliente ON vendas(cliente_id);
CREATE INDEX idx_vendas_status ON vendas(status);
CREATE INDEX idx_vendas_data ON vendas(created_at);

-- Tabela de Itens de Venda
CREATE TABLE IF NOT EXISTS itens_venda (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    quantidade INTEGER NOT NULL,
    preco_unitario REAL NOT NULL,
    subtotal REAL NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (venda_id) REFERENCES vendas(id),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
);

CREATE INDEX idx_itens_venda ON itens_venda(venda_id);
CREATE INDEX idx_itens_produto ON itens_venda(produto_id);

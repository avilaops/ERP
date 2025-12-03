-- Dados de exemplo para testes

-- Clientes
INSERT INTO clientes (nome, cpf_cnpj, telefone, email, endereco, cidade, estado, cep) VALUES
('João Silva', '12345678901', '(11) 98765-4321', 'joao@email.com', 'Rua A, 123', 'São Paulo', 'SP', '01234-567'),
('Maria Santos', '98765432109', '(11) 91234-5678', 'maria@email.com', 'Av. B, 456', 'São Paulo', 'SP', '01234-890'),
('Empresa XYZ Ltda', '12345678000190', '(11) 3456-7890', 'contato@xyz.com', 'Rua C, 789', 'São Paulo', 'SP', '01234-111');

-- Produtos
INSERT INTO produtos (nome, descricao, codigo_barras, preco_custo, preco_venda, estoque_atual, estoque_minimo, unidade) VALUES
('Arroz 5kg', 'Arroz branco tipo 1', '7891234567890', 15.00, 22.90, 50, 10, 'UN'),
('Feijão 1kg', 'Feijão preto', '7891234567891', 5.00, 8.90, 30, 5, 'UN'),
('Açúcar 1kg', 'Açúcar cristal', '7891234567892', 2.50, 4.50, 40, 10, 'UN'),
('Óleo de Soja 900ml', 'Óleo de soja refinado', '7891234567893', 4.00, 6.90, 25, 5, 'UN'),
('Café 500g', 'Café torrado e moído', '7891234567894', 8.00, 14.90, 15, 10, 'UN'),
('Macarrão 500g', 'Macarrão espaguete', '7891234567895', 2.00, 3.90, 60, 15, 'UN'),
('Leite 1L', 'Leite integral UHT', '7891234567896', 3.00, 4.90, 8, 10, 'UN'),
('Sal 1kg', 'Sal refinado', '7891234567897', 1.00, 2.50, 5, 10, 'UN');

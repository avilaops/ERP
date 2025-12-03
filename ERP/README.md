# ERP - Sistema Completo de Gestão

**ERP 100% Rust** para Vendas, Estoque e Clientes - Simples, Rápido e Poderoso.

## 🚀 Tecnologias

### Backend
- 🦀 **Rust** + **Axum** (Web Framework)
- 💾 **SQLx** + **SQLite** (Banco de Dados)
- 📊 **Telemetria** integrada
- ⚡ **Async/Await** nativo

### Frontend
- 🦀 **Rust** + **WebAssembly**
- 🔥 **avila-frontend** (Framework próprio do Arxis)
- ⚡ Performance nativa do navegador
- 🎨 CSS puro (sem dependências)

## 📦 Estrutura

```
ERP/
├── backend/              # API REST em Rust
│   ├── src/
│   │   ├── main.rs
│   │   ├── models/       # Cliente, Produto, Venda
│   │   ├── routes/       # Endpoints da API
│   │   └── db.rs         # Conexão com banco
│   └── Cargo.toml
├── frontend-wasm/        # Interface WASM
│   ├── src/
│   │   ├── lib.rs
│   │   ├── pages/        # Dashboard, Clientes, etc
│   │   └── api.rs        # HTTP client
│   ├── index.html
│   └── Cargo.toml
├── database/
│   └── migrations/       # SQL migrations
└── docs/
```

## 🛠️ Instalação

### Pré-requisitos

```powershell
# Rust
winget install Rustlang.Rust.MSVC

# wasm-pack (para frontend)
cargo install wasm-pack

# SQLx CLI (para migrations)
cargo install sqlx-cli --no-default-features --features sqlite
```

### 1. Backend

```powershell
cd backend

# Criar banco de dados
sqlx database create

# Rodar migrations
sqlx migrate run --source ../database/migrations

# Executar servidor
cargo run

# Servidor rodando em http://localhost:3000
```

### 2. Frontend WASM

```powershell
cd frontend-wasm

# Compilar WASM
.\build.ps1

# Executar servidor HTTP
python -m http.server 8000

# Abrir navegador em http://localhost:8000
```

## 📋 Módulos

### 👥 Clientes
- Cadastro completo (CPF/CNPJ, contato, endereço)
- Listagem e busca
- Histórico de compras

### 📦 Produtos / Estoque
- Cadastro de produtos
- Controle de estoque (entrada/saída)
- Alertas de estoque mínimo
- Movimentações rastreadas

### 💰 Vendas / PDV
- Criar venda
- Adicionar produtos
- Cálculo automático
- Baixa automática no estoque
- Múltiplas formas de pagamento

### 📊 Dashboard
- Vendas do dia/mês
- Produtos mais vendidos
- Estoque crítico
- Ticket médio

## 🔥 API Endpoints

### Clientes
- `GET /api/v1/clientes` - Listar todos
- `POST /api/v1/clientes` - Criar novo
- `GET /api/v1/clientes/:id` - Buscar por ID
- `PUT /api/v1/clientes/:id` - Atualizar
- `DELETE /api/v1/clientes/:id` - Desativar

### Produtos
- `GET /api/v1/produtos` - Listar todos
- `POST /api/v1/produtos` - Criar novo
- `GET /api/v1/produtos/:id` - Buscar por ID
- `PUT /api/v1/produtos/:id` - Atualizar
- `GET /api/v1/produtos/estoque/critico` - Estoque baixo
- `POST /api/v1/produtos/:id/movimentacoes` - Movimentar estoque

### Vendas
- `GET /api/v1/vendas` - Listar todas
- `POST /api/v1/vendas` - Criar nova (aberta)
- `GET /api/v1/vendas/:id` - Buscar por ID
- `POST /api/v1/vendas/:id/itens` - Adicionar item
- `POST /api/v1/vendas/:id/finalizar` - Finalizar (baixa estoque)
- `POST /api/v1/vendas/:id/cancelar` - Cancelar

### Dashboard
- `GET /api/v1/dashboard` - Métricas completas

## 🎯 Próximos Passos

- [ ] Autenticação / Login
- [ ] Relatórios em PDF
- [ ] Gráficos (Chart.js ou plotters.rs)
- [ ] Backup automático
- [ ] Integração fiscal (NF-e)
- [ ] App mobile (mesmo backend)

## 📄 Licença

MIT OR Apache-2.0

---

**Feito com 🦀 Rust e ❤️**

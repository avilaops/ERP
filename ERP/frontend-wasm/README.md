# Avila ERP - Frontend WASM

Frontend 100% Rust + WebAssembly usando **avila-frontend**.

## 🚀 Build

```powershell
# Instalar wasm-pack (se não tiver)
cargo install wasm-pack

# Build para web
wasm-pack build --target web --out-dir pkg

# Ou use o script
.\build.ps1
```

## 🌐 Executar

```powershell
# Servidor HTTP simples
python -m http.server 8000

# Ou com Node.js
npx http-server -p 8000

# Abrir no navegador
# http://localhost:8000
```

## 📦 Estrutura

```
frontend-wasm/
├── src/
│   ├── lib.rs          # Entry point
│   ├── api.rs          # HTTP client
│   ├── models.rs       # Tipos de dados
│   ├── components.rs   # Componentes UI
│   └── pages/          # Páginas da aplicação
│       ├── dashboard.rs
│       ├── clientes.rs
│       ├── produtos.rs
│       └── vendas.rs
├── index.html          # HTML principal
└── pkg/                # WASM compilado (gerado)
```

## ⚙️ Backend

Certifique-se que o backend está rodando em `http://localhost:3000`:

```powershell
cd ..\backend
cargo run
```

## 🎨 Tecnologias

- 🦀 **Rust** - Linguagem principal
- ⚡ **WebAssembly** - Execução no navegador
- 🔥 **avila-frontend** - Framework próprio do Arxis
- 🌐 **web-sys** - Bindings para Web APIs

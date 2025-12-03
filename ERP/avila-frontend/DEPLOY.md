# 🚀 Avila Frontend - Deploy

## Build WASM

```bash
# Instalar wasm-pack (se necessário)
cargo install wasm-pack

# Build para web
wasm-pack build --target web --release

# Isso gera a pasta pkg/ com:
# - avila_frontend.js
# - avila_frontend_bg.wasm
# - package.json
```

## Executar Localmente

### Opção 1: Python
```bash
python -m http.server 8000
```

### Opção 2: Node.js
```bash
npx serve .
```

### Opção 3: PowerShell (Windows)
```powershell
# Criar servidor HTTP simples
$http = [System.Net.HttpListener]::new()
$http.Prefixes.Add("http://localhost:8000/")
$http.Start()
Write-Host "Servidor rodando em http://localhost:8000"
while ($http.IsListening) {
    $context = $http.GetContext()
    $response = $context.Response
    $file = "index.html"
    if (Test-Path $file) {
        $content = [System.IO.File]::ReadAllBytes($file)
        $response.ContentLength64 = $content.Length
        $response.OutputStream.Write($content, 0, $content.Length)
    }
    $response.Close()
}
```

## Acessar

Abra o navegador em: **http://localhost:8000**

## Estrutura de Deploy

```
avila-frontend/
├── index.html          (entrada principal)
├── pkg/                (gerado pelo wasm-pack)
│   ├── avila_frontend.js
│   ├── avila_frontend_bg.wasm
│   └── package.json
└── src/                (código fonte Rust)
```

## Deploy em Produção

### Netlify/Vercel
1. Build: `wasm-pack build --target web --release`
2. Publish directory: `.` (raiz)
3. Deploy!

### GitHub Pages
```bash
# Após build
git add pkg/
git commit -m "Deploy WASM"
git push origin main
# Configurar Pages para servir da raiz
```

## Performance

- **WASM otimizado**: Build release com LTO
- **SIMD habilitado**: Performance máxima
- **Gzip**: Reduz .wasm de ~500KB para ~150KB
- **Lazy loading**: Componentes carregados sob demanda

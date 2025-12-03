# 🚀 Avila Workspace - Guia de Instalação e Uso

## 📦 Instalação Rápida

### Pré-requisitos
- Rust 1.70+ (`rustup update`)
- Cargo (incluído com Rust)
- wasm-pack para frontend WASM

```bash
# Instalar Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Instalar wasm-pack
cargo install wasm-pack
```

## 🧪 Executando Testes

### Testes Completos
```bash
# Vision (45 testes)
cd d:\arxis\avila-vision
cargo test

# Clustering (16 testes)
cd d:\arxis\avila-clustering
cargo test

# ML (30 testes)
cd d:\arxis\avila-ml
cargo test

# Image (3 testes)
cd d:\arxis\avila-image
cargo test --lib

# HTTP (1 teste)
cd d:\arxis\avila-http
cargo test --lib
```

### Testes em Paralelo
```bash
# Todos os projetos de uma vez
cd d:\arxis
cargo test --workspace
```

## 🎨 Executando Demos

### Método 1: Servidor Rust Nativo
```bash
cd d:\arxis\avila-frontend
rustc server.rs -O
./server.exe
# Acesse: http://localhost:8000/demos.html
```

### Método 2: Python HTTP Server
```bash
cd d:\arxis\avila-frontend
python -m http.server 8000
# Acesse: http://localhost:8000/demos.html
```

### Método 3: PHP Server
```bash
cd d:\arxis\avila-frontend
php -S localhost:8000
```

## 🌐 Demos Disponíveis

### 1. Vision Demo (`vision-demo.html`)
**Funcionalidades:**
- Upload de imagens (drag & drop)
- Detecção de objetos (YOLO)
- Reconhecimento facial
- Estimativa de pose
- Download de resultados
- Canvas interativo

**Como usar:**
1. Abra `http://localhost:8000/vision-demo.html`
2. Arraste uma imagem ou clique em "Choose File"
3. Selecione o modo (Detection, Face, Pose, Segmentation)
4. Clique em "Process Image"
5. Veja os resultados na tela

### 2. Clustering Demo (`clustering-demo.html`)
**Algoritmos:**
- K-Means
- DBSCAN
- HDBSCAN
- OPTICS
- Spectral Clustering

**Como usar:**
1. Abra `http://localhost:8000/clustering-demo.html`
2. Gere dados aleatórios ou clique no canvas
3. Escolha o algoritmo
4. Ajuste parâmetros (K, epsilon, minPts)
5. Execute e visualize

### 3. ML Demo (`ml-demo.html`)
**Funcionalidades:**
- Treinamento de redes neurais em tempo real
- Visualização de loss/accuracy
- Múltiplas arquiteturas (simples, média, profunda)
- Datasets (XOR, spiral, circles, regression)
- Exportação para ONNX

**Como usar:**
1. Selecione dataset e arquitetura
2. Configure learning rate e épocas
3. Clique em "Treinar Modelo"
4. Veja as métricas atualizando em tempo real
5. Exporte o modelo treinado

### 4. DataFrame Demo (`dataframe-demo.html`)
**Operações:**
- Gerar dados aleatórios
- Carregar CSV
- Filtrar, ordenar, agrupar
- Agregações (média, soma, contagem)
- Pivot tables
- Merge/Join
- Exportar CSV

### 5. Telemetry Demo (`telemetry-demo.html`)
**Análises:**
- Streaming de dados em tempo real
- Detecção de anomalias
- Previsão (forecasting)
- FFT (Fast Fourier Transform)
- STL Decomposition
- Autocorrelação
- Moving Average

### 6. Tokenizer Demo (`tokenizer-demo.html`)
**Métodos:**
- BPE (GPT-style)
- WordPiece (BERT-style)
- SentencePiece
- Whitespace tokenization

**Funcionalidades:**
- Tokenização em tempo real
- Visualização de tokens com IDs
- Detokenização
- Estatísticas (compressão, contagens)
- Vocabulário completo

### 7. Geo Demo (`geo-demo.html`)
**Ferramentas:**
- Mapa interativo
- Adicionar marcadores
- Traçar rotas
- Medir distâncias
- Calcular áreas
- Geolocalização do usuário
- Exportar GeoJSON

### 8. Browser Demo (`browser-demo.html`)
**Funcionalidades:**
- Navegação por abas
- Histórico
- Favoritos
- Barra de URL
- Screenshots
- DevTools
- Modo privado

## 🏗️ Compilando Frontend WASM

```bash
cd d:\arxis\avila-frontend

# Build de desenvolvimento
wasm-pack build --target web

# Build de produção (otimizado)
wasm-pack build --target web --release

# O pacote será gerado em:
# - pkg/avila_frontend_bg.wasm (26.7 KB)
# - pkg/avila_frontend.js (13 KB)
```

## 📊 Benchmarks

```bash
# Vision benchmarks
cd d:\arxis\avila-vision
cargo bench

# Clustering benchmarks
cd d:\arxis\avila-clustering
cargo bench

# ML benchmarks
cd d:\arxis\avila-ml
cargo bench
```

## 🐛 Troubleshooting

### Erro: "Cannot find wasm-pack"
```bash
cargo install wasm-pack
```

### Erro: "Port 8000 already in use"
```bash
# Use outra porta
python -m http.server 8080
# ou
./server.exe 8080
```

### Erro de CORS no navegador
Use um servidor HTTP local (não abra HTML diretamente no navegador)

### Testes falhando
```bash
# Limpar cache do Cargo
cargo clean

# Atualizar dependências
cargo update

# Recompilar
cargo build
```

## 📈 Estatísticas do Projeto

- **Testes:** 95/95 passando (100%)
- **Cobertura:** 5 projetos testados
- **Demos:** 8 interativos funcionais
- **Linguagem:** Rust 100%
- **WASM:** 40 KB total (otimizado)
- **Linhas de código:** ~55.000+
- **Dependências externas JS:** 0

## 🔗 Links Úteis

- **Repositório:** https://github.com/avilaops/arxis
- **Documentação:** https://docs.rs/avila-*
- **Discord:** https://discord.gg/avila
- **Website:** https://avilaops.com

## 📝 Licença

MIT OR Apache-2.0

---

**Desenvolvido por Nícolas Ávila e Avila Development Team**

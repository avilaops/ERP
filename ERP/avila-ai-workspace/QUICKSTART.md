# 🚀 Quick Start - AvilaDB

## Pré-requisitos

- Rust 1.75+ (stable)
- CPU com suporte a AVX2 (recomendado) ou AVX-512 (ideal)

```bash
# Verifica versão do Rust
rustc --version

# Instala Rust se necessário
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## Build & Test

### 1. Build Padrão
```bash
# Build em modo release
cargo build --release

# Output: ./target/release/aviladb
```

### 2. Build com Otimizações Extremas
```bash
# Ativa AVX-512 e outras instruções específicas do CPU
cargo build --profile extreme

# ⚠️ Aviso: Binário só funciona no CPU onde foi compilado!
```

### 3. Testes
```bash
# Roda todos os testes do workspace
cargo test --workspace

# Testa apenas um crate específico
cargo test -p avila-crypto

# Testa com output verboso
cargo test --workspace -- --nocapture
```

### 4. Benchmarks
```bash
# Roda benchmarks (requer criterion)
cargo bench --workspace

# Benchmark específico
cargo bench -p avila-primitives --bench bigint_ops
```

## Rodando AvilaDB

### Modo Servidor

```bash
# Inicia servidor na porta padrão (7000)
./target/release/aviladb

# Com configuração customizada
./target/release/aviladb --config aviladb.toml
```

**Output esperado:**
```
🇧🇷 AvilaDB v0.1.0 - Banco de Dados Soberano
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Criptografia: secp256k1 + Schnorr (Bitcoin-grade)
✅ Rede: QUIC/UDP (baixa latência)
✅ Storage: LSM Tree (write-optimized)
✅ Transações: MVCC (snapshot isolation)
✅ ZERO dependencies externas

📂 Data directory: ./aviladb-data
🌐 Listening on: 127.0.0.1:7000
💾 Cache size: 256 MB

🚀 AvilaDB iniciando...
✅ AvilaDB pronto para conexões!

Pressione Ctrl+C para parar.
```

### Arquivo de Configuração (aviladb.toml)

```toml
[server]
bind_addr = "127.0.0.1:7000"
data_dir = "./aviladb-data"

[performance]
cache_size_mb = 256
checkpoint_interval_sec = 60
compaction_threads = 4

[crypto]
# Chave pública do servidor (hex)
public_key = "02a1b2c3d4e5f6..."
# Chave privada (NÃO commitar em produção!)
private_key = "deadbeef..."

[network]
max_connections = 1000
idle_timeout_sec = 30
max_udp_payload = 1200
```

## Desenvolvimento

### Estrutura de Diretórios
```
avila-ai-workspace/
├── Cargo.toml              # Workspace raiz
├── README.md               # Documentação principal
├── TECHNICAL.md            # Detalhes técnicos
├── QUICKSTART.md           # Este arquivo
│
├── avila-nucleus/          # Operações atômicas
│   ├── src/
│   │   ├── lib.rs
│   │   ├── bits.rs
│   │   └── simd.rs
│   └── Cargo.toml
│
├── avila-primitives/       # Tipos fixed-size
│   ├── src/
│   │   ├── lib.rs
│   │   ├── u256.rs
│   │   ├── u2048.rs
│   │   └── ...
│   └── Cargo.toml
│
├── avila-math/             # Matemática modular
│   ├── src/
│   │   ├── lib.rs
│   │   ├── modular.rs
│   │   └── montgomery.rs
│   └── Cargo.toml
│
├── avila-crypto/           # Criptografia soberana
│   ├── src/
│   │   ├── lib.rs
│   │   ├── curves/
│   │   ├── signatures/
│   │   ├── hash/
│   │   └── encryption/
│   └── Cargo.toml
│
├── avila-quinn/            # QUIC protocol
│   ├── src/
│   │   ├── lib.rs
│   │   ├── connection.rs
│   │   ├── packet.rs
│   │   └── ...
│   └── Cargo.toml
│
└── aviladb-core/           # Database engine
    ├── src/
    │   ├── lib.rs
    │   ├── storage.rs
    │   ├── transaction.rs
    │   ├── network.rs
    │   ├── query.rs
    │   └── bin/
    │       └── aviladb.rs
    └── Cargo.toml
```

### Adicionando Novos Módulos

#### 1. Criar novo crate no workspace
```bash
cd avila-ai-workspace
cargo new --lib my-new-crate
```

#### 2. Adicionar ao workspace (Cargo.toml raiz)
```toml
[workspace]
members = [
    "avila-nucleus",
    "avila-primitives",
    # ...
    "my-new-crate",  # ← adiciona aqui
]
```

#### 3. Adicionar dependência em outro crate
```toml
[dependencies]
my-new-crate = { path = "../my-new-crate" }
```

### Debugging

#### 1. Logs
```bash
# Define nível de log (futuro, quando implementar logging)
RUST_LOG=debug ./target/release/aviladb
```

#### 2. GDB/LLDB
```bash
# Build com símbolos de debug
cargo build

# Debug com gdb
gdb ./target/debug/aviladb

# Debug com lldb
lldb ./target/debug/aviladb
```

#### 3. Profiling
```bash
# Instala perf (Linux)
sudo apt install linux-tools-generic

# Profile
cargo build --release
perf record -F 99 -g ./target/release/aviladb
perf report
```

## Performance Tips

### 1. CPU Features
```bash
# Verifica features do CPU
lscpu | grep Flags

# AVX2: Disponível desde ~2013
# AVX-512: Disponível em CPUs server desde ~2017

# Build otimizado para CPU específico
RUSTFLAGS="-C target-cpu=native" cargo build --release
```

### 2. Memory
```bash
# Aumenta stack size (se necessário)
export RUST_MIN_STACK=8388608  # 8MB

# Aloca huge pages (Linux, requer root)
echo 128 | sudo tee /proc/sys/vm/nr_hugepages
```

### 3. Network
```bash
# Aumenta buffer UDP (Linux)
sudo sysctl -w net.core.rmem_max=26214400
sudo sysctl -w net.core.wmem_max=26214400
```

## Troubleshooting

### Problema: "cannot find -lavila_*"
**Solução:** Build workspace inteiro primeiro
```bash
cargo build --workspace
```

### Problema: "SIMD instruction not supported"
**Solução:** CPU não tem AVX2/AVX-512. Build sem SIMD:
```bash
cargo build --release --no-default-features
```

### Problema: "Address already in use"
**Solução:** Porta 7000 já está em uso
```bash
# Verifica processo usando porta
lsof -i :7000

# Mata processo ou usa porta diferente
./aviladb --bind 127.0.0.1:7001
```

### Problema: Compilação muito lenta
**Solução:** Usa cache de compilação
```bash
# Instala sccache
cargo install sccache

# Configura
export RUSTC_WRAPPER=sccache

# Build
cargo build --release
```

## Próximos Passos

1. ✅ **Completa:** Fundação matemática e criptográfica
2. 🚧 **Em progresso:** Implementações completas de BLAKE3, ChaCha20-Poly1305
3. 📋 **TODO:** Cliente Rust para conectar ao AvilaDB
4. 📋 **TODO:** Protocolos de replicação (Raft)
5. 📋 **TODO:** Benchmarks comparativos vs PostgreSQL

## Links Úteis

- [Rust Book](https://doc.rust-lang.org/book/)
- [Rust Performance Book](https://nnethercote.github.io/perf-book/)
- [QUIC RFC 9000](https://www.rfc-editor.org/rfc/rfc9000.html)
- [secp256k1 Standards](https://www.secg.org/sec2-v2.pdf)
- [Bitcoin BIPs](https://github.com/bitcoin/bips)

## Suporte

Dúvidas? Abra uma issue no repositório ou entre em contato:
- Email: dev@avila.inc
- GitHub: https://github.com/avilaeng/aviladb

---

**Happy Hacking! 🇧🇷**

```
Built with passion by Ávila Engineering
No backdoors. No compromises. Pure math.
```

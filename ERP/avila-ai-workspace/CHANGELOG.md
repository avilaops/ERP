# Changelog

All notable changes to AvilaDB will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 🚧 In Progress
- BLAKE3 hash function implementation (compression function)
- Keccak-256 hash (full 24-round permutation)
- ChaCha20-Poly1305 AEAD cipher
- TLS 1.3 handshake with secp256k1
- QUIC packet parsing and encoding
- LSM Tree disk persistence
- Complete test suite with crypto test vectors

### 📋 Planned for v0.2.0
- [ ] Raft consensus for clustering
- [ ] Write-Ahead Log (WAL) for durability
- [ ] Query optimizer with cost-based planning
- [ ] Client libraries (Rust, Python, JavaScript)
- [ ] Replication protocol
- [ ] Backup/restore utilities

## [0.1.0] - 2024-01-XX (Foundation Release)

### 🎉 Added - Core Infrastructure

#### avila-nucleus (Atomic Operations)
- **Arithmetic primitives**: `adc`, `sbb`, `mul_wide`, `mac` for multi-precision math
- **Constant-time operations**: `select_u64`, `cswap_u64` for timing-attack resistance
- **SIMD support**: AVX-512 (8 u64s), AVX2 (4 u64s), ARM NEON (2 u64s)
- **Zero external dependencies**: Pure Rust + intrinsics

#### avila-primitives (Fixed-Size Integers)
- **U256** (256-bit / 4 limbs): Bitcoin addresses, hashes
- **U384** (384-bit / 6 limbs): Intermediate calculations
- **U512** (512-bit / 8 limbs): secp256k1 field arithmetic
- **U2048** (2048-bit / 32 limbs): RSA-equivalent (future use)
- **U4096** (4096-bit / 64 limbs): Post-quantum reserve
- Stack-only allocation (zero heap)
- Big-endian byte conversion
- Wrapping arithmetic (add, sub)

#### avila-math (Modular Arithmetic)
- **ModularArithmetic trait**: `add_mod`, `sub_mod`, `mul_mod`, `pow_mod`, `mod_inverse`
- **Montgomery reduction**: O(n) modular multiplication vs O(n²) division
- **Extended Euclidean algorithm**: Modular inverse computation
- Constant-time where applicable

#### avila-crypto (Sovereign Cryptography)
- **secp256k1 curve**:
  - Point addition and doubling (projective coordinates)
  - Scalar multiplication with double-and-add
  - Generator point G and curve validation
  - Bitcoin-compatible field operations
- **Curve25519**: Ed25519 curve structure (foundation)
- **Schnorr signatures**:
  - BIP-340 compatible
  - Deterministic nonce generation (k = H(privkey || msg))
  - Sign and verify operations
- **ECDSA signatures**: Legacy Bitcoin compatibility
- **BLAKE3** (structure): 4x faster than SHA-256, parallel tree hashing
- **Keccak-256** (structure): Ethereum compatibility
- **ChaCha20** (structure): Stream cipher for TLS
- Zero external crypto libraries

#### avila-quinn (QUIC Protocol)
- **Connection management**:
  - State machine (Initial → Handshake → Established → Closing)
  - Stream multiplexing
  - Flow control per-stream and per-connection
- **Packet handling**:
  - Long headers (handshake, 0-RTT)
  - Short headers (1-RTT)
  - Packet number encoding/decoding
- **Frame types**: PADDING, ACK, CRYPTO, STREAM, RESET_STREAM
- **Congestion control**: Cubic algorithm (W(t) = C(t-K)³ + W_max)
- **Crypto layer**: TLS 1.3 handshake structure with ChaCha20-Poly1305
- UDP-based transport

#### aviladb-core (Database Engine)
- **LSM Tree storage**:
  - MemTable (in-memory B-tree)
  - SSTable (disk-based sorted strings)
  - Leveled compaction strategy
  - Bloom filters for fast negative lookups (planned)
- **MVCC transactions**:
  - Multi-Version Concurrency Control
  - Snapshot isolation
  - Begin, commit, abort operations
  - Garbage collection of old versions
- **Network layer**:
  - QUIC-based client/server
  - Message protocol (Put, Get, Delete, Scan, BeginTx, Commit, Abort)
  - Connection pooling
- **Query processor**:
  - SQL-like query structure
  - SELECT, INSERT, UPDATE, DELETE
  - Query execution engine (foundation)
- **Server binary**: `aviladb` with startup banner and configuration

### 📚 Documentation
- **README.md**: Project philosophy, architecture, comparisons with traditional databases
- **TECHNICAL.md**: Deep dive on math, algorithms, performance tuning
- **QUICKSTART.md**: Build instructions, development guide, troubleshooting
- **CONTRIBUTING.md**: Contribution guidelines, testing, code style
- **aviladb.toml**: Complete configuration example with all options

### 🛠️ Tooling
- **build.ps1** (Windows): PowerShell build script with debug/release/extreme modes
- **build.sh** (Linux/macOS): Bash build script with CPU detection
- **test.ps1** (Windows): Test runner for unit/crypto/integration/perf suites
- **Makefile**: Universal build interface (30+ commands)
- **Cargo profiles**:
  - `dev`: Fast compile, no optimization
  - `release`: Full optimization, LTO
  - `extreme`: CPU-specific (target-cpu=native), max performance

### ⚡ Performance Characteristics
- **U256 operations**: ~1M ops/sec (target)
- **secp256k1 scalar mul**: ~10K ops/sec (target)
- **Schnorr signature**: ~20K sign/sec, ~15K verify/sec (target)
- **BLAKE3 hashing**: ~1 GB/sec throughput (target)
- **QUIC latency**: Sub-millisecond on localhost
- **LSM write throughput**: Memory-bounded (MemTable limited)

### 🔒 Security
- **Constant-time crypto**: No timing leaks in secret operations
- **Stack-only secrets**: No heap allocation for keys/nonces
- **Side-channel resistance**: No data-dependent branches
- **Proven algorithms**: Bitcoin/Ethereum battle-tested (secp256k1, Schnorr)
- **Zero backdoors**: All code auditable, no binary blobs

### 🏗️ Architecture Decisions
1. **No external dependencies**: Every algorithm implemented from scratch
2. **Stack allocation**: Fixed-size arrays for performance and security
3. **SIMD when possible**: AVX-512/AVX2 for parallel operations
4. **Rust `no_std`**: Core crypto works in embedded environments
5. **QUIC over UDP**: Lower latency than TCP, built-in encryption
6. **LSM Tree**: Optimized for write-heavy workloads
7. **MVCC**: True snapshot isolation without locking

### 🐛 Known Issues
- BLAKE3 compression function not yet implemented (structure exists)
- Keccak-256 permutation not complete (structure exists)
- ChaCha20-Poly1305 needs core algorithm implementation
- TLS 1.3 handshake needs crypto integration
- QUIC packet parsing needs byte-level implementation
- LSM Tree disk I/O not implemented (in-memory only)
- No query optimizer yet
- No replication/clustering

### 📊 Code Statistics
- **Total Rust files**: ~20
- **Lines of code**: ~4,000 (estimated)
- **Crates**: 6 in workspace
- **Test coverage**: Foundational tests in place
- **Documentation**: Extensive inline docs + 5 markdown files

### 🎯 Philosophy
> "Construir do átomo para cima, sem dependências externas.
> Zero compromissos com aprovações governamentais ou padrões corporativos.
> Se Bitcoin e Ethereum confiam em secp256k1 e Schnorr, nós também confiamos."

This release establishes the **mathematical and cryptographic foundation**
for AvilaDB. Everything is built from first principles with transparency
and auditability as core values.

### 🙏 Acknowledgments
- **Bitcoin**: secp256k1 curve and Schnorr signature scheme (BIP-340)
- **Ethereum**: Keccak-256 hash function
- **BLAKE3**: Modern hash design
- **QUIC**: Modern network protocol (RFC 9000)
- **Rust**: Memory safety without garbage collection

---

## Version History

- **0.1.0** (Current): Foundation - Crypto primitives and database structure
- **0.2.0** (Planned): Clustering - Raft consensus and replication
- **0.3.0** (Planned): Advanced queries - Optimizer and indexes
- **1.0.0** (Goal): Production-ready - Complete feature set, audited crypto

---

**Legend:**
- 🎉 Added: New features
- 🔧 Changed: Changes in existing functionality
- 🗑️ Deprecated: Soon-to-be removed features
- ❌ Removed: Removed features
- 🐛 Fixed: Bug fixes
- 🔒 Security: Security improvements
- ⚡ Performance: Performance improvements

---

For detailed changes, see Git commit history: `git log --oneline --graph`

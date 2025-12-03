# avila-parallel v0.3.0 Release Notes

## 🎉 Nível 4.0 - Work Stealing, SIMD & Advanced Configuration

**Data de lançamento**: 2 de dezembro de 2025

## 🚀 Novos Recursos

### 1. Work Stealing Scheduler
- **`WorkStealingPool`**: Pool de threads com roubo de trabalho dinâmico
- **`WorkStealingDeque`**: Fila dupla thread-safe para distribuição de tarefas
- **`work_stealing_map`**: Operação map com balanceamento automático de carga
- **Benefícios**: Melhor utilização de recursos em workloads desbalanceados

### 2. SIMD Operations
- **`simd_sum_i32/f32/f64`**: Somas otimizadas com SIMD
- **`simd_dot_f32/f64`**: Produto escalar vetorizado
- **`parallel_simd_sum_*`**: Versões paralelas das operações SIMD
- **Benefícios**: Performance superior em operações numéricas vetoriais

### 3. Advanced Thread Pool Configuration
- **`ThreadPoolConfig`**: Configuração completa do pool de threads
- **`set_global_config`**: Define configuração global
- **`get_global_config`**: Obtém configuração atual
- **Configurações disponíveis**:
  - `num_threads`: Número de threads do pool
  - `stack_size`: Tamanho da stack de cada thread
  - `thread_name`: Prefixo dos nomes dos threads
  - `min_chunk_size`: Tamanho mínimo de chunks
  - `max_chunk_size`: Tamanho máximo de chunks
  - `idle_timeout`: Timeout para threads ociosos

## 📊 Estatísticas

### Código
- **63 arquivos Rust** (334 KB)
- **37 testes** passando (100%)
- **9 módulos** completos
- **7 exemplos** funcionais
- **Zero dependências** em runtime

### Performance (melhorado desde v0.2.0)
- **Sum**: 1.70x - 2.32x speedup
- **Filter**: até 3.07x speedup
- **Count**: 1.98x speedup
- **Sort**: 3.28x speedup
- **Work stealing**: Balanceamento dinâmico eficiente

## 🔄 Mudanças desde v0.2.0

### Adicionado
- Módulo `work_stealing` com pool e deque
- Módulo `simd` com operações vetorizadas
- Módulo `config` com configuração avançada
- 9 novos testes (28 → 37)
- Exemplo `level_4_features.rs`

### Melhorado
- Documentação expandida com exemplos SIMD
- README atualizado com novos recursos
- Benchmarks incluem novas operações

### Mantido
- Zero dependências em runtime
- Compatibilidade com Rust 1.70+
- API retrocompatível com v0.2.0

## 📦 Instalação

```toml
[dependencies]
avila-parallel = "0.3.0"
```

## 💻 Exemplos de Uso

### Work Stealing
```rust
use avila_parallel::work_stealing_map;

let data = vec![1, 2, 3, 4, 5];
let results = work_stealing_map(&data, |x| x * x);
```

### SIMD
```rust
use avila_parallel::simd;

let sum = simd::parallel_simd_sum_i32(&data);
let dot = simd::simd_dot_f32(&a, &b);
```

### Configuração
```rust
use avila_parallel::{ThreadPoolConfig, set_global_config};

let config = ThreadPoolConfig::new()
    .num_threads(8)
    .min_chunk_size(2048);
set_global_config(config);
```

## 🔗 Links

- **Crates.io**: https://crates.io/crates/avila-parallel
- **Documentação**: https://docs.rs/avila-parallel
- **Repositório**: https://github.com/avilaops/arxis

## 🙏 Agradecimentos

Desenvolvido por **Nícolas Ávila** e a **Avila Development Team**.

## 🔮 Próximos Passos (v0.4.0)

- Async/await integration
- Lock-free data structures
- NUMA-aware scheduling
- GPU acceleration exploration
- Distributed computing primitives

---

**avila-parallel v0.3.0** - Zero-dependency parallel library with work stealing, SIMD, and advanced configuration 🚀

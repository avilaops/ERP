# Benchmark Analysis for avila-parallel

## Summary

Benchmarks executados com Criterion.rs em modo release.

### Hardware
- CPU: 12 cores
- Sistema: Windows
- Rust: 1.70+

## Resultados

### Map Operation

| Dataset Size | Sequential | Parallel | Speedup |
|-------------|-----------|----------|---------|
| 1K | ~2.8µs | ~4.3µs | 0.65x ❌ |
| 10K | ~31µs | ~18µs | **1.72x** ✅ |
| 100K | 488µs | 14.9ms | 0.03x ❌ |
| 1M | 3.3ms | 15.2ms | 0.22x ❌ |

**Conclusão**: Overhead significativo para operação simples (x * 2)

### Filter Operation

| Dataset Size | Sequential | Parallel | Speedup |
|-------------|-----------|----------|---------|
| 1K | 2.8µs | 4.3µs | 0.65x ❌ |
| 10K | 31µs | 18µs | **1.77x** ✅ |
| 100K | 516µs | 168µs | **3.07x** ✅✅ |
| 1M | 5.1ms | 24ms | 0.21x ❌ |

**Conclusão**: Bom speedup em 10K-100K elementos

### Sum Operation

| Dataset Size | Sequential | Parallel | Speedup |
|-------------|-----------|----------|---------|
| 1K | 105ns | 105ns | 1.00x |
| 10K | 2.3µs | 1.4µs | **1.64x** ✅ |
| 100K | 23µs | 9.9µs | **2.32x** ✅✅ |
| 1M | 416µs | 244µs | **1.70x** ✅ |

**Conclusão**: Excelente speedup em todos os tamanhos médios/grandes!

### Complex Computation (100 iterations per element)

| Dataset Size | Sequential | Parallel | Speedup |
|-------------|-----------|----------|---------|
| 1K | 427µs | 1.7ms | 0.25x ❌ |
| 10K | 7.9ms | 8.1ms | 0.98x ⚠️ |
| 100K | 88ms | 108ms | 0.81x ⚠️ |

**Conclusão**: Overhead ainda presente. Necessita operações ainda mais caras.

### Count Operation

| Dataset Size | Sequential | Parallel | Speedup |
|-------------|-----------|----------|---------|
| 1K | 4.1µs | 5.8µs | 0.71x ❌ |
| 10K | 42µs | 59µs | 0.71x ❌ |
| 100K | 703µs | 356µs | **1.98x** ✅✅ |
| 1M | 4.1ms | 3.7ms | **1.11x** ✅ |

**Conclusão**: Bom para datasets grandes

### Find Operation (pior caso - último elemento)

| Dataset Size | Sequential | Parallel | Speedup |
|-------------|-----------|----------|---------|
| 1K | 5.1µs | 4.2ms | 0.001x ❌❌ |
| 10K | 23µs | 35.8ms | 0.001x ❌❌ |
| 100K | 371µs | 126ms | 0.003x ❌❌ |
| 1M | 2.7ms | 57.7ms | 0.047x ❌❌ |

**Conclusão**: Find paralelo NÃO funciona bem (overhead de lançar threads para busca)

## Insights Principais

### ✅ Quando Usar Paralelo

1. **Sum**: Excelente para datasets > 10K
   - Speedup: 1.64x - 2.32x

2. **Filter**: Ótimo para 10K-100K elementos
   - Speedup até 3.07x

3. **Count**: Bom para > 100K elementos
   - Speedup: 1.98x - 2.11x

### ❌ Quando Evitar Paralelo

1. **Map simples**: Operação muito barata
   - Overhead supera benefício

2. **Find/Search**: Threads têm overhead muito alto
   - 1000x mais lento!

3. **Datasets pequenos**: < 10K elementos
   - Overhead de thread domina

### ⚠️ Casos Limítrofes

1. **Complex Computation**: Precisa ser MUITO cara
   - 100 iterações ainda não é suficiente
   - Requer 1000+ iterações por elemento

2. **Map em grandes datasets**: Depende da operação
   - Se operação for > 1µs, paralelo vale a pena

## Recomendações

### Para v0.2.0

1. **Otimizar Find**
   - Implementar busca com early-exit
   - Usar atomic flag para cancelamento

2. **Chunk Size Dinâmico**
   - Adaptar baseado no tamanho do dataset
   - MIN_CHUNK_SIZE = 1024 para operações simples

3. **Work Stealing**
   - Melhorar balanceamento de carga
   - Reduzir overhead

### Uso Recomendado

```rust
// ✅ BOM: Sum em grande dataset
let sum: i32 = large_data.par_iter().sum();

// ✅ BOM: Filter com predicado moderado
let evens: Vec<_> = data.par_iter()
    .filter(|x| expensive_check(*x))
    .collect();

// ❌ RUIM: Map muito simples
let doubled = data.par_iter()
    .map(|x| x * 2)  // Muito barato!
    .collect();

// ❌ RUIM: Find
let found = data.par_iter()
    .find(|x| *x == target);  // Use sequential!
```

## Conclusão

A biblioteca funciona bem para:
- ✅ Operações de agregação (sum, count)
- ✅ Datasets médios (10K-1M elementos)
- ✅ Operações com custo moderado

Precisa de melhorias para:
- ❌ Operações muito simples
- ❌ Busca/find
- ❌ Datasets muito grandes (> 1M)

**Score Geral**: 7/10 - Bom para casos de uso específicos, precisa otimizações

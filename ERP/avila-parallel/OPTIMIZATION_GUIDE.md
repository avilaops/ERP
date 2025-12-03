# 🚀 Optimization Guide for avila-parallel

## Understanding Performance Characteristics

### Thread Overhead

Every parallel operation has overhead from:
1. **Thread creation and synchronization** (~50-100µs per call)
2. **Data chunking and distribution** (~10-50µs depending on size)
3. **Result collection and merging** (~20-100µs depending on collection type)

This means simple operations on small datasets will run **slower** in parallel.

## Profiling Your Code

### Quick Performance Check

```rust
use std::time::Instant;
use avila_parallel::prelude::*;

let data: Vec<i32> = (0..1_000_000).collect();

// Measure sequential
let start = Instant::now();
let seq_result: Vec<_> = data.iter().map(|x| x * 2).collect();
let seq_time = start.elapsed();

// Measure parallel
let start = Instant::now();
let par_result = data.par_vec().map(|x| x * 2).collect();
let par_time = start.elapsed();

println!("Sequential: {:?}, Parallel: {:?}", seq_time, par_time);
println!("Speedup: {:.2}x", seq_time.as_secs_f64() / par_time.as_secs_f64());
```

## Optimization Strategies

### 1. Increase Work Per Element

❌ **Bad** - Too simple for parallelization:
```rust
let results = data.par_vec()
    .map(|x| x * 2)  // <1µs per element
    .collect();
```

✅ **Good** - Expensive computation benefits:
```rust
let results = data.par_vec()
    .map(|&x| {
        // Complex calculation (>100µs per element)
        let mut result = x;
        for _ in 0..1000 {
            result = (result * 31 + 17) % 1_000_000;
            result = result.wrapping_mul(result);
        }
        result
    })
    .collect();
```

### 2. Batch Small Operations

❌ **Bad** - Many small parallel calls:
```rust
let step1 = data.par_vec().map(|x| x * 2).collect();
let step2 = step1.par_vec().map(|x| x + 1).collect();
let step3 = step2.par_vec().filter(|x| x % 2 == 0).collect();
```

✅ **Good** - Combine operations:
```rust
let results = data.par_vec()
    .map(|x| x * 2 + 1)
    .filter(|x| x % 2 == 0)
    .collect();
```

### 3. Use Appropriate Dataset Sizes

| Dataset Size | Recommendation | Reason |
|--------------|----------------|---------|
| < 1K | Sequential | Overhead > benefit |
| 1K - 10K | Test both | Depends on operation |
| 10K - 100K | Likely parallel | Good balance |
| > 100K | Parallel | Overhead amortized |

### 4. Choose the Right API

**For simple transformations**: Use `par_iter()`
```rust
let sum: i32 = data.par_iter().sum();
```

**For complex pipelines**: Use `par_vec()`
```rust
let results = data.par_vec()
    .filter(|x| x % 2 == 0)
    .map(|x| x * x)
    .collect();
```

**For low-level control**: Use executor functions
```rust
use avila_parallel::executor::parallel_map;
let results = parallel_map(&data, |x| expensive_computation(x));
```

## Real-World Examples

### Image Processing

```rust
use avila_parallel::prelude::*;

struct Pixel { r: u8, g: u8, b: u8 }

fn process_image(pixels: Vec<Pixel>) -> Vec<Pixel> {
    pixels.par_vec()
        .map(|p| {
            // Expensive color transformation
            let gray = (0.299 * p.r as f32 +
                       0.587 * p.g as f32 +
                       0.114 * p.b as f32) as u8;

            // Apply filters (expensive)
            let enhanced = apply_gaussian_blur(gray);
            let sharpened = apply_sharpen(enhanced);

            Pixel { r: sharpened, g: sharpened, b: sharpened }
        })
        .collect()
}
```

### Financial Calculations

```rust
use avila_parallel::prelude::*;

struct Transaction {
    amount: f64,
    days: i32,
    rate: f64,
}

fn calculate_portfolio_value(transactions: Vec<Transaction>) -> f64 {
    transactions.par_iter()
        .map(|t| {
            // Compound interest calculation
            let principal = t.amount;
            let daily_rate = t.rate / 365.0;
            principal * (1.0 + daily_rate).powi(t.days)
        })
        .sum()
}
```

### Log Analysis

```rust
use avila_parallel::prelude::*;

struct LogEntry {
    timestamp: u64,
    level: LogLevel,
    message: String,
}

fn analyze_logs(logs: Vec<LogEntry>) -> Stats {
    let error_logs = logs.par_iter()
        .filter(|log| log.level == LogLevel::Error)
        .map(|log| log.message.len())
        .collect::<Vec<_>>();

    Stats {
        error_count: error_logs.len(),
        avg_message_size: error_logs.iter().sum::<usize>() / error_logs.len(),
    }
}
```

## Benchmarking Best Practices

### 1. Use Release Mode

```bash
cargo run --example performance_comparison --release
```

### 2. Warm Up the System

```rust
// Run once to warm up
let _ = data.par_vec().map(|x| x * 2).collect::<Vec<_>>();

// Now measure
let start = Instant::now();
let result = data.par_vec().map(|x| x * 2).collect::<Vec<_>>();
let elapsed = start.elapsed();
```

### 3. Average Multiple Runs

```rust
let mut total = Duration::ZERO;
for _ in 0..10 {
    let start = Instant::now();
    let _ = data.par_vec().map(|x| expensive(x)).collect::<Vec<_>>();
    total += start.elapsed();
}
let avg = total / 10;
println!("Average: {:?}", avg);
```

## Common Performance Issues

### Issue: Slower Than Sequential

**Symptoms:**
- Parallel version takes longer
- CPU usage is low

**Possible Causes:**
1. Dataset too small
2. Operation too simple
3. Memory bandwidth bottleneck

**Solutions:**
- Increase dataset size
- Combine multiple operations
- Use sequential for this case

### Issue: No Speedup on Large Data

**Symptoms:**
- Large dataset but no speedup
- All cores utilized

**Possible Causes:**
1. Memory bandwidth limit
2. False sharing
3. Lock contention

**Solutions:**
- Reduce memory allocations
- Process data in larger chunks
- Avoid shared mutable state

### Issue: Inconsistent Performance

**Symptoms:**
- Performance varies between runs
- Sometimes fast, sometimes slow

**Possible Causes:**
1. System load
2. Thermal throttling
3. Memory fragmentation

**Solutions:**
- Close background applications
- Use consistent test environment
- Run multiple iterations

## Tuning Parameters

The library uses these internal constants (currently not configurable):

```rust
const MIN_CHUNK_SIZE: usize = 512;  // Minimum elements per chunk
const MAX_CHUNKS_PER_THREAD: usize = 8;  // Max chunks per thread
```

These were chosen based on benchmarking. For your specific use case:

1. **If operations are very expensive (>1ms each):**
   - Smaller chunks might help (256-512)
   - More even work distribution

2. **If operations are cheap (<10µs each):**
   - Larger chunks reduce overhead (1024-2048)
   - Fewer synchronization points

## Monitoring Performance

### Using `cargo flamegraph`

```bash
cargo install flamegraph
cargo flamegraph --example your_benchmark
```

### Using `perf` (Linux)

```bash
perf record --call-graph dwarf cargo run --release --example benchmark
perf report
```

### Using Instruments (macOS)

```bash
instruments -t "Time Profiler" ./target/release/examples/benchmark
```

## Summary

**Key Takeaways:**

1. ✅ Parallel processing shines with **large datasets** and **CPU-intensive operations**
2. ❌ Avoid parallelizing **trivial operations** on **small datasets**
3. 🔍 Always **benchmark** your specific use case
4. 📊 Profile to understand where time is spent
5. 🎯 Optimize the **algorithm first**, parallelize **second**

Remember: The fastest parallel code is often the code that doesn't need to run at all. Consider:
- Caching results
- Using better algorithms (O(n log n) sequential often beats O(n²) parallel)
- Lazy evaluation
- Early termination with `find_any()`

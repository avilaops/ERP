use avila_parallel::prelude::*;
use avila_parallel::executor;

fn main() {
    println!("=== Advanced Configuration Demo ===\n");

    // Show current configuration
    println!("System Configuration:");
    println!("  CPU cores: {}", executor::num_cpus());
    println!("  Min chunk size: {}", executor::get_min_chunk_size());
    println!();

    // Demo 1: Default configuration
    println!("1. Default Configuration:");
    let data: Vec<i32> = (0..100_000).collect();

    let start = std::time::Instant::now();
    let sum: i32 = data.par_iter().sum();
    let elapsed = start.elapsed();

    println!("  Sum of 100K elements: {}", sum);
    println!("  Time: {:?}", elapsed);
    println!();

    // Demo 2: Custom configuration via environment variable
    println!("2. Custom Configuration (via env var):");
    println!("  Try running with: AVILA_MIN_CHUNK_SIZE=2048 cargo run --example configuration");
    println!();

    // Demo 3: Show chunk size calculation
    println!("3. Chunk Size Calculation:");
    for size in [1_000, 10_000, 100_000, 1_000_000] {
        let num_threads = executor::num_cpus();
        let chunk_size = executor::calculate_chunk_size(size, num_threads);
        let num_chunks = (size + chunk_size - 1) / chunk_size;
        println!("  Dataset: {:>7} → Chunk size: {:>6}, Chunks: {:>4}",
                 size, chunk_size, num_chunks);
    }
    println!();

    // Demo 4: Performance with different workloads
    println!("4. Workload Analysis:");

    // Light workload (simple multiplication)
    let start = std::time::Instant::now();
    let _light: Vec<_> = data.par_vec().map(|x| x * 2).collect();
    let light_time = start.elapsed();
    println!("  Light workload (x*2): {:?}", light_time);

    // Medium workload (some computation)
    let start = std::time::Instant::now();
    let _medium: Vec<_> = data.par_vec()
        .map(|&x| {
            let mut val = x;
            for _ in 0..10 {
                val = (val * 31 + 17) % 1_000_000;
            }
            val
        })
        .collect();
    let medium_time = start.elapsed();
    println!("  Medium workload (10 ops): {:?}", medium_time);

    // Heavy workload (expensive computation)
    let start = std::time::Instant::now();
    let _heavy: Vec<_> = data.par_vec()
        .map(|&x| {
            let mut val = x;
            for _ in 0..100 {
                val = (val * 31 + 17) % 1_000_000;
            }
            val
        })
        .collect();
    let heavy_time = start.elapsed();
    println!("  Heavy workload (100 ops): {:?}", heavy_time);
    println!();

    // Demo 5: Recommendations
    println!("5. Configuration Recommendations:");
    println!();
    println!("  Light workloads (< 10µs per element):");
    println!("    → Increase chunk size: AVILA_MIN_CHUNK_SIZE=2048");
    println!("    → Or use sequential processing");
    println!();
    println!("  Medium workloads (10-100µs per element):");
    println!("    → Default works well: 1024 (current)");
    println!();
    println!("  Heavy workloads (> 100µs per element):");
    println!("    → Decrease chunk size: AVILA_MIN_CHUNK_SIZE=512");
    println!("    → Better load distribution");
    println!();

    // Demo 6: Early termination example
    println!("6. Early Termination (Find Operation):");
    let large_data: Vec<i32> = (0..1_000_000).collect();

    // Find early in the dataset
    let start = std::time::Instant::now();
    let found = executor::parallel_find(&large_data, |x| *x == 1000);
    let early_time = start.elapsed();
    println!("  Find element 1000: {:?} in {:?}", found, early_time);

    // Find late in the dataset (worst case)
    let start = std::time::Instant::now();
    let found = executor::parallel_find(&large_data, |x| *x == 999_000);
    let late_time = start.elapsed();
    println!("  Find element 999000: {:?} in {:?}", found, late_time);
    println!();

    println!("=== Demo Complete ===");
    println!();
    println!("Try these commands:");
    println!("  AVILA_MIN_CHUNK_SIZE=512 cargo run --example configuration --release");
    println!("  AVILA_MIN_CHUNK_SIZE=2048 cargo run --example configuration --release");
}

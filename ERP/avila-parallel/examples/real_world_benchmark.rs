use avila_parallel::{ParallelIterator, IntoParallelVec};
use avila_parallel::parallel::ParallelSlice;
use std::time::Instant;

fn measure<F>(name: &str, f: F) -> std::time::Duration
where
    F: FnOnce(),
{
    let start = Instant::now();
    f();
    let elapsed = start.elapsed();
    println!("  {} took: {:?}", name, elapsed);
    elapsed
}

fn main() {
    println!("=== Real-World Benchmark ===\n");

    // Scenario 1: Image Processing Simulation (CPU-intensive)
    println!("1. Image Processing (10M pixels, color transformation):");
    let pixels: Vec<(u8, u8, u8)> = (0..10_000_000)
        .map(|i| ((i % 256) as u8, ((i / 256) % 256) as u8, ((i / 65536) % 256) as u8))
        .collect();

    let seq_time = measure("Sequential", || {
        let _result: Vec<_> = pixels
            .iter()
            .map(|&(r, g, b)| {
                // Simulate expensive color transformation
                let gray = (0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32) as u8;
                let enhanced = gray.saturating_mul(2).min(255);
                (enhanced, enhanced, enhanced)
            })
            .collect();
    });

    let par_time = measure("Parallel   ", || {
        let _result = pixels.par_vec()
            .map(|&(r, g, b)| {
                let gray = (0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32) as u8;
                let enhanced = gray.saturating_mul(2).min(255);
                (enhanced, enhanced, enhanced)
            })
            .collect();
    });

    println!("  Speedup: {:.2}x\n", seq_time.as_secs_f64() / par_time.as_secs_f64());

    // Scenario 2: Financial Calculation (many small computations)
    println!("2. Portfolio Analysis (1M transactions):");
    let transactions: Vec<(f64, f64, i32)> = (0..1_000_000)
        .map(|i| {
            let price = 100.0 + (i as f64 * 0.01) % 50.0;
            let quantity = ((i % 100) as f64) + 1.0;
            let days = (i % 365) as i32;
            (price, quantity, days)
        })
        .collect();

    let seq_time = measure("Sequential", || {
        let _total: f64 = transactions
            .iter()
            .map(|&(price, qty, days)| {
                // Calculate compound interest
                let principal = price * qty;
                let rate = 0.05_f64 / 365.0;
                let compound = principal * (1.0 + rate).powi(days);
                compound
            })
            .sum();
    });

    let par_time = measure("Parallel   ", || {
        let _total: f64 = transactions.par_iter()
            .map(|&(price, qty, days)| {
                let principal = price * qty;
                let rate = 0.05_f64 / 365.0;
                let compound = principal * (1.0 + rate).powi(days);
                compound
            })
            .sum();
    });

    println!("  Speedup: {:.2}x\n", seq_time.as_secs_f64() / par_time.as_secs_f64());

    // Scenario 3: Data Filtering and Aggregation
    println!("3. Log Analysis (5M log entries):");
    #[derive(Clone)]
    struct LogEntry {
        timestamp: u64,
        level: u8,  // 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR
        size: usize,
    }

    let logs: Vec<LogEntry> = (0..5_000_000)
        .map(|i| LogEntry {
            timestamp: i,
            level: (i % 4) as u8,
            size: ((i % 1000) + 100) as usize,
        })
        .collect();

    let seq_time = measure("Sequential", || {
        let errors: Vec<_> = logs
            .iter()
            .filter(|log| log.level >= 2)  // WARN and ERROR
            .map(|log| log.size)
            .collect();
        let _avg = errors.iter().sum::<usize>() as f64 / errors.len() as f64;
    });

    let par_time = measure("Parallel   ", || {
        let errors: Vec<usize> = logs.par_iter()
            .filter(|log| log.level >= 2)
            .map(|log| log.size)
            .collect();
        let _avg = errors.iter().sum::<usize>() as f64 / errors.len() as f64;
    });

    println!("  Speedup: {:.2}x\n", seq_time.as_secs_f64() / par_time.as_secs_f64());

    // Scenario 4: Scientific Computing (matrix-like operations)
    println!("4. Matrix Operations (1000x1000 matrix):");
    let matrix: Vec<Vec<f64>> = (0..1000)
        .map(|i| (0..1000).map(|j| (i * j) as f64).collect())
        .collect();

    let seq_time = measure("Sequential", || {
        let _result: Vec<f64> = matrix
            .iter()
            .map(|row| {
                // Compute row statistics
                let sum: f64 = row.iter().sum();
                let mean = sum / row.len() as f64;
                let variance: f64 = row.iter()
                    .map(|&x| (x - mean).powi(2))
                    .sum::<f64>() / row.len() as f64;
                variance.sqrt()  // Standard deviation
            })
            .collect();
    });

    let par_time = measure("Parallel   ", || {
        let _result: Vec<f64> = matrix.par_iter()
            .map(|row| {
                let sum: f64 = row.iter().sum();
                let mean = sum / row.len() as f64;
                let variance: f64 = row.iter()
                    .map(|&x| (x - mean).powi(2))
                    .sum::<f64>() / row.len() as f64;
                variance.sqrt()
            })
            .collect();
    });

    println!("  Speedup: {:.2}x\n", seq_time.as_secs_f64() / par_time.as_secs_f64());

    // Scenario 5: String Processing
    println!("5. Text Processing (1M strings):");
    let texts: Vec<String> = (0..1_000_000)
        .map(|i| format!("Sample text number {} with some additional content", i))
        .collect();

    let seq_time = measure("Sequential", || {
        let _result: Vec<_> = texts
            .iter()
            .filter(|s| s.len() > 30)
            .map(|s| s.to_uppercase())
            .collect();
    });

    let par_time = measure("Parallel   ", || {
        let _result: Vec<String> = texts.par_iter()
            .filter(|s| s.len() > 30)
            .map(|s| s.to_uppercase())
            .collect();
    });

    println!("  Speedup: {:.2}x\n", seq_time.as_secs_f64() / par_time.as_secs_f64());

    println!("=== Benchmark Complete ===");
}

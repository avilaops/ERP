//! Exemplo de benchmark de performance
//! Compara FFT recursiva vs iterativa

use avila_fft::{Complex, FftPlanner, fft};
use std::time::Instant;

fn benchmark_recursive(size: usize, iterations: usize) -> f64 {
    let input: Vec<Complex<f64>> = (0..size)
        .map(|i| Complex::new((i as f64).sin(), (i as f64).cos()))
        .collect();

    let start = Instant::now();
    for _ in 0..iterations {
        let _ = fft(&input);
    }
    let duration = start.elapsed();
    duration.as_secs_f64() / (iterations as f64)
}

fn benchmark_iterative(size: usize, iterations: usize) -> f64 {
    let input: Vec<Complex<f64>> = (0..size)
        .map(|i| Complex::new((i as f64).sin(), (i as f64).cos()))
        .collect();

    let planner = FftPlanner::new(size, false).unwrap();

    let start = Instant::now();
    for _ in 0..iterations {
        let _ = planner.process(&input).unwrap();
    }
    let duration = start.elapsed();
    duration.as_secs_f64() / (iterations as f64)
}

fn main() {
    println!("=== Benchmark FFT - Avila FFT ===");
    println!("Compile com --release para resultados precisos!\n");

    let sizes = vec![64, 128, 256, 512, 1024, 2048, 4096];

    println!("{:>6} | {:>12} | {:>12} | {:>10} | {:>12}",
        "N", "Recursiva", "Iterativa", "Speedup", "Throughput");
    println!("{}", "-".repeat(70));

    for &size in &sizes {
        // Mais iterações para tamanhos menores
        let iterations = (100000 / size).max(10);

        let time_recursive = benchmark_recursive(size, iterations);
        let time_iterative = benchmark_iterative(size, iterations);
        let speedup = time_recursive / time_iterative;
        let throughput = (size as f64) / time_iterative / 1e6; // Msamples/s

        println!("{:6} | {:9.2} µs | {:9.2} µs | {:8.2}x | {:8.1} Ms/s",
            size,
            time_recursive * 1e6,
            time_iterative * 1e6,
            speedup,
            throughput
        );
    }

    println!("\n=== Análise de Complexidade ===\n");

    // Verifica se segue O(N log N)
    println!("Verificando complexidade O(N log N):");
    let base_size = 256;
    let base_time = benchmark_iterative(base_size, 1000);

    for &size in &[512, 1024, 2048] {
        let time = benchmark_iterative(size, 1000);
        let ratio = size / base_size;
        let expected_ratio = (ratio as f64) * (size as f64).log2() / (base_size as f64).log2();
        let actual_ratio = time / base_time;

        println!("  N={:4}: esperado {:.2}x, observado {:.2}x",
            size, expected_ratio, actual_ratio);
    }

    println!("\n=== Teste de Precisão ===\n");

    // Compara precisão entre recursiva e iterativa
    let test_size = 1024;
    let input: Vec<Complex<f64>> = (0..test_size)
        .map(|i| Complex::new((i as f64) * 0.1, (i as f64) * 0.05))
        .collect();

    let result_recursive = fft(&input);

    let planner = FftPlanner::new(test_size, false).unwrap();
    let result_iterative = planner.process(&input).unwrap();

    let max_error = result_recursive.iter()
        .zip(result_iterative.iter())
        .map(|(a, b)| (a.re - b.re).abs().max((a.im - b.im).abs()))
        .fold(0.0, f64::max);

    println!("Erro máximo entre recursiva e iterativa: {:.2e}", max_error);

    if max_error < 1e-10 {
        println!("✓ Precisão idêntica!");
    } else {
        println!("⚠ Diferença detectada (ainda aceitável)");
    }

    println!("\n=== Uso de Memória ===\n");

    println!("Recursiva:");
    println!("  - Cria O(N log N) vetores temporários");
    println!("  - Stack frames: O(log N)");
    println!("  - Não recomendada para N grande\n");

    println!("Iterativa:");
    println!("  - Trabalha in-place após bit-reversal");
    println!("  - Cache de twiddle factors: O(N/2)");
    println!("  - Recomendada para produção");
}

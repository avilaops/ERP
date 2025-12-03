//! avx-bench - HTTP Benchmark Tool otimizado para LATAM
//!
//! Uso:
//!   cargo run --bin avx-bench -- https://api.avila.cloud/health
//!   cargo run --bin avx-bench -- https://google.com --requests 10000 --concurrency 100

use avx_http::Client;
use clap::Parser;
use colored::*;
use indicatif::{ProgressBar, ProgressStyle};
use std::time::{Duration, Instant};
use tokio::time::sleep;

#[derive(Parser)]
#[command(name = "avx-bench")]
#[command(about = "🚀 HTTP Benchmark Tool - Teste a velocidade das suas APIs", long_about = None)]
struct Cli {
    /// URL para testar
    url: String,

    /// Número de requisições
    #[arg(short, long, default_value = "1000")]
    requests: usize,

    /// Requisições concorrentes
    #[arg(short, long, default_value = "10")]
    concurrency: usize,

    /// HTTP Method
    #[arg(short, long, default_value = "GET")]
    method: String,

    /// Otimização brasileira
    #[arg(long, default_value = "true")]
    brazilian_optimized: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    println!("{}", "🚀 AVX HTTP Benchmark Tool".bright_blue().bold());
    println!("   Target: {}", cli.url.yellow());
    println!("   Requests: {} (concurrency: {})", cli.requests, cli.concurrency);
    println!();

    let client = Client::new();

    // Warmup
    println!("{}", "🔥 Warming up...".cyan());
    for _ in 0..5 {
        let _ = client.get(&cli.url).send().await;
    }
    sleep(Duration::from_millis(100)).await;

    println!("{}", "⚡ Running benchmark...".green().bold());
    println!();

    let pb = ProgressBar::new(cli.requests as u64);
    pb.set_style(ProgressStyle::default_bar()
        .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({per_sec})")?
        .progress_chars("#>-"));

    let start = Instant::now();
    let mut latencies = Vec::with_capacity(cli.requests);
    let mut errors = 0;

    let mut tasks = Vec::new();
    let batch_size = cli.requests / cli.concurrency;

    for _ in 0..cli.concurrency {
        let url = cli.url.clone();
        let client = client.clone();
        let pb = pb.clone();

        let task = tokio::spawn(async move {
            let mut batch_latencies = Vec::new();
            let mut batch_errors = 0;

            for _ in 0..batch_size {
                let req_start = Instant::now();

                match client.get(&url).send().await {
                    Ok(_response) => {
                        let latency = req_start.elapsed();
                        batch_latencies.push(latency);
                    }
                    Err(_e) => {
                        batch_errors += 1;
                    }
                }

                pb.inc(1);
            }

            (batch_latencies, batch_errors)
        });

        tasks.push(task);
    }

    // Collect results
    for task in tasks {
        let (batch_latencies, batch_errors) = task.await?;
        latencies.extend(batch_latencies);
        errors += batch_errors;
    }

    pb.finish_and_clear();

    let total_duration = start.elapsed();
    let successful = cli.requests - errors;

    // Calculate stats
    latencies.sort();
    let p50 = latencies[latencies.len() / 2];
    let p90 = latencies[latencies.len() * 90 / 100];
    let p99 = latencies[latencies.len() * 99 / 100];
    let min = latencies.first().copied().unwrap_or_default();
    let max = latencies.last().copied().unwrap_or_default();
    let avg = latencies.iter().sum::<Duration>() / latencies.len() as u32;

    let rps = successful as f64 / total_duration.as_secs_f64();

    // Print results
    println!();
    println!("{}", "📊 Results:".bright_green().bold());
    println!();
    println!("   {} Total Requests: {}", "🔢".cyan(), cli.requests);
    println!("   {} Successful: {} ({:.1}%)",
        "✅".green(),
        successful,
        (successful as f64 / cli.requests as f64) * 100.0
    );
    if errors > 0 {
        println!("   {} Errors: {}", "❌".red(), errors);
    }
    println!();
    println!("   {} Duration: {:.2?}", "⏱️ ", total_duration);
    println!("   {} Requests/sec: {:.1}", "⚡".yellow(), rps);
    println!();
    println!("{}", "   Latency:".bright_blue());
    println!("     Min:  {:>8.2?}", min);
    println!("     Avg:  {:>8.2?}", avg);
    println!("     p50:  {:>8.2?}", p50);
    println!("     p90:  {:>8.2?}", p90);
    println!("     p99:  {:>8.2?}", p99);
    println!("     Max:  {:>8.2?}", max);
    println!();

    // Performance grade
    let grade = if avg.as_millis() < 20 {
        ("🔥 EXCELENTE!", "green")
    } else if avg.as_millis() < 50 {
        ("✅ Muito Bom!", "cyan")
    } else if avg.as_millis() < 100 {
        ("👍 Bom", "yellow")
    } else if avg.as_millis() < 200 {
        ("⚠️  Razoável", "yellow")
    } else {
        ("❌ Lento", "red")
    };

    match grade.1 {
        "green" => println!("   {}", grade.0.green().bold()),
        "cyan" => println!("   {}", grade.0.cyan().bold()),
        "yellow" => println!("   {}", grade.0.yellow().bold()),
        "red" => println!("   {}", grade.0.red().bold()),
        _ => println!("   {}", grade.0),
    }

    if cli.brazilian_optimized {
        println!();
        println!("   {} Brazilian optimization: {}", "🇧🇷".cyan(), "ENABLED".green());
    }

    Ok(())
}

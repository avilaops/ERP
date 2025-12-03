//! avila-compress-cli - Ferramenta CLI para compressão ultra-rápida
//!
//! Uso:
//!   cargo run --bin avila-compress-cli -- compress C:\Users\nicol\Downloads
//!   cargo run --bin avila-compress-cli -- decompress arquivo.avz
//!   cargo run --bin avila-compress-cli -- folder C:\Projects --output backup.avz

use avila_compress::lz4;
use clap::{Parser, Subcommand};
use colored::*;
use indicatif::{ProgressBar, ProgressStyle};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Instant;
use walkdir::WalkDir;

#[derive(Parser)]
#[command(name = "avila-compress-cli")]
#[command(about = "🚀 Compressão ultra-rápida para Windows", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Comprime um único arquivo
    Compress {
        /// Arquivo para comprimir
        input: PathBuf,

        /// Arquivo de saída (opcional)
        #[arg(short, long)]
        output: Option<PathBuf>,

        /// Algoritmo: lz4 (rápido) ou zstd (melhor compressão)
        #[arg(short, long, default_value = "lz4")]
        algorithm: String,
    },

    /// Descomprime um arquivo
    Decompress {
        /// Arquivo .avz para descomprimir
        input: PathBuf,

        /// Arquivo de saída
        #[arg(short, long)]
        output: Option<PathBuf>,
    },

    /// Comprime uma pasta inteira
    Folder {
        /// Pasta para comprimir
        path: PathBuf,

        /// Arquivo de saída
        #[arg(short, long)]
        output: PathBuf,
    },
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Compress { input, output, algorithm } => {
            compress_file(&input, output, &algorithm)?;
        }
        Commands::Decompress { input, output } => {
            decompress_file(&input, output)?;
        }
        Commands::Folder { path, output } => {
            compress_folder(&path, &output)?;
        }
    }

    Ok(())
}

fn compress_file(input: &Path, output: Option<PathBuf>, algorithm: &str) -> anyhow::Result<()> {
    println!("{}", "📦 Comprimindo arquivo...".bright_blue().bold());

    let output = output.unwrap_or_else(|| {
        let mut p = input.to_path_buf();
        p.set_extension("avz");
        p
    });

    let start = Instant::now();
    let mut file = File::open(input)?;
    let mut data = Vec::new();
    file.read_to_end(&mut data)?;

    let original_size = data.len();

    let compressed = match algorithm {
        "lz4" => lz4::compress(&data)?,
        _ => anyhow::bail!("Algoritmo inválido: {} (use 'lz4')", algorithm),
    };

    let compressed_size = compressed.len();
    let mut out_file = File::create(&output)?;
    out_file.write_all(&compressed)?;

    let elapsed = start.elapsed();
    let ratio = original_size as f64 / compressed_size as f64;
    let speed_mbps = (original_size as f64 / 1_000_000.0) / elapsed.as_secs_f64();

    println!("   {} → {}",
        format!("{}", input.display()).yellow(),
        format!("{}", output.display()).green()
    );
    println!("   📊 {} → {} ({:.1}x compression)",
        format_bytes(original_size),
        format_bytes(compressed_size),
        ratio
    );
    println!("   ⚡ Speed: {:.1} MB/s", speed_mbps);
    println!("   ⏱️  Time: {:.2?}", elapsed);
    println!("   {} Economizou {}",
        "✅".green(),
        format_bytes(original_size - compressed_size)
    );

    Ok(())
}

fn decompress_file(input: &Path, output: Option<PathBuf>) -> anyhow::Result<()> {
    println!("{}", "📂 Descomprimindo arquivo...".bright_blue().bold());

    let output = output.unwrap_or_else(|| {
        let mut p = input.to_path_buf();
        p.set_extension("");
        p
    });

    let start = Instant::now();
    let mut file = File::open(input)?;
    let mut compressed = Vec::new();
    file.read_to_end(&mut compressed)?;

    // Descomprime com LZ4
    let decompressed = lz4::decompress(&compressed)?;

    let mut out_file = File::create(&output)?;
    out_file.write_all(&decompressed)?;

    let elapsed = start.elapsed();
    let speed_mbps = (decompressed.len() as f64 / 1_000_000.0) / elapsed.as_secs_f64();

    println!("   {} → {}",
        format!("{}", input.display()).yellow(),
        format!("{}", output.display()).green()
    );
    println!("   📊 Size: {}", format_bytes(decompressed.len()));
    println!("   ⚡ Speed: {:.1} MB/s", speed_mbps);
    println!("   {} Pronto!", "✅".green());

    Ok(())
}

fn compress_folder(folder: &Path, output: &Path) -> anyhow::Result<()> {
    println!("{}", "📦 Comprimindo pasta...".bright_blue().bold());
    println!("   Scanning: {}", folder.display());

    let mut files = Vec::new();
    let mut total_size = 0u64;

    for entry in WalkDir::new(folder).follow_links(false) {
        let entry = entry?;
        if entry.file_type().is_file() {
            let size = entry.metadata()?.len();
            files.push((entry.path().to_path_buf(), size));
            total_size += size;
        }
    }

    println!("   Found: {} files ({}) ", files.len(), format_bytes(total_size as usize));

    let pb = ProgressBar::new(files.len() as u64);
    pb.set_style(ProgressStyle::default_bar()
        .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({eta})")?
        .progress_chars("#>-"));

    let start = Instant::now();
    let mut compressed_total = 0usize;

    // Em produção, criaria um archive format. Aqui é demo simples.
    let mut archive = File::create(output)?;

    for (path, _size) in files.iter() {
        let data = fs::read(path)?;
        let compressed = lz4::compress(&data)?;

        // Escreve metadata + data
        let path_str = path.display().to_string();
        let path_bytes = path_str.as_bytes();

        archive.write_all(&(path_bytes.len() as u32).to_le_bytes())?;
        archive.write_all(path_bytes)?;
        archive.write_all(&(compressed.len() as u32).to_le_bytes())?;
        archive.write_all(&compressed)?;

        compressed_total += compressed.len();
        pb.inc(1);
    }

    pb.finish_with_message("Done!");

    let elapsed = start.elapsed();
    let ratio = total_size as f64 / compressed_total as f64;
    let speed_mbps = (total_size as f64 / 1_000_000.0) / elapsed.as_secs_f64();

    println!();
    println!("   {} → {}",
        folder.display().to_string().yellow(),
        output.display().to_string().green()
    );
    println!("   📊 {} → {} ({:.1}x compression)",
        format_bytes(total_size as usize),
        format_bytes(compressed_total),
        ratio
    );
    println!("   ⚡ Speed: {:.1} MB/s", speed_mbps);
    println!("   ⏱️  Time: {:.2?}", elapsed);
    println!("   {} Economizou {}",
        "✅".green(),
        format_bytes(total_size as usize - compressed_total)
    );

    Ok(())
}

fn format_bytes(bytes: usize) -> String {
    const KB: usize = 1024;
    const MB: usize = KB * 1024;
    const GB: usize = MB * 1024;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} bytes", bytes)
    }
}

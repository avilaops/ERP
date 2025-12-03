//! workspace-indexer - Indexador ultra-rápido para VS Code
//!
//! Cria um índice de todos os arquivos do seu workspace para busca instantânea
//!
//! Uso:
//!   cargo run --bin workspace-indexer -- C:\Users\nicol\OneDrive\Avila

use colored::*;
use indicatif::{ProgressBar, ProgressStyle};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;
use walkdir::WalkDir;
use clap::Parser;

#[derive(Parser)]
#[command(name = "workspace-indexer")]
#[command(about = "🔍 Indexador ultra-rápido para workspaces", long_about = None)]
struct Cli {
    /// Pasta do workspace
    path: PathBuf,

    /// Arquivo de saída do índice
    #[arg(short, long, default_value = "workspace_index.json")]
    output: PathBuf,

    /// Incluir arquivos ocultos
    #[arg(long, default_value = "false")]
    hidden: bool,
}

#[derive(serde::Serialize)]
struct FileEntry {
    path: String,
    size: u64,
    extension: String,
    is_code: bool,
}

#[derive(serde::Serialize)]
struct WorkspaceIndex {
    root: String,
    total_files: usize,
    total_size: u64,
    code_files: usize,
    files: Vec<FileEntry>,
    indexed_at: String,
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    println!("{}", "🔍 Workspace Indexer".bright_blue().bold());
    println!("   Scanning: {}", cli.path.display().to_string().yellow());
    println!();

    let start = Instant::now();

    // Count files first
    println!("{}", "📊 Counting files...".cyan());
    let file_count = WalkDir::new(&cli.path)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if !cli.hidden {
                !is_hidden(e.path())
            } else {
                true
            }
        })
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .count();

    println!("   Found {} files", file_count);
    println!();

    // Index files
    println!("{}", "🔄 Indexing...".green());
    let pb = ProgressBar::new(file_count as u64);
    pb.set_style(ProgressStyle::default_bar()
        .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({per_sec})")?
        .progress_chars("#>-"));

    let mut files = Vec::new();
    let mut total_size = 0u64;
    let mut code_files = 0;

    for entry in WalkDir::new(&cli.path)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if !cli.hidden {
                !is_hidden(e.path())
            } else {
                true
            }
        })
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let metadata = match fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let size = metadata.len();
        let extension = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string();

        let is_code = is_code_file(&extension);

        if is_code {
            code_files += 1;
        }

        files.push(FileEntry {
            path: path.display().to_string(),
            size,
            extension,
            is_code,
        });

        total_size += size;
        pb.inc(1);
    }

    pb.finish_and_clear();

    let elapsed = start.elapsed();

    // Create index
    let index = WorkspaceIndex {
        root: cli.path.display().to_string(),
        total_files: files.len(),
        total_size,
        code_files,
        files,
        indexed_at: chrono::Local::now().to_rfc3339(),
    };

    // Save to file
    println!("{}", "💾 Saving index...".cyan());
    let json = serde_json::to_string_pretty(&index)?;
    fs::write(&cli.output, json)?;

    let index_size = fs::metadata(&cli.output)?.len();

    // Print stats
    println!();
    println!("{}", "📊 Indexing Complete!".bright_green().bold());
    println!();
    println!("   {} Total files: {}", "📁".cyan(), index.total_files);
    println!("   {} Code files: {} ({:.1}%)",
        "💻".yellow(),
        code_files,
        (code_files as f64 / index.total_files as f64) * 100.0
    );
    println!("   {} Total size: {}", "📊".blue(), format_bytes(total_size as usize));
    println!("   {} Index size: {}", "💾".green(), format_bytes(index_size as usize));
    println!("   {} Time: {:.2?}", "⏱️ ", elapsed);
    println!("   {} Speed: {:.0} files/sec",
        "⚡".yellow(),
        index.total_files as f64 / elapsed.as_secs_f64()
    );
    println!();
    println!("   Index saved to: {}", cli.output.display().to_string().green());

    // Top 5 extensions
    let mut ext_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for file in &index.files {
        *ext_counts.entry(file.extension.clone()).or_insert(0) += 1;
    }

    let mut ext_vec: Vec<_> = ext_counts.iter().collect();
    ext_vec.sort_by(|a, b| b.1.cmp(a.1));

    println!();
    println!("{}", "🏆 Top Extensions:".cyan());
    for (i, (ext, count)) in ext_vec.iter().take(5).enumerate() {
        let ext_display = if ext.is_empty() { "(no extension)" } else { ext };
        println!("   {}. {}: {} files", i + 1, ext_display.yellow(), count);
    }

    Ok(())
}

fn is_hidden(path: &Path) -> bool {
    path.components()
        .any(|c| {
            c.as_os_str()
                .to_str()
                .map(|s| s.starts_with('.') || s == "target" || s == "node_modules")
                .unwrap_or(false)
        })
}

fn is_code_file(ext: &str) -> bool {
    matches!(
        ext,
        "rs" | "py" | "js" | "ts" | "tsx" | "jsx" |
        "c" | "cpp" | "h" | "hpp" | "go" | "java" |
        "cs" | "rb" | "php" | "swift" | "kt" | "scala" |
        "html" | "css" | "scss" | "sass" | "vue" | "svelte"
    )
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

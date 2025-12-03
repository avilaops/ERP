//! Exemplo de uso do avila-error com derive e context
//!
//! Demonstra como substituir thiserror e anyhow

use avila_error::{Error as AvilaError, ErrorKind, Result};

#[cfg(feature = "derive")]
use avila_error::ErrorDerive as Error;

#[cfg(feature = "context")]
use avila_error::Context;

// ============================================================================
// Exemplo 1: Enum de erro com #[derive(Error)] - substitui thiserror
// ============================================================================

#[cfg(feature = "derive")]
#[derive(Debug, Error)]
pub enum MyError {
    #[error("IO error occurred")]
    #[from]
    Io(std::io::Error),

    #[error("Parse error: invalid format")]
    Parse,

    #[error("Network error")]
    #[from]
    Network(std::fmt::Error),

    #[error("Custom error: {0}")]
    Custom(String),
}

// ============================================================================
// Exemplo 2: Context trait - substitui anyhow
// ============================================================================

#[cfg(feature = "context")]
fn read_config_file(path: &str) -> Result<String> {
    std::fs::read_to_string(path)
        .context(format!("Failed to read config file: {}", path))?;

    Ok("config data".to_string())
}

#[cfg(feature = "context")]
fn parse_config(data: &str) -> Result<Config> {
    let config = parse_json(data)
        .with_context(|| format!("Failed to parse config data of length {}", data.len()))?;

    Ok(config)
}

#[cfg(feature = "context")]
fn parse_json(_data: &str) -> std::result::Result<Config, std::io::Error> {
    // Simulação de parsing
    Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "invalid json"))
}

#[derive(Debug)]
struct Config {
    name: String,
}

// ============================================================================
// Exemplo 3: Uso básico sem features
// ============================================================================

fn basic_error_handling() -> Result<()> {
    let value = Some(42);

    // Usando bail!
    if value.unwrap() < 0 {
        avila_error::bail!("Value must be positive");
    }

    // Usando ensure!
    avila_error::ensure!(value.is_some(), "Value must exist");

    Ok(())
}

fn main() {
    println!("=== Avila Error Examples ===\n");

    // Exemplo básico
    match basic_error_handling() {
        Ok(_) => println!("✅ Basic error handling: OK"),
        Err(e) => println!("❌ Error: {}", e),
    }

    // Exemplo com derive
    #[cfg(feature = "derive")]
    {
        let io_error = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let my_error: MyError = io_error.into();
        println!("\n✅ Derive example: {}", my_error);
    }

    // Exemplo com context
    #[cfg(feature = "context")]
    {
        match read_config_file("config.toml") {
            Ok(_) => println!("\n✅ Config loaded"),
            Err(e) => println!("\n❌ Context example: {}", e),
        }
    }

    println!("\n=== All examples completed ===");
}

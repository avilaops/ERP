//! Error types for AvilaDB

use thiserror::Error;

/// Result type alias for AvilaDB operations
pub type Result<T> = std::result::Result<T, AvilaError>;

/// Main error type for AvilaDB operations
#[derive(Error, Debug)]
pub enum AvilaError {
    /// Document validation errors
    #[error("Validation error: {0}")]
    Validation(String),

    /// Document not found
    #[error("Document not found: {0}")]
    NotFound(String),

    /// Storage errors
    #[error("Storage error: {0}")]
    Storage(String),

    /// Serialization/deserialization errors
    #[error("Serialization error: {0}")]
    Serialization(String),

    /// Compression errors
    #[error("Compression error: {0}")]
    Compression(String),

    /// Query errors
    #[error("Query error: {0}")]
    Query(String),

    /// Network errors
    #[error("Network error: {0}")]
    Network(String),

    /// Configuration errors
    #[error("Configuration error: {0}")]
    Config(String),

    /// Vector search errors
    #[error("Vector search error: {0}")]
    VectorSearch(String),

    /// Generic errors
    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<serde_json::Error> for AvilaError {
    fn from(err: serde_json::Error) -> Self {
        AvilaError::Serialization(err.to_string())
    }
}

impl From<bincode::Error> for AvilaError {
    fn from(err: bincode::Error) -> Self {
        AvilaError::Serialization(err.to_string())
    }
}

impl From<anyhow::Error> for AvilaError {
    fn from(err: anyhow::Error) -> Self {
        AvilaError::Internal(err.to_string())
    }
}

impl From<reqwest::header::InvalidHeaderValue> for AvilaError {
    fn from(err: reqwest::header::InvalidHeaderValue) -> Self {
        AvilaError::Network(format!("Invalid header value: {}", err))
    }
}

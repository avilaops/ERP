//! Error types for avila-compress

use std::fmt;

/// Result type for compression operations
pub type Result<T> = std::result::Result<T, Error>;

/// Compression/decompression errors
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// Input data is invalid or corrupted
    InvalidInput(String),

    /// Output buffer is too small
    OutputBufferTooSmall {
        required: usize,
        provided: usize,
    },

    /// Decompression failed due to corrupted data
    CorruptedData(String),

    /// Unsupported compression level or option
    UnsupportedOption(String),

    /// Input is too large to compress
    InputTooLarge {
        size: usize,
        max_size: usize,
    },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::InvalidInput(msg) => write!(f, "Invalid input: {}", msg),
            Error::OutputBufferTooSmall { required, provided } => {
                write!(
                    f,
                    "Output buffer too small: need {} bytes, got {}",
                    required, provided
                )
            }
            Error::CorruptedData(msg) => write!(f, "Corrupted data: {}", msg),
            Error::UnsupportedOption(msg) => write!(f, "Unsupported option: {}", msg),
            Error::InputTooLarge { size, max_size } => {
                write!(f, "Input too large: {} bytes (max: {})", size, max_size)
            }
        }
    }
}

impl std::error::Error for Error {}

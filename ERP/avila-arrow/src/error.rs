//! Error types for avila-arrow

use std::fmt;

/// Result type alias for avila-arrow operations
pub type Result<T> = std::result::Result<T, ArrowError>;

/// Error types for Arrow operations
#[derive(Debug)]
pub enum ArrowError {
    /// Invalid schema definition
    InvalidSchema {
        /// Error message
        message: String
    },

    /// Schema mismatch
    SchemaMismatch {
        /// Expected schema
        expected: String,
        /// Actual schema
        actual: String,
    },

    /// Invalid field access
    InvalidField {
        /// Field name
        name: String,
        /// Error message
        message: String,
    },

    /// Invalid data type
    InvalidDataType {
        /// Type name
        type_name: String,
        /// Error message
        message: String,
    },

    /// Array length mismatch
    ArrayLengthMismatch {
        /// Expected length
        expected: usize,
        /// Actual length
        actual: usize,
    },

    /// Out of bounds access
    OutOfBounds {
        /// Index
        index: usize,
        /// Array length
        length: usize,
    },

    /// Invalid quaternion
    InvalidQuaternion {
        /// Error message
        message: String
    },

    /// Invalid tensor
    InvalidTensor {
        /// Error message
        message: String
    },

    /// Computation error
    ComputationError {
        /// Error message
        message: String
    },

    /// Invalid data error
    InvalidData(String),

    /// Internal error
    Internal {
        /// Error message
        message: String
    },
}

impl fmt::Display for ArrowError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ArrowError::InvalidSchema { message } => {
                write!(f, "Invalid schema: {}", message)
            }
            ArrowError::SchemaMismatch { expected, actual } => {
                write!(f, "Schema mismatch: expected {}, got {}", expected, actual)
            }
            ArrowError::InvalidField { name, message } => {
                write!(f, "Invalid field '{}': {}", name, message)
            }
            ArrowError::InvalidDataType { type_name, message } => {
                write!(f, "Invalid data type '{}': {}", type_name, message)
            }
            ArrowError::ArrayLengthMismatch { expected, actual } => {
                write!(f, "Array length mismatch: expected {}, got {}", expected, actual)
            }
            ArrowError::OutOfBounds { index, length } => {
                write!(f, "Index {} out of bounds for array of length {}", index, length)
            }
            ArrowError::InvalidQuaternion { message } => {
                write!(f, "Invalid quaternion: {}", message)
            }
            ArrowError::InvalidTensor { message } => {
                write!(f, "Invalid tensor: {}", message)
            }
            ArrowError::ComputationError { message } => {
                write!(f, "Computation error: {}", message)
            }
            ArrowError::InvalidData(message) => {
                write!(f, "Invalid data: {}", message)
            }
            ArrowError::Internal { message } => {
                write!(f, "Internal error: {}", message)
            }
        }
    }
}

impl std::error::Error for ArrowError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = ArrowError::InvalidSchema {
            message: "empty schema".to_string(),
        };
        assert!(err.to_string().contains("Invalid schema"));
    }

    #[test]
    fn test_schema_mismatch() {
        let err = ArrowError::SchemaMismatch {
            expected: "Int64".to_string(),
            actual: "Float64".to_string(),
        };
        assert!(err.to_string().contains("mismatch"));
    }

    #[test]
    fn test_out_of_bounds() {
        let err = ArrowError::OutOfBounds {
            index: 10,
            length: 5,
        };
        assert!(err.to_string().contains("out of bounds"));
    }
}

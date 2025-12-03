//! Error types for avila-serialize

use std::fmt;

/// Result type for serialization operations
pub type Result<T> = std::result::Result<T, Error>;

/// Error type for serialization/deserialization operations
#[derive(Debug, Clone)]
pub enum Error {
    /// Generic error with message
    Message(String),

    /// Invalid UTF-8 sequence
    InvalidUtf8,

    /// Invalid type encountered
    InvalidType(String),

    /// Unexpected end of input
    UnexpectedEof,

    /// Invalid value
    InvalidValue(String),

    /// Invalid length
    InvalidLength,

    /// Duplicate field
    DuplicateField(String),

    /// Missing field
    MissingField(String),

    /// Unknown field
    UnknownField(String),

    /// IO error
    Io(String),

    /// Custom error
    Custom(String),
}

impl Error {
    /// Create a custom error
    pub fn custom<T: fmt::Display>(msg: T) -> Self {
        Error::Custom(msg.to_string())
    }

    /// Create a message error
    pub fn message<T: fmt::Display>(msg: T) -> Self {
        Error::Message(msg.to_string())
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Message(msg) => write!(f, "{}", msg),
            Error::InvalidUtf8 => write!(f, "invalid UTF-8 sequence"),
            Error::InvalidType(ty) => write!(f, "invalid type: {}", ty),
            Error::UnexpectedEof => write!(f, "unexpected end of input"),
            Error::InvalidValue(val) => write!(f, "invalid value: {}", val),
            Error::InvalidLength => write!(f, "invalid length"),
            Error::DuplicateField(field) => write!(f, "duplicate field: {}", field),
            Error::MissingField(field) => write!(f, "missing field: {}", field),
            Error::UnknownField(field) => write!(f, "unknown field: {}", field),
            Error::Io(msg) => write!(f, "IO error: {}", msg),
            Error::Custom(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for Error {}

impl From<std::io::Error> for Error {
    fn from(err: std::io::Error) -> Self {
        Error::Io(err.to_string())
    }
}

impl From<std::string::FromUtf8Error> for Error {
    fn from(_: std::string::FromUtf8Error) -> Self {
        Error::InvalidUtf8
    }
}

impl From<std::str::Utf8Error> for Error {
    fn from(_: std::str::Utf8Error) -> Self {
        Error::InvalidUtf8
    }
}

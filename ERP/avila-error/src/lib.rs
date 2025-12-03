//! Avila Error - AVL Platform error handling
//! Replacement for anyhow/thiserror - 100% Rust std
//!
//! # Features
//! - `derive`: Enable #[derive(Error)] macro
//! - `context`: Enable Context trait for anyhow-style error handling
//! - `full`: Enable all features

#[cfg(feature = "derive")]
pub use avila_error_derive::Error as ErrorDerive;

use std::fmt;
use std::error::Error as StdError;

/// Generic error type for AVL Platform
#[derive(Debug)]
pub struct Error {
    kind: ErrorKind,
    message: String,
    source: Option<Box<dyn StdError + Send + Sync>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
    Io,
    Parse,
    Network,
    Database,
    Auth,
    NotFound,
    InvalidInput,
    InvalidState,
    Internal,
    Tls,
    Serialization,
    Other,
}

impl Error {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            source: None,
        }
    }

    pub fn with_source<E>(mut self, source: E) -> Self
    where
        E: StdError + Send + Sync + 'static,
    {
        self.source = Some(Box::new(source));
        self
    }

    pub fn kind(&self) -> ErrorKind {
        self.kind
    }

    // Convenience constructors
    pub fn io(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Io, message)
    }

    pub fn parse(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Parse, message)
    }

    pub fn network(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Network, message)
    }

    pub fn database(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Database, message)
    }

    pub fn auth(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Auth, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::NotFound, message)
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::InvalidInput, message)
    }

    pub fn invalid_state(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::InvalidState, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Internal, message)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)?;
        if let Some(ref source) = self.source {
            write!(f, ": {}", source)?;
        }
        Ok(())
    }
}

impl StdError for Error {
    fn source(&self) -> Option<&(dyn StdError + 'static)> {
        self.source
            .as_ref()
            .map(|e| e.as_ref() as &(dyn StdError + 'static))
    }
}

// Convert from std::io::Error
impl From<std::io::Error> for Error {
    fn from(err: std::io::Error) -> Self {
        Error::io(err.to_string()).with_source(err)
    }
}

// Convert from String
impl From<String> for Error {
    fn from(msg: String) -> Self {
        Error::new(ErrorKind::Other, msg)
    }
}

impl From<&str> for Error {
    fn from(msg: &str) -> Self {
        Error::new(ErrorKind::Other, msg)
    }
}

/// Result type using our Error
pub type Result<T> = std::result::Result<T, Error>;

/// Macro para criar erros facilmente (similar ao anyhow!)
#[macro_export]
macro_rules! bail {
    ($msg:expr) => {
        return Err($crate::Error::new($crate::ErrorKind::Other, $msg))
    };
    ($kind:expr, $msg:expr) => {
        return Err($crate::Error::new($kind, $msg))
    };
}

/// Macro para garantir condições (similar ao ensure!)
#[macro_export]
macro_rules! ensure {
    ($cond:expr, $msg:expr) => {
        if !$cond {
            $crate::bail!($msg);
        }
    };
}

// ============================================================================
// Context trait (feature = "context") - anyhow-style error handling
// ============================================================================

#[cfg(feature = "context")]
pub trait Context<T, E> {
    /// Adiciona contexto ao erro
    fn context<C>(self, context: C) -> Result<T>
    where
        C: fmt::Display + Send + Sync + 'static;

    /// Adiciona contexto lazy ao erro
    fn with_context<C, F>(self, f: F) -> Result<T>
    where
        C: fmt::Display + Send + Sync + 'static,
        F: FnOnce() -> C;
}

#[cfg(feature = "context")]
impl<T, E> Context<T, E> for std::result::Result<T, E>
where
    E: StdError + Send + Sync + 'static,
{
    fn context<C>(self, context: C) -> Result<T>
    where
        C: fmt::Display + Send + Sync + 'static,
    {
        self.map_err(|error| {
            let mut err = Error::new(ErrorKind::Other, context.to_string());
            err.source = Some(Box::new(error));
            err
        })
    }

    fn with_context<C, F>(self, f: F) -> Result<T>
    where
        C: fmt::Display + Send + Sync + 'static,
        F: FnOnce() -> C,
    {
        self.map_err(|error| {
            let context = f();
            let mut err = Error::new(ErrorKind::Other, context.to_string());
            err.source = Some(Box::new(error));
            err
        })
    }
}

#[cfg(feature = "context")]
impl<T> Context<T, Error> for Option<T> {
    fn context<C>(self, context: C) -> Result<T>
    where
        C: fmt::Display + Send + Sync + 'static,
    {
        self.ok_or_else(|| Error::new(ErrorKind::NotFound, context.to_string()))
    }

    fn with_context<C, F>(self, f: F) -> Result<T>
    where
        C: fmt::Display + Send + Sync + 'static,
        F: FnOnce() -> C,
    {
        self.ok_or_else(|| {
            let context = f();
            Error::new(ErrorKind::NotFound, context.to_string())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_creation() {
        let err = Error::not_found("Item not found");
        assert_eq!(err.kind(), ErrorKind::NotFound);
        assert_eq!(err.to_string(), "Item not found");
    }

    #[test]
    fn test_error_with_source() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let err = Error::io("Failed to read file").with_source(io_err);
        assert!(err.source().is_some());
    }
}

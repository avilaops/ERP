//! Core error type for avila-errors

use std::fmt;

/// Generic error wrapper with rich context
#[derive(Debug)]
pub struct Error {
    kind: ErrorKind,
    context: Option<String>,
    source: Option<Box<dyn std::error::Error + Send + Sync + 'static>>,
}

#[derive(Debug)]
enum ErrorKind {
    Message(String),
    Custom,
}

impl Error {
    /// Create a new error with a message
    pub fn new<S: Into<String>>(message: S) -> Self {
        Self {
            kind: ErrorKind::Message(message.into()),
            context: None,
            source: None,
        }
    }

    /// Create an error from another error
    pub fn from_error<E>(error: E) -> Self
    where
        E: std::error::Error + Send + Sync + 'static,
    {
        Self {
            kind: ErrorKind::Custom,
            context: None,
            source: Some(Box::new(error)),
        }
    }

    /// Add context to this error
    pub fn with_context<S: Into<String>>(mut self, context: S) -> Self {
        self.context = Some(context.into());
        self
    }

    /// Get the error context
    pub fn context(&self) -> Option<&str> {
        self.context.as_deref()
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(context) = &self.context {
            write!(f, "{}: ", context)?;
        }

        match &self.kind {
            ErrorKind::Message(msg) => write!(f, "{}", msg)?,
            ErrorKind::Custom => {
                if let Some(source) = &self.source {
                    write!(f, "{}", source)?;
                }
            }
        }

        Ok(())
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.source
            .as_ref()
            .map(|e| e.as_ref() as &(dyn std::error::Error + 'static))
    }
}

impl From<String> for Error {
    fn from(msg: String) -> Self {
        Error::new(msg)
    }
}

impl From<&str> for Error {
    fn from(msg: &str) -> Self {
        Error::new(msg.to_string())
    }
}

impl From<std::io::Error> for Error {
    fn from(err: std::io::Error) -> Self {
        Error::from_error(err)
    }
}

impl From<std::fmt::Error> for Error {
    fn from(err: std::fmt::Error) -> Self {
        Error::from_error(err)
    }
}

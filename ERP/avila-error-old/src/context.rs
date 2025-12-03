//! Context utilities for error handling

use crate::Error;

/// Trait for adding context to Results
pub trait ResultExt<T> {
    /// Add context to an error
    fn context<C>(self, context: C) -> Result<T, Error>
    where
        C: Into<String>;
}

impl<T, E> ResultExt<T> for Result<T, E>
where
    E: std::error::Error + Send + Sync + 'static,
{
    fn context<C>(self, context: C) -> Result<T, Error>
    where
        C: Into<String>,
    {
        self.map_err(|e| Error::from_error(e).with_context(context))
    }
}

/// Trait for adding context (alternative name)
pub trait Context<T> {
    /// Add context to an error
    fn with_context<C>(self, context: C) -> Result<T, Error>
    where
        C: Into<String>;
}

impl<T, E> Context<T> for Result<T, E>
where
    E: std::error::Error + Send + Sync + 'static,
{
    fn with_context<C>(self, context: C) -> Result<T, Error>
    where
        C: Into<String>,
    {
        self.context(context)
    }
}

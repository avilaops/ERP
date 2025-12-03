//! Result type alias

use crate::Error;

/// Convenient Result type alias using avila-errors Error
pub type Result<T> = std::result::Result<T, Error>;

//! # avila-validate - Data Validation
//!
//! Constraint-based validation system.

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

use avila_error::{Error, ErrorKind, Result};

/// Validation trait
pub trait Validate {
    /// Validates the value
    fn validate(&self) -> Result<()>;
}

/// Range constraint
pub struct Range<T> {
    min: T,
    max: T,
}

impl<T: PartialOrd + Copy> Range<T> {
    /// Creates new range
    pub const fn new(min: T, max: T) -> Self {
        Self { min, max }
    }

    /// Checks if value is in range
    pub fn contains(&self, value: T) -> bool {
        value >= self.min && value <= self.max
    }

    /// Validates value
    pub fn validate(&self, value: T) -> Result<()> {
        if self.contains(value) {
            Ok(())
        } else {
            Err(Error::new(ErrorKind::InvalidInput, "Value out of range"))
        }
    }
}

/// Length constraint
pub struct Length {
    min: usize,
    max: usize,
}

impl Length {
    /// Creates new length constraint
    pub const fn new(min: usize, max: usize) -> Self {
        Self { min, max }
    }

    /// Validates length
    pub fn validate(&self, len: usize) -> Result<()> {
        if len >= self.min && len <= self.max {
            Ok(())
        } else {
            Err(Error::new(ErrorKind::InvalidInput, "Invalid length"))
        }
    }
}

/// Pattern constraint (simplified)
pub struct Pattern {
    allow_alpha: bool,
    allow_numeric: bool,
    allow_special: bool,
}

impl Pattern {
    /// Alphanumeric pattern
    pub const fn alphanumeric() -> Self {
        Self {
            allow_alpha: true,
            allow_numeric: true,
            allow_special: false,
        }
    }

    /// Alpha-only pattern
    pub const fn alpha() -> Self {
        Self {
            allow_alpha: true,
            allow_numeric: false,
            allow_special: false,
        }
    }

    /// Numeric-only pattern
    pub const fn numeric() -> Self {
        Self {
            allow_alpha: false,
            allow_numeric: true,
            allow_special: false,
        }
    }

    /// Validates string against pattern
    pub fn validate(&self, s: &str) -> Result<()> {
        for c in s.chars() {
            let valid = (self.allow_alpha && c.is_alphabetic())
                || (self.allow_numeric && c.is_numeric())
                || (self.allow_special && !c.is_alphanumeric());

            if !valid {
                return Err(Error::new(ErrorKind::InvalidInput, "Invalid character"));
            }
        }
        Ok(())
    }
}

/// Email validator (simplified)
pub struct EmailValidator;

impl EmailValidator {
    /// Creates new email validator
    pub const fn new() -> Self {
        Self
    }

    /// Validates email format
    pub fn validate(&self, email: &str) -> Result<()> {
        if email.contains('@') && email.contains('.') {
            Ok(())
        } else {
            Err(Error::new(ErrorKind::InvalidInput, "Invalid email"))
        }
    }
}

/// Prelude
pub mod prelude {
    pub use crate::{Validate, Range, Length, Pattern, EmailValidator};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_range_valid() {
        let range = Range::new(0, 100);
        assert!(range.validate(50).is_ok());
    }

    #[test]
    fn test_range_invalid() {
        let range = Range::new(0, 100);
        assert!(range.validate(150).is_err());
    }

    #[test]
    fn test_length_valid() {
        let length = Length::new(3, 10);
        assert!(length.validate(5).is_ok());
    }

    #[test]
    fn test_pattern_alphanumeric() {
        let pattern = Pattern::alphanumeric();
        assert!(pattern.validate("hello123").is_ok());
        assert!(pattern.validate("hello@123").is_err());
    }

    #[test]
    fn test_email() {
        let validator = EmailValidator::new();
        assert!(validator.validate("test@example.com").is_ok());
        assert!(validator.validate("invalid").is_err());
    }
}

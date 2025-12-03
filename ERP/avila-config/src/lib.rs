//! # avila-config - Configuration Management
//!
//! Simple and efficient configuration system.

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

extern crate alloc;
use alloc::{string::String, vec::Vec, collections::BTreeMap};
use avila_error::{Error, ErrorKind, Result};

/// Configuration value
#[derive(Debug, Clone, PartialEq)]
pub enum ConfigValue {
    /// String value
    String(String),
    /// Integer value
    Int(i64),
    /// Float value
    Float(f64),
    /// Boolean value
    Bool(bool),
    /// Array of values
    Array(Vec<ConfigValue>),
}

impl ConfigValue {
    /// Gets as string
    pub fn as_str(&self) -> Option<&str> {
        match self {
            ConfigValue::String(s) => Some(s),
            _ => None,
        }
    }

    /// Gets as integer
    pub fn as_int(&self) -> Option<i64> {
        match self {
            ConfigValue::Int(i) => Some(*i),
            _ => None,
        }
    }

    /// Gets as boolean
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            ConfigValue::Bool(b) => Some(*b),
            _ => None,
        }
    }
}

/// Configuration store
pub struct Config {
    data: BTreeMap<String, ConfigValue>,
}

impl Config {
    /// Creates new configuration
    pub fn new() -> Self {
        Self {
            data: BTreeMap::new(),
        }
    }

    /// Sets a value
    pub fn set(&mut self, key: impl Into<String>, value: ConfigValue) {
        self.data.insert(key.into(), value);
    }

    /// Gets a value
    pub fn get(&self, key: &str) -> Option<&ConfigValue> {
        self.data.get(key)
    }

    /// Gets string value
    pub fn get_string(&self, key: &str) -> Result<String> {
        self.get(key)
            .and_then(|v| v.as_str())
            .map(|s| s.into())
            .ok_or_else(|| Error::new(ErrorKind::NotFound, "Config key not found"))
    }

    /// Gets integer value
    pub fn get_int(&self, key: &str) -> Result<i64> {
        self.get(key)
            .and_then(|v| v.as_int())
            .ok_or_else(|| Error::new(ErrorKind::NotFound, "Config key not found"))
    }

    /// Gets boolean value
    pub fn get_bool(&self, key: &str) -> Result<bool> {
        self.get(key)
            .and_then(|v| v.as_bool())
            .ok_or_else(|| Error::new(ErrorKind::NotFound, "Config key not found"))
    }

    /// Gets value with default
    pub fn get_or(&self, key: &str, default: ConfigValue) -> ConfigValue {
        self.get(key).cloned().unwrap_or(default)
    }

    /// Checks if key exists
    pub fn contains(&self, key: &str) -> bool {
        self.data.contains_key(key)
    }

    /// Returns all keys
    pub fn keys(&self) -> impl Iterator<Item = &String> {
        self.data.keys()
    }
}

impl Default for Config {
    fn default() -> Self {
        Self::new()
    }
}

/// Prelude
pub mod prelude {
    pub use crate::{Config, ConfigValue};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config() {
        let mut cfg = Config::new();
        cfg.set("name", ConfigValue::String("Avila".into()));
        cfg.set("port", ConfigValue::Int(8080));
        cfg.set("debug", ConfigValue::Bool(true));

        assert_eq!(cfg.get_string("name").unwrap(), "Avila");
        assert_eq!(cfg.get_int("port").unwrap(), 8080);
        assert_eq!(cfg.get_bool("debug").unwrap(), true);
    }

    #[test]
    fn test_config_default() {
        let cfg = Config::new();
        let val = cfg.get_or("missing", ConfigValue::Int(42));
        assert_eq!(val.as_int(), Some(42));
    }
}

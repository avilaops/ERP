//! Document type and operations

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{error::{AvilaError, Result}, MAX_DOCUMENT_SIZE};

/// AvilaDB document with key-value fields
///
/// Documents are limited to 4 MB in size and are automatically
/// compressed before storage using `avila-compress`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,

    #[serde(flatten)]
    pub fields: HashMap<String, Value>,
}

impl Document {
    /// Create a new empty document
    pub fn new() -> Self {
        Self {
            id: None,
            fields: HashMap::new(),
        }
    }

    /// Set a field value (builder pattern)
    ///
    /// # Example
    ///
    /// ```
    /// use aviladb::Document;
    ///
    /// let doc = Document::new()
    ///     .set("userId", "user123")
    ///     .set("name", "João Silva")
    ///     .set("level", 42);
    /// ```
    pub fn set<K, V>(mut self, key: K, value: V) -> Self
    where
        K: Into<String>,
        V: Serialize,
    {
        let value_json = serde_json::to_value(value)
            .expect("Failed to serialize value");
        self.fields.insert(key.into(), value_json);
        self
    }

    /// Get a field value
    ///
    /// # Example
    ///
    /// ```
    /// # use aviladb::Document;
    /// # let doc = Document::new().set("level", 42);
    /// let level: i32 = doc.get("level").unwrap();
    /// assert_eq!(level, 42);
    /// ```
    pub fn get<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Result<T> {
        let value = self.fields.get(key)
            .ok_or_else(|| AvilaError::Internal(format!("Field not found: {}", key)))?;

        serde_json::from_value(value.clone())
            .map_err(AvilaError::from)
    }

    /// Get a field value as Option
    pub fn get_opt<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Option<T> {
        self.get(key).ok()
    }

    /// Check if document size is within limits
    pub fn validate(&self) -> Result<()> {
        let json = serde_json::to_vec(self)?;
        let size = json.len();

        if size > MAX_DOCUMENT_SIZE {
            return Err(AvilaError::Validation(format!("Document too large: {} bytes (max: {} bytes)", size, MAX_DOCUMENT_SIZE)));
        }

        Ok(())
    }

    /// Get document size in bytes
    pub fn size_bytes(&self) -> usize {
        serde_json::to_vec(self)
            .map(|v| v.len())
            .unwrap_or(0)
    }

    /// Convert to JSON string
    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string(self).map_err(AvilaError::from)
    }

    /// Parse from JSON string
    pub fn from_json(json: &str) -> Result<Self> {
        serde_json::from_str(json).map_err(AvilaError::from)
    }
}

impl Default for Document {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_document_builder() {
        let doc = Document::new()
            .set("userId", "user123")
            .set("name", "Test User")
            .set("level", 42);

        assert_eq!(doc.get::<String>("userId").unwrap(), "user123");
        assert_eq!(doc.get::<String>("name").unwrap(), "Test User");
        assert_eq!(doc.get::<i32>("level").unwrap(), 42);
    }

    #[test]
    fn test_document_size() {
        let doc = Document::new()
            .set("field", "value");

        let size = doc.size_bytes();
        assert!(size > 0);
        assert!(size < MAX_DOCUMENT_SIZE);
    }

    #[test]
    fn test_document_validate() {
        let doc = Document::new()
            .set("userId", "user123");

        assert!(doc.validate().is_ok());
    }

    #[test]
    fn test_document_too_large() {
        let mut doc = Document::new();
        // Create a 5 MB document (exceeds 4 MB limit)
        let large_data = vec![0u8; 5 * 1024 * 1024];
        doc = doc.set("data", large_data);

        let result = doc.validate();
        assert!(result.is_err());
    }

    #[test]
    fn test_document_json() {
        let doc = Document::new()
            .set("userId", "user123")
            .set("level", 42);

        let json = doc.to_json().unwrap();
        let parsed = Document::from_json(&json).unwrap();

        assert_eq!(parsed.get::<String>("userId").unwrap(), "user123");
        assert_eq!(parsed.get::<i32>("level").unwrap(), 42);
    }
}

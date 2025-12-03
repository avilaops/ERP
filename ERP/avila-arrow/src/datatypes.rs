//! Data types for avila-arrow

use std::fmt;

/// Arrow data type
#[derive(Debug, Clone, PartialEq)]
pub enum DataType {
    /// Boolean (true/false)
    Boolean,
    /// 8-bit signed integer
    Int8,
    /// 16-bit signed integer
    Int16,
    /// 32-bit signed integer
    Int32,
    /// 64-bit signed integer
    Int64,
    /// 8-bit unsigned integer
    UInt8,
    /// 16-bit unsigned integer
    UInt16,
    /// 32-bit unsigned integer
    UInt32,
    /// 64-bit unsigned integer
    UInt64,
    /// 32-bit floating point
    Float32,
    /// 64-bit floating point
    Float64,
    /// UTF-8 encoded string
    Utf8,
    /// Binary data
    Binary,
    /// Timestamp (microseconds since epoch)
    Timestamp,
    /// Quaternion (w, x, y, z) - 4D rotation
    Quaternion,
    /// Tensor4D (4x4 matrix) - Spacetime tensor
    Tensor4D,
    /// Complex number (real, imaginary)
    Complex64,
    /// Spinor (2 complex components) - Particle physics
    Spinor,
}

impl fmt::Display for DataType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DataType::Boolean => write!(f, "Boolean"),
            DataType::Int8 => write!(f, "Int8"),
            DataType::Int16 => write!(f, "Int16"),
            DataType::Int32 => write!(f, "Int32"),
            DataType::Int64 => write!(f, "Int64"),
            DataType::UInt8 => write!(f, "UInt8"),
            DataType::UInt16 => write!(f, "UInt16"),
            DataType::UInt32 => write!(f, "UInt32"),
            DataType::UInt64 => write!(f, "UInt64"),
            DataType::Float32 => write!(f, "Float32"),
            DataType::Float64 => write!(f, "Float64"),
            DataType::Utf8 => write!(f, "Utf8"),
            DataType::Binary => write!(f, "Binary"),
            DataType::Timestamp => write!(f, "Timestamp"),
            DataType::Quaternion => write!(f, "Quaternion"),
            DataType::Tensor4D => write!(f, "Tensor4D"),
            DataType::Complex64 => write!(f, "Complex64"),
            DataType::Spinor => write!(f, "Spinor"),
        }
    }
}

/// Field in a schema
#[derive(Debug, Clone, PartialEq)]
pub struct Field {
    name: String,
    data_type: DataType,
    nullable: bool,
}

impl Field {
    /// Create a new field
    pub fn new(name: impl Into<String>, data_type: DataType) -> Self {
        Self {
            name: name.into(),
            data_type,
            nullable: true,
        }
    }

    /// Create a non-nullable field
    pub fn new_non_nullable(name: impl Into<String>, data_type: DataType) -> Self {
        Self {
            name: name.into(),
            data_type,
            nullable: false,
        }
    }

    /// Get field name
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Get data type
    pub fn data_type(&self) -> &DataType {
        &self.data_type
    }

    /// Check if field is nullable
    pub fn is_nullable(&self) -> bool {
        self.nullable
    }
}

/// Schema defining structure of data
#[derive(Debug, Clone, PartialEq)]
pub struct Schema {
    fields: Vec<Field>,
}

impl Schema {
    /// Create a new schema
    pub fn new(fields: Vec<Field>) -> Self {
        Self { fields }
    }

    /// Get number of fields
    pub fn num_fields(&self) -> usize {
        self.fields.len()
    }

    /// Get field by index
    pub fn field(&self, index: usize) -> Option<&Field> {
        self.fields.get(index)
    }

    /// Get field by name
    pub fn field_by_name(&self, name: &str) -> Option<&Field> {
        self.fields.iter().find(|f| f.name() == name)
    }

    /// Get all fields
    pub fn fields(&self) -> &[Field] {
        &self.fields
    }

    /// Get field index by name
    pub fn index_of(&self, name: &str) -> Option<usize> {
        self.fields.iter().position(|f| f.name() == name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_field_creation() {
        let field = Field::new("id", DataType::Int64);
        assert_eq!(field.name(), "id");
        assert_eq!(field.data_type(), &DataType::Int64);
        assert!(field.is_nullable());
    }

    #[test]
    fn test_non_nullable_field() {
        let field = Field::new_non_nullable("id", DataType::Int64);
        assert!(!field.is_nullable());
    }

    #[test]
    fn test_schema_creation() {
        let schema = Schema::new(vec![
            Field::new("id", DataType::Int64),
            Field::new("value", DataType::Float64),
        ]);

        assert_eq!(schema.num_fields(), 2);
        assert_eq!(schema.field(0).unwrap().name(), "id");
        assert_eq!(schema.field(1).unwrap().name(), "value");
    }

    #[test]
    fn test_schema_field_by_name() {
        let schema = Schema::new(vec![
            Field::new("id", DataType::Int64),
            Field::new("value", DataType::Float64),
        ]);

        let field = schema.field_by_name("value").unwrap();
        assert_eq!(field.data_type(), &DataType::Float64);
    }

    #[test]
    fn test_schema_index_of() {
        let schema = Schema::new(vec![
            Field::new("id", DataType::Int64),
            Field::new("value", DataType::Float64),
        ]);

        assert_eq!(schema.index_of("id"), Some(0));
        assert_eq!(schema.index_of("value"), Some(1));
        assert_eq!(schema.index_of("unknown"), None);
    }

    #[test]
    fn test_datatype_display() {
        assert_eq!(DataType::Int64.to_string(), "Int64");
        assert_eq!(DataType::Quaternion.to_string(), "Quaternion");
        assert_eq!(DataType::Tensor4D.to_string(), "Tensor4D");
    }
}

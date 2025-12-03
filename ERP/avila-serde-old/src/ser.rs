//! Serialization traits and implementations

use crate::error::Result;
use std::collections::HashMap;

/// Trait for types that can be serialized
pub trait Serialize {
    /// Serialize this value into the given serializer
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()>;
}

/// Trait for serializers
pub trait Serializer {
    /// Serialize a boolean value
    fn serialize_bool(&mut self, value: bool) -> Result<()>;

    /// Serialize an i8 value
    fn serialize_i8(&mut self, value: i8) -> Result<()>;

    /// Serialize an i16 value
    fn serialize_i16(&mut self, value: i16) -> Result<()>;

    /// Serialize an i32 value
    fn serialize_i32(&mut self, value: i32) -> Result<()>;

    /// Serialize an i64 value
    fn serialize_i64(&mut self, value: i64) -> Result<()>;

    /// Serialize a u8 value
    fn serialize_u8(&mut self, value: u8) -> Result<()>;

    /// Serialize a u16 value
    fn serialize_u16(&mut self, value: u16) -> Result<()>;

    /// Serialize a u32 value
    fn serialize_u32(&mut self, value: u32) -> Result<()>;

    /// Serialize a u64 value
    fn serialize_u64(&mut self, value: u64) -> Result<()>;

    /// Serialize an f32 value
    fn serialize_f32(&mut self, value: f32) -> Result<()>;

    /// Serialize an f64 value
    fn serialize_f64(&mut self, value: f64) -> Result<()>;

    /// Serialize a string
    fn serialize_str(&mut self, value: &str) -> Result<()>;

    /// Serialize bytes
    fn serialize_bytes(&mut self, value: &[u8]) -> Result<()>;

    /// Serialize None
    fn serialize_none(&mut self) -> Result<()>;

    /// Serialize Some value
    fn serialize_some<T: Serialize>(&mut self, value: &T) -> Result<()>;

    /// Begin serializing a sequence
    fn begin_seq(&mut self, len: Option<usize>) -> Result<()>;

    /// Serialize a sequence element
    fn serialize_element<T: Serialize>(&mut self, value: &T) -> Result<()>;

    /// End serializing a sequence
    fn end_seq(&mut self) -> Result<()>;

    /// Begin serializing a map/object
    fn begin_map(&mut self, len: Option<usize>) -> Result<()>;

    /// Serialize a map key
    fn serialize_key<T: Serialize>(&mut self, key: &T) -> Result<()>;

    /// Serialize a map value
    fn serialize_value<T: Serialize>(&mut self, value: &T) -> Result<()>;

    /// End serializing a map
    fn end_map(&mut self) -> Result<()>;
}

// Implement Serialize for common types

impl Serialize for bool {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.serialize_bool(*self)
    }
}

impl Serialize for i8 {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.serialize_i8(*self)
    }
}

impl Serialize for i16 {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.serialize_i16(*self)
    }
}

impl Serialize for i32 {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.serialize_i32(*self)
    }
}

impl Serialize for i64 {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.serialize_i64(*self)
    }
}

impl Serialize for u8 {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.serialize_u8(*self)
    }
}

impl Serialize for u16 {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.serialize_u16(*self)
    }
}

impl Serialize for u32 {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.serialize_u32(*self)
    }
}

impl Serialize for u64 {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.serialize_u64(*self)
    }
}

impl Serialize for f32 {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.serialize_f32(*self)
    }
}

impl Serialize for f64 {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.serialize_f64(*self)
    }
}

impl Serialize for String {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.serialize_str(self)
    }
}

impl Serialize for &str {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.serialize_str(self)
    }
}

impl<T: Serialize> Serialize for Option<T> {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        match self {
            None => serializer.serialize_none(),
            Some(value) => serializer.serialize_some(value),
        }
    }
}

impl<T: Serialize> Serialize for Vec<T> {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.begin_seq(Some(self.len()))?;
        for item in self {
            serializer.serialize_element(item)?;
        }
        serializer.end_seq()
    }
}

impl<T: Serialize> Serialize for &[T] {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.begin_seq(Some(self.len()))?;
        for item in *self {
            serializer.serialize_element(item)?;
        }
        serializer.end_seq()
    }
}

impl<K: Serialize, V: Serialize> Serialize for HashMap<K, V> {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.begin_map(Some(self.len()))?;
        for (key, value) in self {
            serializer.serialize_key(key)?;
            serializer.serialize_value(value)?;
        }
        serializer.end_map()
    }
}

// Array implementations
impl<T: Serialize, const N: usize> Serialize for [T; N] {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.begin_seq(Some(N))?;
        for item in self {
            serializer.serialize_element(item)?;
        }
        serializer.end_seq()
    }
}

// Tuple implementations
impl<T0: Serialize, T1: Serialize> Serialize for (T0, T1) {
    fn serialize<S: Serializer>(&self, serializer: &mut S) -> Result<()> {
        serializer.begin_seq(Some(2))?;
        serializer.serialize_element(&self.0)?;
        serializer.serialize_element(&self.1)?;
        serializer.end_seq()
    }
}

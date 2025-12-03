//! Deserialization traits and implementations

use crate::error::Result;

/// Trait for types that can be deserialized
pub trait Deserialize: Sized {
    /// Deserialize this value from the given deserializer
    fn deserialize<D: Deserializer>(deserializer: &mut D) -> Result<Self>;
}

/// Trait for deserializers
pub trait Deserializer {
    /// Deserialize a boolean value
    fn deserialize_bool(&mut self) -> Result<bool>;

    /// Deserialize an i8 value
    fn deserialize_i8(&mut self) -> Result<i8>;

    /// Deserialize an i16 value
    fn deserialize_i16(&mut self) -> Result<i16>;

    /// Deserialize an i32 value
    fn deserialize_i32(&mut self) -> Result<i32>;

    /// Deserialize an i64 value
    fn deserialize_i64(&mut self) -> Result<i64>;

    /// Deserialize a u8 value
    fn deserialize_u8(&mut self) -> Result<u8>;

    /// Deserialize a u16 value
    fn deserialize_u16(&mut self) -> Result<u16>;

    /// Deserialize a u32 value
    fn deserialize_u32(&mut self) -> Result<u32>;

    /// Deserialize a u64 value
    fn deserialize_u64(&mut self) -> Result<u64>;

    /// Deserialize an f32 value
    fn deserialize_f32(&mut self) -> Result<f32>;

    /// Deserialize an f64 value
    fn deserialize_f64(&mut self) -> Result<f64>;

    /// Deserialize a string
    fn deserialize_string(&mut self) -> Result<String>;

    /// Deserialize bytes
    fn deserialize_bytes(&mut self) -> Result<Vec<u8>>;

    /// Deserialize an Option
    fn deserialize_option<T: Deserialize>(&mut self) -> Result<Option<T>>;

    /// Begin deserializing a sequence
    fn begin_seq(&mut self) -> Result<usize>;

    /// Deserialize next sequence element
    fn deserialize_seq_element<T: Deserialize>(&mut self) -> Result<Option<T>>;

    /// End deserializing a sequence
    fn end_seq(&mut self) -> Result<()>;

    /// Begin deserializing a map
    fn begin_map(&mut self) -> Result<usize>;

    /// Deserialize next map key
    fn deserialize_map_key<T: Deserialize>(&mut self) -> Result<Option<T>>;

    /// Deserialize next map value
    fn deserialize_map_value<T: Deserialize>(&mut self) -> Result<T>;

    /// End deserializing a map
    fn end_map(&mut self) -> Result<()>;
}

// Implement Deserialize for common types

impl Deserialize for bool {
    fn deserialize<D: Deserializer>(deserializer: &mut D) -> Result<Self> {
        deserializer.deserialize_bool()
    }
}

impl Deserialize for i8 {
    fn deserialize<D: Deserializer>(deserializer: &mut D) -> Result<Self> {
        deserializer.deserialize_i8()
    }
}

impl Deserialize for i16 {
    fn deserialize<D: Deserializer>(deserializer: &mut D) -> Result<Self> {
        deserializer.deserialize_i16()
    }
}

impl Deserialize for i32 {
    fn deserialize<D: Deserializer>(deserializer: &mut D) -> Result<Self> {
        deserializer.deserialize_i32()
    }
}

impl Deserialize for i64 {
    fn deserialize<D: Deserializer>(deserializer: &mut D) -> Result<Self> {
        deserializer.deserialize_i64()
    }
}

impl Deserialize for u8 {
    fn deserialize<D: Deserializer>(deserializer: &mut D) -> Result<Self> {
        deserializer.deserialize_u8()
    }
}

impl Deserialize for u16 {
    fn deserialize<D: Deserializer>(deserializer: &mut D) -> Result<Self> {
        deserializer.deserialize_u16()
    }
}

impl Deserialize for u32 {
    fn deserialize<D: Deserializer>(deserializer: &mut D) -> Result<Self> {
        deserializer.deserialize_u32()
    }
}

impl Deserialize for u64 {
    fn deserialize<D: Deserializer>(deserializer: &mut D) -> Result<Self> {
        deserializer.deserialize_u64()
    }
}

impl Deserialize for f32 {
    fn deserialize<D: Deserializer>(deserializer: &mut D) -> Result<Self> {
        deserializer.deserialize_f32()
    }
}

impl Deserialize for f64 {
    fn deserialize<D: Deserializer>(deserializer: &mut D) -> Result<Self> {
        deserializer.deserialize_f64()
    }
}

impl Deserialize for String {
    fn deserialize<D: Deserializer>(deserializer: &mut D) -> Result<Self> {
        deserializer.deserialize_string()
    }
}

impl<T: Deserialize> Deserialize for Option<T> {
    fn deserialize<D: Deserializer>(deserializer: &mut D) -> Result<Self> {
        deserializer.deserialize_option()
    }
}

impl<T: Deserialize> Deserialize for Vec<T> {
    fn deserialize<D: Deserializer>(deserializer: &mut D) -> Result<Self> {
        let len = deserializer.begin_seq()?;
        let mut vec = Vec::with_capacity(len);

        while let Some(item) = deserializer.deserialize_seq_element()? {
            vec.push(item);
        }

        deserializer.end_seq()?;
        Ok(vec)
    }
}

//! Array types for columnar storage

use crate::error::{ArrowError, Result};
use crate::datatypes::DataType;
use std::any::Any;

/// Trait for all array types
pub trait Array: Send + Sync {
    /// Get the data type of the array
    fn data_type(&self) -> &DataType;

    /// Get the number of elements in the array
    fn len(&self) -> usize;

    /// Check if the array is empty
    fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Convert to Any for downcasting
    fn as_any(&self) -> &dyn Any;
}

// ==================== INTEGER ARRAYS ====================

/// 8-bit signed integer array
#[derive(Debug, Clone)]
pub struct Int8Array {
    data: Vec<i8>,
    data_type: DataType,
}

impl Int8Array {
    pub fn new(data: Vec<i8>) -> Self {
        Self { data, data_type: DataType::Int8 }
    }

    pub fn value(&self, index: usize) -> Result<i8> {
        self.data.get(index).copied().ok_or_else(|| ArrowError::OutOfBounds {
            index, length: self.data.len(),
        })
    }

    pub fn values(&self) -> &[i8] { &self.data }
}

impl From<Vec<i8>> for Int8Array {
    fn from(data: Vec<i8>) -> Self { Self::new(data) }
}

impl Array for Int8Array {
    fn data_type(&self) -> &DataType { &self.data_type }
    fn len(&self) -> usize { self.data.len() }
    fn as_any(&self) -> &dyn Any { self }
}

/// 16-bit signed integer array
#[derive(Debug, Clone)]
pub struct Int16Array {
    data: Vec<i16>,
    data_type: DataType,
}

impl Int16Array {
    pub fn new(data: Vec<i16>) -> Self {
        Self { data, data_type: DataType::Int16 }
    }

    pub fn value(&self, index: usize) -> Result<i16> {
        self.data.get(index).copied().ok_or_else(|| ArrowError::OutOfBounds {
            index, length: self.data.len(),
        })
    }

    pub fn values(&self) -> &[i16] { &self.data }
}

impl From<Vec<i16>> for Int16Array {
    fn from(data: Vec<i16>) -> Self { Self::new(data) }
}

impl Array for Int16Array {
    fn data_type(&self) -> &DataType { &self.data_type }
    fn len(&self) -> usize { self.data.len() }
    fn as_any(&self) -> &dyn Any { self }
}

/// 32-bit signed integer array
#[derive(Debug, Clone)]
pub struct Int32Array {
    data: Vec<i32>,
    data_type: DataType,
}

impl Int32Array {
    pub fn new(data: Vec<i32>) -> Self {
        Self { data, data_type: DataType::Int32 }
    }

    pub fn value(&self, index: usize) -> Result<i32> {
        self.data.get(index).copied().ok_or_else(|| ArrowError::OutOfBounds {
            index, length: self.data.len(),
        })
    }

    pub fn values(&self) -> &[i32] { &self.data }
}

impl From<Vec<i32>> for Int32Array {
    fn from(data: Vec<i32>) -> Self { Self::new(data) }
}

impl Array for Int32Array {
    fn data_type(&self) -> &DataType { &self.data_type }
    fn len(&self) -> usize { self.data.len() }
    fn as_any(&self) -> &dyn Any { self }
}

/// 64-bit signed integer array
#[derive(Debug, Clone)]
pub struct Int64Array {
    data: Vec<i64>,
    data_type: DataType,
}

impl Int64Array {
    /// Create new Int64Array
    pub fn new(data: Vec<i64>) -> Self {
        Self {
            data,
            data_type: DataType::Int64,
        }
    }

    /// Get value at index
    pub fn value(&self, index: usize) -> Result<i64> {
        self.data.get(index).copied().ok_or_else(|| ArrowError::OutOfBounds {
            index,
            length: self.data.len(),
        })
    }

    /// Get all values
    pub fn values(&self) -> &[i64] {
        &self.data
    }
}

impl From<Vec<i64>> for Int64Array {
    fn from(data: Vec<i64>) -> Self {
        Self::new(data)
    }
}

impl Array for Int64Array {
    fn data_type(&self) -> &DataType {
        &self.data_type
    }

    fn len(&self) -> usize {
        self.data.len()
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

/// 64-bit floating point array
#[derive(Debug, Clone)]
pub struct Float64Array {
    data: Vec<f64>,
    data_type: DataType,
}

impl Float64Array {
    /// Create new Float64Array
    pub fn new(data: Vec<f64>) -> Self {
        Self {
            data,
            data_type: DataType::Float64,
        }
    }

    /// Get value at index
    pub fn value(&self, index: usize) -> Result<f64> {
        self.data.get(index).copied().ok_or_else(|| ArrowError::OutOfBounds {
            index,
            length: self.data.len(),
        })
    }

    /// Get all values
    pub fn values(&self) -> &[f64] {
        &self.data
    }
}

impl From<Vec<f64>> for Float64Array {
    fn from(data: Vec<f64>) -> Self {
        Self::new(data)
    }
}

impl Array for Float64Array {
    fn data_type(&self) -> &DataType {
        &self.data_type
    }

    fn len(&self) -> usize {
        self.data.len()
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

// ==================== UNSIGNED INTEGER ARRAYS ====================

/// 8-bit unsigned integer array
#[derive(Debug, Clone)]
pub struct UInt8Array {
    data: Vec<u8>,
    data_type: DataType,
}

impl UInt8Array {
    pub fn new(data: Vec<u8>) -> Self {
        Self { data, data_type: DataType::UInt8 }
    }

    pub fn value(&self, index: usize) -> Result<u8> {
        self.data.get(index).copied().ok_or_else(|| ArrowError::OutOfBounds {
            index, length: self.data.len(),
        })
    }

    pub fn values(&self) -> &[u8] { &self.data }
}

impl From<Vec<u8>> for UInt8Array {
    fn from(data: Vec<u8>) -> Self { Self::new(data) }
}

impl Array for UInt8Array {
    fn data_type(&self) -> &DataType { &self.data_type }
    fn len(&self) -> usize { self.data.len() }
    fn as_any(&self) -> &dyn Any { self }
}

/// 16-bit unsigned integer array
#[derive(Debug, Clone)]
pub struct UInt16Array {
    data: Vec<u16>,
    data_type: DataType,
}

impl UInt16Array {
    pub fn new(data: Vec<u16>) -> Self {
        Self { data, data_type: DataType::UInt16 }
    }

    pub fn value(&self, index: usize) -> Result<u16> {
        self.data.get(index).copied().ok_or_else(|| ArrowError::OutOfBounds {
            index, length: self.data.len(),
        })
    }

    pub fn values(&self) -> &[u16] { &self.data }
}

impl From<Vec<u16>> for UInt16Array {
    fn from(data: Vec<u16>) -> Self { Self::new(data) }
}

impl Array for UInt16Array {
    fn data_type(&self) -> &DataType { &self.data_type }
    fn len(&self) -> usize { self.data.len() }
    fn as_any(&self) -> &dyn Any { self }
}

/// 32-bit unsigned integer array
#[derive(Debug, Clone)]
pub struct UInt32Array {
    data: Vec<u32>,
    data_type: DataType,
}

impl UInt32Array {
    pub fn new(data: Vec<u32>) -> Self {
        Self { data, data_type: DataType::UInt32 }
    }

    pub fn value(&self, index: usize) -> Result<u32> {
        self.data.get(index).copied().ok_or_else(|| ArrowError::OutOfBounds {
            index, length: self.data.len(),
        })
    }

    pub fn values(&self) -> &[u32] { &self.data }
}

impl From<Vec<u32>> for UInt32Array {
    fn from(data: Vec<u32>) -> Self { Self::new(data) }
}

impl Array for UInt32Array {
    fn data_type(&self) -> &DataType { &self.data_type }
    fn len(&self) -> usize { self.data.len() }
    fn as_any(&self) -> &dyn Any { self }
}

/// 64-bit unsigned integer array
#[derive(Debug, Clone)]
pub struct UInt64Array {
    data: Vec<u64>,
    data_type: DataType,
}

impl UInt64Array {
    pub fn new(data: Vec<u64>) -> Self {
        Self { data, data_type: DataType::UInt64 }
    }

    pub fn value(&self, index: usize) -> Result<u64> {
        self.data.get(index).copied().ok_or_else(|| ArrowError::OutOfBounds {
            index, length: self.data.len(),
        })
    }

    pub fn values(&self) -> &[u64] { &self.data }
}

impl From<Vec<u64>> for UInt64Array {
    fn from(data: Vec<u64>) -> Self { Self::new(data) }
}

impl Array for UInt64Array {
    fn data_type(&self) -> &DataType { &self.data_type }
    fn len(&self) -> usize { self.data.len() }
    fn as_any(&self) -> &dyn Any { self }
}

// ==================== FLOATING POINT ARRAYS ====================

/// 32-bit floating point array
#[derive(Debug, Clone)]
pub struct Float32Array {
    data: Vec<f32>,
    data_type: DataType,
}

impl Float32Array {
    pub fn new(data: Vec<f32>) -> Self {
        Self { data, data_type: DataType::Float32 }
    }

    pub fn value(&self, index: usize) -> Result<f32> {
        self.data.get(index).copied().ok_or_else(|| ArrowError::OutOfBounds {
            index, length: self.data.len(),
        })
    }

    pub fn values(&self) -> &[f32] { &self.data }
}

impl From<Vec<f32>> for Float32Array {
    fn from(data: Vec<f32>) -> Self { Self::new(data) }
}

impl Array for Float32Array {
    fn data_type(&self) -> &DataType { &self.data_type }
    fn len(&self) -> usize { self.data.len() }
    fn as_any(&self) -> &dyn Any { self }
}

// ==================== OTHER ARRAYS ====================

/// UTF-8 string array
#[derive(Debug, Clone)]
pub struct Utf8Array {
    data: Vec<String>,
    data_type: DataType,
}

impl Utf8Array {
    /// Create new Utf8Array
    pub fn new(data: Vec<String>) -> Self {
        Self {
            data,
            data_type: DataType::Utf8,
        }
    }

    /// Get value at index
    pub fn value(&self, index: usize) -> Result<&str> {
        self.data.get(index).map(|s| s.as_str()).ok_or_else(|| ArrowError::OutOfBounds {
            index,
            length: self.data.len(),
        })
    }

    /// Get all values
    pub fn values(&self) -> &[String] {
        &self.data
    }
}

impl From<Vec<String>> for Utf8Array {
    fn from(data: Vec<String>) -> Self {
        Self::new(data)
    }
}

impl From<Vec<&str>> for Utf8Array {
    fn from(data: Vec<&str>) -> Self {
        Self::new(data.iter().map(|s| s.to_string()).collect())
    }
}

impl Array for Utf8Array {
    fn data_type(&self) -> &DataType {
        &self.data_type
    }

    fn len(&self) -> usize {
        self.data.len()
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

/// Boolean array
#[derive(Debug, Clone)]
pub struct BooleanArray {
    data: Vec<bool>,
    data_type: DataType,
}

impl BooleanArray {
    /// Create new BooleanArray
    pub fn new(data: Vec<bool>) -> Self {
        Self {
            data,
            data_type: DataType::Boolean,
        }
    }

    /// Get value at index
    pub fn value(&self, index: usize) -> Result<bool> {
        self.data.get(index).copied().ok_or_else(|| ArrowError::OutOfBounds {
            index,
            length: self.data.len(),
        })
    }

    /// Get all values
    pub fn values(&self) -> &[bool] {
        &self.data
    }
}

impl From<Vec<bool>> for BooleanArray {
    fn from(data: Vec<bool>) -> Self {
        Self::new(data)
    }
}

impl Array for BooleanArray {
    fn data_type(&self) -> &DataType {
        &self.data_type
    }

    fn len(&self) -> usize {
        self.data.len()
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_int8_array() {
        let array = Int8Array::from(vec![-128, 0, 127]);
        assert_eq!(array.len(), 3);
        assert_eq!(array.value(0).unwrap(), -128);
        assert_eq!(array.value(2).unwrap(), 127);
    }

    #[test]
    fn test_int16_array() {
        let array = Int16Array::from(vec![-32768, 0, 32767]);
        assert_eq!(array.len(), 3);
        assert_eq!(array.value(0).unwrap(), -32768);
        assert_eq!(array.value(2).unwrap(), 32767);
    }

    #[test]
    fn test_int32_array() {
        let array = Int32Array::from(vec![i32::MIN, 0, i32::MAX]);
        assert_eq!(array.len(), 3);
        assert_eq!(array.value(0).unwrap(), i32::MIN);
        assert_eq!(array.value(2).unwrap(), i32::MAX);
    }

    #[test]
    fn test_int64_array() {
        let array = Int64Array::from(vec![1, 2, 3, 4, 5]);
        assert_eq!(array.len(), 5);
        assert_eq!(array.value(0).unwrap(), 1);
        assert_eq!(array.value(4).unwrap(), 5);
        assert!(array.value(5).is_err());
    }

    #[test]
    fn test_uint8_array() {
        let array = UInt8Array::from(vec![0, 128, 255]);
        assert_eq!(array.len(), 3);
        assert_eq!(array.value(0).unwrap(), 0);
        assert_eq!(array.value(2).unwrap(), 255);
    }

    #[test]
    fn test_uint16_array() {
        let array = UInt16Array::from(vec![0, 32768, 65535]);
        assert_eq!(array.len(), 3);
        assert_eq!(array.value(1).unwrap(), 32768);
        assert_eq!(array.value(2).unwrap(), 65535);
    }

    #[test]
    fn test_uint32_array() {
        let array = UInt32Array::from(vec![0, u32::MAX / 2, u32::MAX]);
        assert_eq!(array.len(), 3);
        assert_eq!(array.value(2).unwrap(), u32::MAX);
    }

    #[test]
    fn test_uint64_array() {
        let array = UInt64Array::from(vec![0, u64::MAX / 2, u64::MAX]);
        assert_eq!(array.len(), 3);
        assert_eq!(array.value(2).unwrap(), u64::MAX);
    }

    #[test]
    fn test_float32_array() {
        let array = Float32Array::from(vec![1.1, 2.2, 3.3]);
        assert_eq!(array.len(), 3);
        assert!((array.value(0).unwrap() - 1.1).abs() < 1e-6);
        assert!((array.value(2).unwrap() - 3.3).abs() < 1e-6);
    }

    #[test]
    fn test_float64_array() {
        let array = Float64Array::from(vec![1.1, 2.2, 3.3]);
        assert_eq!(array.len(), 3);
        assert_eq!(array.value(0).unwrap(), 1.1);
        assert_eq!(array.value(2).unwrap(), 3.3);
    }

    #[test]
    fn test_utf8_array() {
        let array = Utf8Array::from(vec!["hello", "world"]);
        assert_eq!(array.len(), 2);
        assert_eq!(array.value(0).unwrap(), "hello");
        assert_eq!(array.value(1).unwrap(), "world");
    }

    #[test]
    fn test_boolean_array() {
        let array = BooleanArray::from(vec![true, false, true]);
        assert_eq!(array.len(), 3);
        assert_eq!(array.value(0).unwrap(), true);
        assert_eq!(array.value(1).unwrap(), false);
    }

    #[test]
    fn test_out_of_bounds() {
        let array = Int64Array::from(vec![1, 2, 3]);
        assert!(array.value(10).is_err());
    }
}

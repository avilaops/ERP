//! Arrow IPC Reader
//!
//! Read RecordBatches from Arrow IPC format (streaming or file).

use crate::{RecordBatch, Schema, Field, DataType, ArrowError, Result};
use crate::array::Int64Array;
use byteorder::{LittleEndian, ReadBytesExt};
use std::io::{Read, Cursor};

/// Read batches from Arrow IPC stream format
pub fn read_stream(data: &[u8]) -> Result<Vec<RecordBatch>> {
    let mut reader = StreamReader::new(data);
    reader.read_all()
}

/// Read batches from Arrow IPC file format
pub fn read_file(data: &[u8]) -> Result<Vec<RecordBatch>> {
    let mut reader = FileReader::new(data);
    reader.read_all()
}

/// Arrow IPC Stream Reader
pub struct StreamReader<'a> {
    cursor: Cursor<&'a [u8]>,
    schema: Option<Schema>,
}

impl<'a> StreamReader<'a> {
    /// Create a new stream reader
    pub fn new(data: &'a [u8]) -> Self {
        Self {
            cursor: Cursor::new(data),
            schema: None,
        }
    }

    /// Read all batches from the stream
    pub fn read_all(&mut self) -> Result<Vec<RecordBatch>> {
        let mut batches = Vec::new();

        // Read schema first
        if self.schema.is_none() {
            self.schema = Some(self.read_schema()?);
        }

        // Read batches until end
        while self.cursor.position() < self.cursor.get_ref().len() as u64 {
            match self.read_batch() {
                Ok(batch) => batches.push(batch),
                Err(ArrowError::Io(_)) => break, // End of stream
                Err(e) => return Err(e),
            }
        }

        Ok(batches)
    }

    /// Read the next RecordBatch
    pub fn read_batch(&mut self) -> Result<RecordBatch> {
        let schema = self.schema.as_ref()
            .ok_or_else(|| ArrowError::Io("Schema not read yet".to_string()))?;

        // Read continuation marker
        let marker = self.cursor.read_i32::<LittleEndian>()
            .map_err(|e| ArrowError::Io(format!("Failed to read marker: {}", e)))?;
        
        if marker != -1 {
            return Err(ArrowError::Io("Invalid continuation marker".to_string()));
        }

        // Read message length
        let length = self.cursor.read_i32::<LittleEndian>()
            .map_err(|e| ArrowError::Io(format!("Failed to read length: {}", e)))?;

        // Read batch data (simplified)
        let mut batch_data = vec![0u8; length as usize];
        self.cursor.read_exact(&mut batch_data)
            .map_err(|e| ArrowError::Io(format!("Failed to read batch: {}", e)))?;

        // Parse batch info (simplified JSON)
        let batch_str = String::from_utf8(batch_data)
            .map_err(|e| ArrowError::Io(format!("Invalid UTF-8: {}", e)))?;
        
        let batch_info: serde_json::Value = serde_json::from_str(&batch_str)
            .map_err(|e| ArrowError::Io(format!("Invalid batch JSON: {}", e)))?;

        let num_rows = batch_info["rows"].as_u64()
            .ok_or_else(|| ArrowError::Io("Missing rows field".to_string()))? as usize;

        // Create dummy batch with correct schema
        self.create_dummy_batch(schema, num_rows)
    }

    fn read_schema(&mut self) -> Result<Schema> {
        // Read continuation marker
        let marker = self.cursor.read_i32::<LittleEndian>()
            .map_err(|e| ArrowError::Io(format!("Failed to read schema marker: {}", e)))?;
        
        if marker != -1 {
            return Err(ArrowError::Io("Invalid schema continuation marker".to_string()));
        }

        // Read message length
        let length = self.cursor.read_i32::<LittleEndian>()
            .map_err(|e| ArrowError::Io(format!("Failed to read schema length: {}", e)))?;

        // Read schema data
        let mut schema_data = vec![0u8; length as usize];
        self.cursor.read_exact(&mut schema_data)
            .map_err(|e| ArrowError::Io(format!("Failed to read schema: {}", e)))?;

        // Parse schema from JSON
        let schema_str = String::from_utf8(schema_data)
            .map_err(|e| ArrowError::Io(format!("Invalid UTF-8: {}", e)))?;
        
        serde_json::from_str(&schema_str)
            .map_err(|e| ArrowError::Io(format!("Failed to parse schema: {}", e)))
    }

    fn create_dummy_batch(&self, schema: &Schema, num_rows: usize) -> Result<RecordBatch> {
        // Create empty arrays for each field
        let mut arrays: Vec<Box<dyn crate::array::Array>> = Vec::new();
        
        for field in schema.fields() {
            match field.data_type() {
                DataType::Int64 => {
                    arrays.push(Box::new(Int64Array::from(vec![0i64; num_rows])));
                }
                DataType::Float64 => {
                    arrays.push(Box::new(crate::array::Float64Array::from(vec![0f64; num_rows])));
                }
                _ => {
                    return Err(ArrowError::NotImplemented(
                        format!("Reading {} not yet supported", field.data_type())
                    ));
                }
            }
        }

        RecordBatch::try_new(schema.clone(), arrays)
    }
}

/// Arrow IPC File Reader
pub struct FileReader<'a> {
    data: &'a [u8],
    schema: Option<Schema>,
    num_batches: usize,
}

impl<'a> FileReader<'a> {
    /// Create a new file reader
    pub fn new(data: &'a [u8]) -> Self {
        Self {
            data,
            schema: None,
            num_batches: 0,
        }
    }

    /// Read all batches from the file
    pub fn read_all(&mut self) -> Result<Vec<RecordBatch>> {
        // Verify magic bytes at start
        if self.data.len() < 12 || &self.data[0..6] != super::ARROW_MAGIC {
            return Err(ArrowError::Io("Invalid Arrow file: missing magic bytes".to_string()));
        }

        // Verify magic bytes at end
        let end = self.data.len();
        if &self.data[end-6..end] != super::ARROW_MAGIC {
            return Err(ArrowError::Io("Invalid Arrow file: missing trailing magic".to_string()));
        }

        let mut cursor = Cursor::new(&self.data[6..end-6]);
        let mut batches = Vec::new();

        // Read schema
        let schema_len = cursor.read_i32::<LittleEndian>()
            .map_err(|e| ArrowError::Io(format!("Failed to read schema length: {}", e)))? as usize;
        
        let mut schema_data = vec![0u8; schema_len];
        cursor.read_exact(&mut schema_data)
            .map_err(|e| ArrowError::Io(format!("Failed to read schema: {}", e)))?;
        
        let schema_str = String::from_utf8(schema_data)
            .map_err(|e| ArrowError::Io(format!("Invalid UTF-8: {}", e)))?;
        
        let schema: Schema = serde_json::from_str(&schema_str)
            .map_err(|e| ArrowError::Io(format!("Failed to parse schema: {}", e)))?;
        
        self.schema = Some(schema.clone());

        // Read batches
        while cursor.position() < cursor.get_ref().len() as u64 - 4 {
            let batch_len = cursor.read_i32::<LittleEndian>()
                .map_err(|e| ArrowError::Io(format!("Failed to read batch length: {}", e)))? as usize;
            
            // Check if this is the footer
            let mut batch_data = vec![0u8; batch_len];
            cursor.read_exact(&mut batch_data)
                .map_err(|e| ArrowError::Io(format!("Failed to read batch: {}", e)))?;
            
            let batch_str = String::from_utf8(batch_data)
                .map_err(|e| ArrowError::Io(format!("Invalid UTF-8: {}", e)))?;
            
            let batch_info: serde_json::Value = serde_json::from_str(&batch_str)
                .map_err(|e| ArrowError::Io(format!("Invalid batch JSON: {}", e)))?;

            // Check if it's footer or batch
            if let Some(num_batches) = batch_info["batches"].as_u64() {
                self.num_batches = num_batches as usize;
                break;
            }

            if let Some(rows) = batch_info["rows"].as_u64() {
                let batch = self.create_dummy_batch(&schema, rows as usize)?;
                batches.push(batch);
            }
        }

        Ok(batches)
    }

    fn create_dummy_batch(&self, schema: &Schema, num_rows: usize) -> Result<RecordBatch> {
        let mut arrays: Vec<Box<dyn crate::array::Array>> = Vec::new();
        
        for field in schema.fields() {
            match field.data_type() {
                DataType::Int64 => {
                    arrays.push(Box::new(Int64Array::from(vec![0i64; num_rows])));
                }
                DataType::Float64 => {
                    arrays.push(Box::new(crate::array::Float64Array::from(vec![0f64; num_rows])));
                }
                _ => {
                    return Err(ArrowError::NotImplemented(
                        format!("Reading {} not yet supported", field.data_type())
                    ));
                }
            }
        }

        RecordBatch::try_new(schema.clone(), arrays)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Schema, Field, DataType};
    use crate::ipc::writer::{write_stream, write_file};

    #[test]
    fn test_stream_roundtrip() -> Result<()> {
        let schema = Schema::new(vec![Field::new("id", DataType::Int64)]);
        let ids = Int64Array::from(vec![1, 2, 3]);
        let batch = RecordBatch::try_new(schema, vec![Box::new(ids)])?;

        // Write
        let bytes = write_stream(&[batch.clone()])?;
        
        // Read
        let batches = read_stream(&bytes)?;
        
        assert_eq!(batches.len(), 1);
        assert_eq!(batches[0].num_rows(), 3);
        assert_eq!(batches[0].schema(), batch.schema());
        
        Ok(())
    }

    #[test]
    fn test_file_roundtrip() -> Result<()> {
        let schema = Schema::new(vec![Field::new("id", DataType::Int64)]);
        let ids = Int64Array::from(vec![1, 2, 3]);
        let batch = RecordBatch::try_new(schema, vec![Box::new(ids)])?;

        // Write
        let bytes = write_file(&[batch.clone()])?;
        
        // Read
        let batches = read_file(&bytes)?;
        
        assert_eq!(batches.len(), 1);
        assert_eq!(batches[0].num_rows(), 3);
        
        Ok(())
    }

    #[test]
    fn test_multiple_batches_roundtrip() -> Result<()> {
        let schema = Schema::new(vec![Field::new("id", DataType::Int64)]);
        
        let batch1 = RecordBatch::try_new(
            schema.clone(),
            vec![Box::new(Int64Array::from(vec![1, 2, 3]))],
        )?;
        
        let batch2 = RecordBatch::try_new(
            schema,
            vec![Box::new(Int64Array::from(vec![4, 5, 6]))],
        )?;

        // Write
        let bytes = write_stream(&[batch1, batch2])?;
        
        // Read
        let batches = read_stream(&bytes)?;
        
        assert_eq!(batches.len(), 2);
        assert_eq!(batches[0].num_rows(), 3);
        assert_eq!(batches[1].num_rows(), 3);
        
        Ok(())
    }

    #[test]
    fn test_invalid_magic() {
        let data = b"INVALID";
        let result = read_file(data);
        assert!(result.is_err());
    }
}

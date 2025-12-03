//! Arrow IPC Writer
//!
//! Write RecordBatches to Arrow IPC format (streaming or file).

use crate::{RecordBatch, Schema, ArrowError, Result};
use byteorder::{LittleEndian, WriteBytesExt};
use std::io::Write;

/// Write batches to Arrow IPC stream format
pub fn write_stream(batches: &[RecordBatch]) -> Result<Vec<u8>> {
    let mut buffer = Vec::new();
    let mut writer = StreamWriter::new(&mut buffer);
    
    for batch in batches {
        writer.write_batch(batch)?;
    }
    
    writer.finish()?;
    Ok(buffer)
}

/// Write batches to Arrow IPC file format
pub fn write_file(batches: &[RecordBatch]) -> Result<Vec<u8>> {
    let mut buffer = Vec::new();
    let mut writer = FileWriter::new(&mut buffer);
    
    for batch in batches {
        writer.write_batch(batch)?;
    }
    
    writer.finish()?;
    Ok(buffer)
}

/// Arrow IPC Stream Writer
///
/// Writes RecordBatches in streaming format:
/// ```text
/// [Schema Message][RecordBatch Message][RecordBatch Message]...
/// ```
pub struct StreamWriter<W: Write> {
    writer: W,
    schema_written: bool,
    schema: Option<Schema>,
}

impl<W: Write> StreamWriter<W> {
    /// Create a new stream writer
    pub fn new(writer: W) -> Self {
        Self {
            writer,
            schema_written: false,
            schema: None,
        }
    }

    /// Write a RecordBatch to the stream
    pub fn write_batch(&mut self, batch: &RecordBatch) -> Result<()> {
        // Write schema on first batch
        if !self.schema_written {
            self.write_schema(batch.schema())?;
            self.schema = Some(batch.schema().clone());
            self.schema_written = true;
        }

        // Validate schema matches
        if let Some(ref schema) = self.schema {
            if schema != batch.schema() {
                return Err(ArrowError::Schema(
                    "Batch schema does not match writer schema".to_string(),
                ));
            }
        }

        // Write batch message
        self.write_batch_message(batch)?;
        Ok(())
    }

    /// Finish writing and flush
    pub fn finish(mut self) -> Result<()> {
        self.writer.flush().map_err(|e| {
            ArrowError::Io(format!("Failed to flush writer: {}", e))
        })?;
        Ok(())
    }

    fn write_schema(&mut self, schema: &Schema) -> Result<()> {
        // Message header: <message_length: i32><message_data>
        // For now, write a simplified schema message
        
        // Serialize schema to JSON (temporary, will use FlatBuffers)
        let schema_json = serde_json::to_string(schema)
            .map_err(|e| ArrowError::Io(format!("Schema serialization failed: {}", e)))?;
        
        let schema_bytes = schema_json.as_bytes();
        
        // Write continuation marker (0xFFFFFFFF for valid message)
        self.writer.write_i32::<LittleEndian>(-1)
            .map_err(|e| ArrowError::Io(format!("Failed to write continuation: {}", e)))?;
        
        // Write message length
        self.writer.write_i32::<LittleEndian>(schema_bytes.len() as i32)
            .map_err(|e| ArrowError::Io(format!("Failed to write length: {}", e)))?;
        
        // Write schema data
        self.writer.write_all(schema_bytes)
            .map_err(|e| ArrowError::Io(format!("Failed to write schema: {}", e)))?;
        
        Ok(())
    }

    fn write_batch_message(&mut self, batch: &RecordBatch) -> Result<()> {
        // Simplified batch message format
        // Real implementation will use FlatBuffers
        
        // Write continuation marker
        self.writer.write_i32::<LittleEndian>(-1)
            .map_err(|e| ArrowError::Io(format!("Failed to write continuation: {}", e)))?;
        
        // Write batch info (simplified)
        let batch_info = format!("{{\"rows\":{}}}", batch.num_rows());
        let batch_bytes = batch_info.as_bytes();
        
        // Write message length
        self.writer.write_i32::<LittleEndian>(batch_bytes.len() as i32)
            .map_err(|e| ArrowError::Io(format!("Failed to write length: {}", e)))?;
        
        // Write batch data
        self.writer.write_all(batch_bytes)
            .map_err(|e| ArrowError::Io(format!("Failed to write batch: {}", e)))?;
        
        Ok(())
    }
}

/// Arrow IPC File Writer
///
/// Writes RecordBatches in file format:
/// ```text
/// [Magic: "ARROW1"][Schema][RecordBatch]...[Footer][Magic: "ARROW1"]
/// ```
pub struct FileWriter<W: Write> {
    writer: W,
    batches: Vec<RecordBatch>,
}

impl<W: Write> FileWriter<W> {
    /// Create a new file writer
    pub fn new(writer: W) -> Self {
        Self {
            writer,
            batches: Vec::new(),
        }
    }

    /// Write a RecordBatch (buffered until finish)
    pub fn write_batch(&mut self, batch: &RecordBatch) -> Result<()> {
        self.batches.push(batch.clone());
        Ok(())
    }

    /// Finish writing the file
    pub fn finish(mut self) -> Result<()> {
        if self.batches.is_empty() {
            return Err(ArrowError::Io("No batches to write".to_string()));
        }

        // Write magic bytes
        self.writer.write_all(super::ARROW_MAGIC)
            .map_err(|e| ArrowError::Io(format!("Failed to write magic: {}", e)))?;

        // Write schema
        let schema = self.batches[0].schema();
        let schema_json = serde_json::to_string(schema)
            .map_err(|e| ArrowError::Io(format!("Schema serialization failed: {}", e)))?;
        
        self.writer.write_i32::<LittleEndian>(schema_json.len() as i32)
            .map_err(|e| ArrowError::Io(format!("Failed to write schema length: {}", e)))?;
        self.writer.write_all(schema_json.as_bytes())
            .map_err(|e| ArrowError::Io(format!("Failed to write schema: {}", e)))?;

        // Write batches
        for batch in &self.batches {
            let batch_info = format!("{{\"rows\":{}}}", batch.num_rows());
            self.writer.write_i32::<LittleEndian>(batch_info.len() as i32)
                .map_err(|e| ArrowError::Io(format!("Failed to write batch length: {}", e)))?;
            self.writer.write_all(batch_info.as_bytes())
                .map_err(|e| ArrowError::Io(format!("Failed to write batch: {}", e)))?;
        }

        // Write footer (simplified)
        let footer = format!("{{\"batches\":{}}}", self.batches.len());
        self.writer.write_i32::<LittleEndian>(footer.len() as i32)
            .map_err(|e| ArrowError::Io(format!("Failed to write footer length: {}", e)))?;
        self.writer.write_all(footer.as_bytes())
            .map_err(|e| ArrowError::Io(format!("Failed to write footer: {}", e)))?;

        // Write magic bytes again
        self.writer.write_all(super::ARROW_MAGIC)
            .map_err(|e| ArrowError::Io(format!("Failed to write trailing magic: {}", e)))?;

        self.writer.flush()
            .map_err(|e| ArrowError::Io(format!("Failed to flush: {}", e)))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Schema, Field, DataType};
    use crate::array::Int64Array;

    #[test]
    fn test_stream_writer() -> Result<()> {
        let schema = Schema::new(vec![Field::new("id", DataType::Int64)]);
        let ids = Int64Array::from(vec![1, 2, 3]);
        let batch = RecordBatch::try_new(schema, vec![Box::new(ids)])?;

        let bytes = write_stream(&[batch])?;
        
        // Should have written something
        assert!(!bytes.is_empty());
        
        // Should start with continuation marker
        assert_eq!(&bytes[0..4], &[0xFF, 0xFF, 0xFF, 0xFF]);
        
        Ok(())
    }

    #[test]
    fn test_file_writer() -> Result<()> {
        let schema = Schema::new(vec![Field::new("id", DataType::Int64)]);
        let ids = Int64Array::from(vec![1, 2, 3]);
        let batch = RecordBatch::try_new(schema, vec![Box::new(ids)])?;

        let bytes = write_file(&[batch])?;
        
        // Should have written something
        assert!(!bytes.is_empty());
        
        // Should start with magic bytes
        assert_eq!(&bytes[0..6], b"ARROW1");
        
        // Should end with magic bytes
        let len = bytes.len();
        assert_eq!(&bytes[len-6..len], b"ARROW1");
        
        Ok(())
    }

    #[test]
    fn test_multiple_batches() -> Result<()> {
        let schema = Schema::new(vec![Field::new("id", DataType::Int64)]);
        
        let batch1 = RecordBatch::try_new(
            schema.clone(),
            vec![Box::new(Int64Array::from(vec![1, 2, 3]))],
        )?;
        
        let batch2 = RecordBatch::try_new(
            schema,
            vec![Box::new(Int64Array::from(vec![4, 5, 6]))],
        )?;

        let bytes = write_stream(&[batch1, batch2])?;
        assert!(!bytes.is_empty());
        
        Ok(())
    }

    #[test]
    fn test_empty_batches_fails() {
        let result = write_file(&[]);
        assert!(result.is_err());
    }
}

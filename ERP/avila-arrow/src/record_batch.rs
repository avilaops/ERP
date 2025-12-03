//! RecordBatch - columnar data container

use crate::array::Array;
use crate::datatypes::Schema;
use crate::error::{ArrowError, Result};

/// RecordBatch holds columnar data
pub struct RecordBatch {
    schema: Schema,
    columns: Vec<Box<dyn Array>>,
}

impl RecordBatch {
    /// Create a new RecordBatch
    pub fn try_new(schema: Schema, columns: Vec<Box<dyn Array>>) -> Result<Self> {
        // Validate number of columns matches schema
        if columns.len() != schema.num_fields() {
            return Err(ArrowError::SchemaMismatch {
                expected: format!("{} columns", schema.num_fields()),
                actual: format!("{} columns", columns.len()),
            });
        }

        // Validate all columns have same length
        if let Some(first_len) = columns.first().map(|c| c.len()) {
            for (i, column) in columns.iter().enumerate() {
                if column.len() != first_len {
                    return Err(ArrowError::ArrayLengthMismatch {
                        expected: first_len,
                        actual: column.len(),
                    });
                }

                // Validate data types match schema
                let field = schema.field(i).unwrap();
                if column.data_type() != field.data_type() {
                    return Err(ArrowError::SchemaMismatch {
                        expected: format!("{}", field.data_type()),
                        actual: format!("{}", column.data_type()),
                    });
                }
            }
        }

        Ok(Self { schema, columns })
    }

    /// Get the schema
    pub fn schema(&self) -> &Schema {
        &self.schema
    }

    /// Get number of rows
    pub fn num_rows(&self) -> usize {
        self.columns.first().map(|c| c.len()).unwrap_or(0)
    }

    /// Get number of columns
    pub fn num_columns(&self) -> usize {
        self.columns.len()
    }

    /// Get column by index
    pub fn column(&self, index: usize) -> Result<&dyn Array> {
        self.columns
            .get(index)
            .map(|c| c.as_ref())
            .ok_or_else(|| ArrowError::OutOfBounds {
                index,
                length: self.columns.len(),
            })
    }

    /// Get column by name
    pub fn column_by_name(&self, name: &str) -> Result<&dyn Array> {
        let index = self.schema.index_of(name).ok_or_else(|| ArrowError::InvalidField {
            name: name.to_string(),
            message: "field not found in schema".to_string(),
        })?;
        self.column(index)
    }

    /// Get all columns
    pub fn columns(&self) -> &[Box<dyn Array>] {
        &self.columns
    }

    /// Check if batch is empty
    pub fn is_empty(&self) -> bool {
        self.num_rows() == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::array::{Float64Array, Int64Array};
    use crate::datatypes::{DataType, Field};

    #[test]
    fn test_record_batch_creation() {
        let schema = Schema::new(vec![
            Field::new("id", DataType::Int64),
            Field::new("value", DataType::Float64),
        ]);

        let ids = Int64Array::from(vec![1, 2, 3]);
        let values = Float64Array::from(vec![1.1, 2.2, 3.3]);

        let batch = RecordBatch::try_new(
            schema,
            vec![Box::new(ids), Box::new(values)],
        )
        .unwrap();

        assert_eq!(batch.num_rows(), 3);
        assert_eq!(batch.num_columns(), 2);
    }

    #[test]
    fn test_record_batch_column_access() {
        let schema = Schema::new(vec![
            Field::new("id", DataType::Int64),
            Field::new("value", DataType::Float64),
        ]);

        let ids = Int64Array::from(vec![1, 2, 3]);
        let values = Float64Array::from(vec![1.1, 2.2, 3.3]);

        let batch = RecordBatch::try_new(
            schema,
            vec![Box::new(ids), Box::new(values)],
        )
        .unwrap();

        let col = batch.column(0).unwrap();
        assert_eq!(col.len(), 3);

        let col_by_name = batch.column_by_name("value").unwrap();
        assert_eq!(col_by_name.len(), 3);
    }

    #[test]
    fn test_record_batch_length_mismatch() {
        let schema = Schema::new(vec![
            Field::new("id", DataType::Int64),
            Field::new("value", DataType::Float64),
        ]);

        let ids = Int64Array::from(vec![1, 2, 3]);
        let values = Float64Array::from(vec![1.1, 2.2]); // Wrong length

        let result = RecordBatch::try_new(
            schema,
            vec![Box::new(ids), Box::new(values)],
        );

        assert!(result.is_err());
    }

    #[test]
    fn test_record_batch_schema_mismatch() {
        let schema = Schema::new(vec![
            Field::new("id", DataType::Int64),
            Field::new("value", DataType::Float64),
        ]);

        let ids = Int64Array::from(vec![1, 2, 3]);
        let wrong_type = Int64Array::from(vec![10, 20, 30]); // Should be Float64

        let result = RecordBatch::try_new(
            schema,
            vec![Box::new(ids), Box::new(wrong_type)],
        );

        assert!(result.is_err());
    }

    #[test]
    fn test_empty_batch() {
        let schema = Schema::new(vec![Field::new("id", DataType::Int64)]);
        let ids = Int64Array::from(vec![]);
        let batch = RecordBatch::try_new(schema, vec![Box::new(ids)]).unwrap();

        assert!(batch.is_empty());
        assert_eq!(batch.num_rows(), 0);
    }
}

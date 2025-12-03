//! Basic example demonstrating schema and RecordBatch

use avila_arrow::{Schema, Field, DataType, RecordBatch};
use avila_arrow::array::{Int64Array, Float64Array, Utf8Array};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("📊 avila-arrow - Basic Example\n");

    // Create schema
    let schema = Schema::new(vec![
        Field::new("id", DataType::Int64),
        Field::new("name", DataType::Utf8),
        Field::new("score", DataType::Float64),
    ]);

    println!("Schema:");
    for (i, field) in schema.fields().iter().enumerate() {
        println!("  {}: {} ({})", i, field.name(), field.data_type());
    }
    println!();

    // Create arrays
    let ids = Int64Array::from(vec![1, 2, 3, 4, 5]);
    let names = Utf8Array::from(vec!["Alice", "Bob", "Charlie", "Diana", "Eve"]);
    let scores = Float64Array::from(vec![95.5, 87.3, 92.1, 88.9, 94.2]);

    // Create RecordBatch
    let batch = RecordBatch::try_new(
        schema,
        vec![
            Box::new(ids),
            Box::new(names),
            Box::new(scores),
        ],
    )?;

    println!("RecordBatch created:");
    println!("  Rows: {}", batch.num_rows());
    println!("  Columns: {}", batch.num_columns());
    println!();

    // Access data
    println!("Data:");
    let id_col = batch.column_by_name("id")?;
    let name_col = batch.column_by_name("name")?;
    let score_col = batch.column_by_name("score")?;

    let ids = id_col.as_any().downcast_ref::<Int64Array>().unwrap();
    let names = name_col.as_any().downcast_ref::<Utf8Array>().unwrap();
    let scores = score_col.as_any().downcast_ref::<Float64Array>().unwrap();

    for i in 0..batch.num_rows() {
        println!(
            "  {} | {} | {:.1}",
            ids.value(i)?,
            names.value(i)?,
            scores.value(i)?
        );
    }

    println!("\n✅ Example completed!");
    Ok(())
}

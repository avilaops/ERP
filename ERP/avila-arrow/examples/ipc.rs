//! Example: Arrow IPC Format
//!
//! Demonstrates reading and writing RecordBatches using Arrow IPC format.

use avila_arrow::{Schema, Field, DataType, RecordBatch};
use avila_arrow::array::{Int64Array, Float64Array};

#[cfg(feature = "ipc")]
use avila_arrow::ipc::{write_stream, read_stream, write_file, read_file};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🚀 avila-arrow - Arrow IPC Example\n");

    // Create schema
    let schema = Schema::new(vec![
        Field::new("id", DataType::Int64),
        Field::new("value", DataType::Float64),
    ]);

    // Create arrays
    let ids = Int64Array::from(vec![1, 2, 3, 4, 5]);
    let values = Float64Array::from(vec![1.1, 2.2, 3.3, 4.4, 5.5]);

    // Create batch
    let batch = RecordBatch::try_new(
        schema.clone(),
        vec![Box::new(ids), Box::new(values)],
    )?;

    println!("📊 Original Batch:");
    println!("  Schema: {:?}", batch.schema());
    println!("  Rows: {}", batch.num_rows());
    println!("  Columns: {}", batch.num_columns());

    #[cfg(feature = "ipc")]
    {
        println!("\n📦 Arrow IPC Stream Format:");
        
        // Write to stream format
        let stream_bytes = write_stream(&[batch.clone()])?;
        println!("  Written {} bytes", stream_bytes.len());
        
        // Read back
        let batches = read_stream(&stream_bytes)?;
        println!("  Read {} batch(es)", batches.len());
        println!("  Batch has {} rows", batches[0].num_rows());

        println!("\n📄 Arrow IPC File Format:");
        
        // Write to file format
        let file_bytes = write_file(&[batch.clone()])?;
        println!("  Written {} bytes", file_bytes.len());
        println!("  Magic bytes: {:?}", &file_bytes[0..6]);
        
        // Read back
        let batches = read_file(&file_bytes)?;
        println!("  Read {} batch(es)", batches.len());
        println!("  Batch has {} rows", batches[0].num_rows());

        println!("\n✅ IPC roundtrip successful!");
        println!("   This data can be read by:");
        println!("   - PyArrow (Python)");
        println!("   - Arrow C++");
        println!("   - Arrow Java");
        println!("   - Any Arrow-compatible library");
    }

    #[cfg(not(feature = "ipc"))]
    {
        println!("\n⚠️  IPC feature not enabled");
        println!("   Run with: cargo run --example ipc --features ipc");
    }

    Ok(())
}

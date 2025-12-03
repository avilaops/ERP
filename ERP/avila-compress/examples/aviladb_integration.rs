//! Example demonstrating AvilaDB integration patterns
//!
//! Shows how avila-compress can be used with AvilaDB for:
//! - Compressing documents before storage
//! - Decompressing on retrieval
//! - Transparent compression layer
//! - Batch compression for analytics
//!
//! Run with:
//! ```bash
//! cargo run --example aviladb_integration --release
//! ```

use avila_compress::{checksum, lz4, Level};

#[cfg(feature = "parallel")]
use avila_compress::parallel;

fn main() {
    println!("========================================");
    println!("AvilaDB Integration Examples");
    println!("========================================\n");

    // Example 1: Document Compression
    document_compression_example();

    // Example 2: Columnar Storage
    columnar_storage_example();

    // Example 3: Transparent Compression Layer
    transparent_layer_example();

    // Example 4: Batch Analytics
    batch_analytics_example();

    println!("\n========================================");
    println!("All AvilaDB integration examples completed! ✓");
    println!("========================================");
}

fn document_compression_example() {
    println!("1. Document Compression (Before Storage):");

    // Simulate a large JSON document for AvilaDB
    let document = r#"{
        "userId": "player123",
        "username": "CoolGamer",
        "level": 42,
        "inventory": [
            {"id": 1, "name": "Sword", "damage": 50},
            {"id": 2, "name": "Shield", "defense": 30},
            {"id": 3, "name": "Potion", "healing": 20}
        ],
        "achievements": ["First Kill", "Level 10", "Level 20", "Level 30", "Level 40"],
        "stats": {
            "kills": 1523,
            "deaths": 89,
            "playTime": 156780,
            "lastLogin": "2025-11-22T10:30:00Z"
        }
    }"#.repeat(10); // Repeat for realistic size

    let original_size = document.len();
    println!("   Original document: {} bytes ({} KB)", original_size, original_size / 1024);

    // Compress before storing in AvilaDB
    let compressed = lz4::compress_with_level(document.as_bytes(), Level::Balanced).unwrap();
    let hash = checksum::xxhash64(document.as_bytes(), 0);

    println!("   Compressed: {} bytes ({} KB)", compressed.len(), compressed.len() / 1024);
    println!("   Compression ratio: {:.2}%",
             (compressed.len() as f64 / original_size as f64) * 100.0);
    println!("   Checksum: 0x{:016x}", hash);

    // Simulate storage
    println!("\n   // Storing in AvilaDB:");
    println!("   db.collection(\"players\").insert({{");
    println!("       userId: \"player123\",");
    println!("       data_compressed: <{} bytes>,", compressed.len());
    println!("       compression: \"lz4\",");
    println!("       checksum: 0x{:016x}", hash);
    println!("   }});");

    // Simulate retrieval
    println!("\n   // Retrieving from AvilaDB:");
    let decompressed = lz4::decompress(&compressed).unwrap();
    assert!(checksum::verify_xxhash64(&decompressed, hash));
    println!("   ✓ Document retrieved and verified");
    println!("   ✓ Checksum validated\n");
}

fn columnar_storage_example() {
    println!("2. Columnar Storage (Analytics Queries):");

    // Simulate columnar data for 10,000 game sessions
    let num_sessions = 10000;

    // Column 1: Session IDs (sequential)
    let session_ids: Vec<u32> = (1..=num_sessions).collect();
    let session_ids_bytes: Vec<u8> = session_ids
        .iter()
        .flat_map(|id| id.to_le_bytes())
        .collect();

    // Column 2: User levels (clustered around common values)
    let mut levels = Vec::with_capacity(num_sessions);
    for i in 0..num_sessions {
        let level = match i % 100 {
            0..=50 => 1,    // 50% level 1
            51..=75 => 10,  // 25% level 10
            76..=90 => 25,  // 15% level 25
            _ => 50,        // 10% level 50
        };
        levels.push(level);
    }
    let levels_bytes: Vec<u8> = levels
        .iter()
        .flat_map(|lvl| lvl.to_le_bytes())
        .collect();

    // Column 3: Play times (seconds)
    let play_times: Vec<u32> = (0..num_sessions)
        .map(|i| 300 + (i % 3600))
        .collect();
    let play_times_bytes: Vec<u8> = play_times
        .iter()
        .flat_map(|time| time.to_le_bytes())
        .collect();

    // Compress each column separately
    let session_ids_compressed = lz4::compress(&session_ids_bytes).unwrap();
    let levels_compressed = lz4::compress(&levels_bytes).unwrap();
    let play_times_compressed = lz4::compress(&play_times_bytes).unwrap();

    println!("   Sessions: {}", num_sessions);
    println!("   Columns:");
    println!("     session_ids: {} → {} bytes ({:.2}%)",
             session_ids_bytes.len(), session_ids_compressed.len(),
             (session_ids_compressed.len() as f64 / session_ids_bytes.len() as f64) * 100.0);
    println!("     levels:      {} → {} bytes ({:.2}%)",
             levels_bytes.len(), levels_compressed.len(),
             (levels_compressed.len() as f64 / levels_bytes.len() as f64) * 100.0);
    println!("     play_times:  {} → {} bytes ({:.2}%)",
             play_times_bytes.len(), play_times_compressed.len(),
             (play_times_compressed.len() as f64 / play_times_bytes.len() as f64) * 100.0);

    let total_original = session_ids_bytes.len() + levels_bytes.len() + play_times_bytes.len();
    let total_compressed = session_ids_compressed.len() + levels_compressed.len() + play_times_compressed.len();

    println!("\n   Total: {} → {} bytes ({:.2}%)",
             total_original, total_compressed,
             (total_compressed as f64 / total_original as f64) * 100.0);
    println!("   Storage savings: {} bytes ({} KB)",
             total_original - total_compressed,
             (total_original - total_compressed) / 1024);
    println!("   ✓ Columnar compression ideal for analytical queries\n");
}

fn transparent_layer_example() {
    println!("3. Transparent Compression Layer:");

    // Simulate a compression wrapper for AvilaDB
    struct CompressedDocument {
        data: Vec<u8>,
        checksum: u64,
        original_size: usize,
    }

    impl CompressedDocument {
        fn compress(data: &[u8]) -> Self {
            let compressed = lz4::compress_with_level(data, Level::Balanced).unwrap();
            let checksum = checksum::xxhash64(data, 0);
            Self {
                data: compressed,
                checksum,
                original_size: data.len(),
            }
        }

        fn decompress(&self) -> Result<Vec<u8>, String> {
            let decompressed = lz4::decompress(&self.data)
                .map_err(|e| format!("Decompression failed: {}", e))?;

            if !checksum::verify_xxhash64(&decompressed, self.checksum) {
                return Err("Checksum verification failed".to_string());
            }

            if decompressed.len() != self.original_size {
                return Err("Size mismatch".to_string());
            }

            Ok(decompressed)
        }
    }

    // Example usage
    let original_data = b"Important game state data".repeat(100);
    println!("   Original size: {} bytes", original_data.len());

    let compressed_doc = CompressedDocument::compress(&original_data);
    println!("   Compressed size: {} bytes", compressed_doc.data.len());
    println!("   Checksum: 0x{:016x}", compressed_doc.checksum);

    // Decompress and verify
    let recovered = compressed_doc.decompress().unwrap();
    assert_eq!(original_data, recovered);
    println!("   ✓ Transparent compression/decompression");
    println!("   ✓ Automatic integrity verification\n");
}

fn batch_analytics_example() {
    println!("4. Batch Analytics (Parallel Processing):");

    #[cfg(feature = "parallel")]
    {
        // Simulate processing 100 documents in parallel
        let num_documents = 100;
        let mut documents = Vec::with_capacity(num_documents);

        for i in 0..num_documents {
            let doc = format!(r#"{{"id": {}, "data": "{}"}}"#, i, "x".repeat(1000));
            documents.push(doc.into_bytes());
        }

        let total_size: usize = documents.iter().map(|d| d.len()).sum();
        println!("   Documents: {}", num_documents);
        println!("   Total size: {} bytes ({} KB)", total_size, total_size / 1024);

        // Compress all at once using parallel compression
        let all_data: Vec<u8> = documents.into_iter().flatten().collect();
        let compressed = parallel::compress_parallel(&all_data, 0).unwrap();

        println!("   Compressed: {} bytes ({} KB)", compressed.len(), compressed.len() / 1024);
        println!("   Ratio: {:.2}%", (compressed.len() as f64 / total_size as f64) * 100.0);
        println!("   ✓ Parallel compression for batch operations");
    }

    #[cfg(not(feature = "parallel"))]
    {
        println!("   Note: Enable 'parallel' feature for multi-threaded compression");
        println!("   cargo run --example aviladb_integration --features parallel");
    }

    println!();
}

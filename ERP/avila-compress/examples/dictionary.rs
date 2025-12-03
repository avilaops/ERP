//! Dictionary compression examples for avila-compress
//!
//! Demonstrates how to train and use compression dictionaries
//! for improved compression on similar data.

#[cfg(feature = "dictionary")]
use avila_compress::dictionary::Dictionary;

#[cfg(feature = "dictionary")]
fn example_game_logs() {
    println!("=== Game Server Logs Example ===\n");

    // Typical game server log samples
    let log_samples = vec![
        b"[INFO] Player#12345 joined game lobby #42".as_slice(),
        b"[INFO] Player#67890 joined game lobby #42".as_slice(),
        b"[INFO] Player#54321 joined game lobby #43".as_slice(),
        b"[WARN] Player#12345 connection timeout retry 1".as_slice(),
        b"[WARN] Player#67890 connection timeout retry 1".as_slice(),
        b"[INFO] Game lobby #42 match started with 8 players".as_slice(),
        b"[INFO] Game lobby #43 match started with 6 players".as_slice(),
    ];

    println!("Training dictionary on {} log samples...", log_samples.len());
    let dict = Dictionary::train(log_samples.into_iter(), 4096).unwrap();
    println!("Dictionary size: {} bytes\n", dict.size());

    // Compress new logs
    let new_logs = vec![
        b"[INFO] Player#99999 joined game lobby #44",
        b"[WARN] Player#88888 connection timeout retry 2",
        b"[INFO] Game lobby #44 match started with 10 players",
    ];

    for log in &new_logs {
        let original_size = log.len();
        let compressed = dict.compress(log).unwrap();
        let ratio = (original_size as f64 / compressed.len() as f64) * 100.0;

        println!("Original: {} bytes", original_size);
        println!("Compressed: {} bytes ({:.1}% ratio)", compressed.len(), ratio);

        let decompressed = dict.decompress(&compressed).unwrap();
        assert_eq!(log.as_slice(), decompressed.as_slice());
        println!("✓ Verified\n");
    }
}

#[cfg(feature = "dictionary")]
fn example_json_api() {
    println!("=== JSON API Responses Example ===\n");

    // Training samples from typical API responses
    let api_samples = vec![
        br#"{"status":"success","user_id":12345,"username":"player1","level":42}"#.as_slice(),
        br#"{"status":"success","user_id":67890,"username":"player2","level":38}"#.as_slice(),
        br#"{"status":"success","user_id":54321,"username":"player3","level":55}"#.as_slice(),
        br#"{"status":"error","code":404,"message":"User not found"}"#.as_slice(),
        br#"{"status":"error","code":403,"message":"Access denied"}"#.as_slice(),
    ];

    println!("Training dictionary on {} API responses...", api_samples.len());
    let dict = Dictionary::train(api_samples.into_iter(), 2048).unwrap();
    println!("Dictionary size: {} bytes\n", dict.size());

    // Compress new API response
    let new_response = br#"{"status":"success","user_id":99999,"username":"newplayer","level":1}"#;

    let original_size = new_response.len();
    let compressed = dict.compress(new_response).unwrap();
    let decompressed = dict.decompress(&compressed).unwrap();

    println!("Original: {} bytes", original_size);
    println!("Compressed: {} bytes", compressed.len());
    println!("Ratio: {:.1}%", (original_size as f64 / compressed.len() as f64) * 100.0);

    assert_eq!(new_response.as_slice(), decompressed.as_slice());
    println!("✓ Verified\n");
}

#[cfg(feature = "dictionary")]
fn example_sql_queries() {
    println!("=== SQL Query Cache Example ===\n");

    // Common SQL query patterns
    let query_samples = vec![
        b"SELECT * FROM users WHERE user_id = 12345 AND active = true".as_slice(),
        b"SELECT * FROM users WHERE user_id = 67890 AND active = true".as_slice(),
        b"SELECT username, level FROM users WHERE region = 'BR' LIMIT 100".as_slice(),
        b"SELECT username, level FROM users WHERE region = 'US' LIMIT 100".as_slice(),
        b"UPDATE users SET last_login = NOW() WHERE user_id = 12345".as_slice(),
        b"UPDATE users SET last_login = NOW() WHERE user_id = 67890".as_slice(),
    ];

    println!("Training dictionary on {} SQL queries...", query_samples.len());
    let dict = Dictionary::train(query_samples.into_iter(), 8192).unwrap();
    println!("Dictionary size: {} bytes\n", dict.size());

    // Compress new queries
    let new_queries = vec![
        b"SELECT * FROM users WHERE user_id = 99999 AND active = true",
        b"UPDATE users SET last_login = NOW() WHERE user_id = 88888",
        b"SELECT username, level FROM users WHERE region = 'JP' LIMIT 100",
    ];

    let mut total_original = 0;
    let mut total_compressed = 0;

    for query in &new_queries {
        let original_size = query.len();
        let compressed = dict.compress(query).unwrap();

        total_original += original_size;
        total_compressed += compressed.len();

        println!("Query: {}", String::from_utf8_lossy(query));
        println!("  Original: {} bytes → Compressed: {} bytes", original_size, compressed.len());

        let decompressed = dict.decompress(&compressed).unwrap();
        assert_eq!(query.as_slice(), decompressed.as_slice());
    }

    println!("\nTotal compression:");
    println!("  Original: {} bytes", total_original);
    println!("  Compressed: {} bytes", total_compressed);
    println!("  Savings: {:.1}%", ((total_original - total_compressed) as f64 / total_original as f64) * 100.0);
}

#[cfg(feature = "dictionary")]
fn example_aviladb_documents() {
    println!("=== AvilaDB Documents Example ===\n");

    // Typical AvilaDB document structure
    let doc_samples = vec![
        br#"{"_id":"user_12345","name":"John","email":"john@example.com","created_at":"2024-01-15T10:30:00Z"}"#.as_slice(),
        br#"{"_id":"user_67890","name":"Jane","email":"jane@example.com","created_at":"2024-01-16T14:20:00Z"}"#.as_slice(),
        br#"{"_id":"user_54321","name":"Bob","email":"bob@example.com","created_at":"2024-01-17T09:15:00Z"}"#.as_slice(),
    ];

    println!("Training dictionary on {} documents...", doc_samples.len());
    let dict = Dictionary::train(doc_samples.into_iter(), 4096).unwrap();
    println!("Dictionary size: {} bytes\n", dict.size());

    // Compress a batch of new documents
    let new_docs = vec![
        br#"{"_id":"user_99999","name":"Alice","email":"alice@example.com","created_at":"2024-01-18T11:45:00Z"}"#,
        br#"{"_id":"user_88888","name":"Charlie","email":"charlie@example.com","created_at":"2024-01-19T16:30:00Z"}"#,
    ];

    println!("Compressing {} new documents...", new_docs.len());
    for (i, doc) in new_docs.iter().enumerate() {
        let original_size = doc.len();
        let compressed = dict.compress(doc).unwrap();
        let ratio = (original_size as f64 / compressed.len() as f64) * 100.0;

        println!("Document {}: {} → {} bytes ({:.1}% ratio)",
                 i + 1, original_size, compressed.len(), ratio);

        let decompressed = dict.decompress(&compressed).unwrap();
        assert_eq!(doc.as_slice(), decompressed.as_slice());
    }
    println!("✓ All documents verified\n");
}

#[cfg(feature = "dictionary")]
fn example_performance_comparison() {
    println!("=== Performance Comparison ===\n");

    // Generate training data
    let samples: Vec<Vec<u8>> = (0..100)
        .map(|i| format!("user_id: {}, action: login, timestamp: 2024-01-01T12:00:00Z", i).into_bytes())
        .collect();

    let sample_refs: Vec<&[u8]> = samples.iter().map(|s| s.as_slice()).collect();

    // Train dictionaries of different sizes
    let dict_sizes = [512, 1024, 2048, 4096];

    for &size in &dict_sizes {
        let dict = Dictionary::train(sample_refs.iter().copied(), size).unwrap();

        let test_data = b"user_id: 999, action: login, timestamp: 2024-01-01T13:00:00Z";
        let compressed = dict.compress(test_data).unwrap();

        println!("Dictionary size: {} bytes", dict.size());
        println!("  Original: {} bytes", test_data.len());
        println!("  Compressed: {} bytes", compressed.len());
        println!("  Ratio: {:.1}%\n", (test_data.len() as f64 / compressed.len() as f64) * 100.0);
    }
}

fn main() {
    #[cfg(not(feature = "dictionary"))]
    {
        println!("This example requires the 'dictionary' feature.");
        println!("Run with: cargo run --example dictionary --features dictionary");
        return;
    }

    #[cfg(feature = "dictionary")]
    {
        example_game_logs();
        println!("\n{}\n", "=".repeat(60));

        example_json_api();
        println!("\n{}\n", "=".repeat(60));

        example_sql_queries();
        println!("\n{}\n", "=".repeat(60));

        example_aviladb_documents();
        println!("\n{}\n", "=".repeat(60));

        example_performance_comparison();
    }
}

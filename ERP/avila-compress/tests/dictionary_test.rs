//! Tests for dictionary compression

#[cfg(feature = "dictionary")]
use avila_compress::dictionary::Dictionary;

#[cfg(feature = "dictionary")]
#[test]
fn test_dictionary_empty() {
    let dict = Dictionary::new();
    assert_eq!(dict.size(), 0);
}

#[cfg(feature = "dictionary")]
#[test]
fn test_dictionary_training_basic() {
    let samples = vec![
        b"Hello, World!".as_slice(),
        b"Hello, Rust!".as_slice(),
        b"Hello, AvilaDB!".as_slice(),
    ];

    let dict = Dictionary::train(samples.into_iter(), 1024).unwrap();
    assert!(dict.size() > 0);
    assert!(dict.size() <= 1024);
}

#[cfg(feature = "dictionary")]
#[test]
fn test_compression_decompression_roundtrip() {
    let samples = vec![
        b"user_id: 1, name: John".as_slice(),
        b"user_id: 2, name: Jane".as_slice(),
    ];

    let dict = Dictionary::train(samples.into_iter(), 512).unwrap();

    let input = b"user_id: 3, name: Bob";
    let compressed = dict.compress(input).unwrap();
    let decompressed = dict.decompress(&compressed).unwrap();

    assert_eq!(input.as_slice(), decompressed.as_slice());
}

#[cfg(feature = "dictionary")]
#[test]
fn test_empty_input() {
    let samples = vec![b"test".as_slice()];
    let dict = Dictionary::train(samples.into_iter(), 256).unwrap();

    let compressed = dict.compress(b"").unwrap();
    let decompressed = dict.decompress(&compressed).unwrap();

    assert_eq!(decompressed.len(), 0);
}

#[cfg(feature = "dictionary")]
#[test]
fn test_single_byte() {
    let samples = vec![b"a".as_slice(), b"b".as_slice()];
    let dict = Dictionary::train(samples.into_iter(), 256).unwrap();

    let input = b"c";
    let compressed = dict.compress(input).unwrap();
    let decompressed = dict.decompress(&compressed).unwrap();

    assert_eq!(input.as_slice(), decompressed.as_slice());
}

#[cfg(feature = "dictionary")]
#[test]
fn test_large_input() {
    let sample_a = vec![b'A'; 1000];
    let sample_b = vec![b'B'; 1000];
    let samples = vec![
        sample_a.as_slice(),
        sample_b.as_slice(),
    ];

    let dict = Dictionary::train(samples.into_iter(), 4096).unwrap();

    let input = vec![b'C'; 1000];
    let compressed = dict.compress(&input).unwrap();
    let decompressed = dict.decompress(&compressed).unwrap();

    assert_eq!(input, decompressed);
}

#[cfg(feature = "dictionary")]
#[test]
fn test_json_documents() {
    let samples = vec![
        br#"{"id":1,"name":"John","email":"john@test.com"}"#.as_slice(),
        br#"{"id":2,"name":"Jane","email":"jane@test.com"}"#.as_slice(),
        br#"{"id":3,"name":"Bob","email":"bob@test.com"}"#.as_slice(),
    ];

    let dict = Dictionary::train(samples.into_iter(), 2048).unwrap();

    let input = br#"{"id":4,"name":"Alice","email":"alice@test.com"}"#;
    let compressed = dict.compress(input).unwrap();
    let decompressed = dict.decompress(&compressed).unwrap();

    assert_eq!(input.as_slice(), decompressed.as_slice());

    // Should achieve some compression
    println!("Original: {} bytes, Compressed: {} bytes", input.len(), compressed.len());
}

#[cfg(feature = "dictionary")]
#[test]
fn test_sql_queries() {
    let samples = vec![
        b"SELECT * FROM users WHERE id = 1".as_slice(),
        b"SELECT * FROM users WHERE id = 2".as_slice(),
        b"SELECT * FROM users WHERE id = 3".as_slice(),
    ];

    let dict = Dictionary::train(samples.into_iter(), 1024).unwrap();

    let input = b"SELECT * FROM users WHERE id = 4";
    let compressed = dict.compress(input).unwrap();
    let decompressed = dict.decompress(&compressed).unwrap();

    assert_eq!(input.as_slice(), decompressed.as_slice());
}

#[cfg(feature = "dictionary")]
#[test]
fn test_game_logs() {
    let samples = vec![
        b"[INFO] Player joined game".as_slice(),
        b"[WARN] Connection timeout".as_slice(),
        b"[ERROR] Database error".as_slice(),
    ];

    let dict = Dictionary::train(samples.into_iter(), 512).unwrap();

    let input = b"[INFO] Player left game";
    let compressed = dict.compress(input).unwrap();
    let decompressed = dict.decompress(&compressed).unwrap();

    assert_eq!(input.as_slice(), decompressed.as_slice());
}

#[cfg(feature = "dictionary")]
#[test]
fn test_dictionary_size_limits() {
    let samples = vec![
        b"test data 1".as_slice(),
        b"test data 2".as_slice(),
    ];

    // Test minimum size
    let dict = Dictionary::train(samples.iter().copied(), 128).unwrap();
    assert!(dict.size() <= 128);

    // Test maximum size
    let dict = Dictionary::train(samples.iter().copied(), 64 * 1024).unwrap();
    assert!(dict.size() <= 64 * 1024);
}

#[cfg(feature = "dictionary")]
#[test]
fn test_repetitive_data() {
    let sample_a = vec![b'A'; 100];
    let sample_b = vec![b'B'; 100];
    let samples = vec![
        sample_a.as_slice(),
        sample_b.as_slice(),
    ];

    let dict = Dictionary::train(samples.into_iter(), 1024).unwrap();

    let input = vec![b'A'; 50];
    let compressed = dict.compress(&input).unwrap();
    let decompressed = dict.decompress(&compressed).unwrap();

    assert_eq!(input, decompressed);
}

#[cfg(feature = "dictionary")]
#[test]
fn test_no_common_patterns() {
    let samples = vec![
        b"aaaa".as_slice(),
        b"bbbb".as_slice(),
        b"cccc".as_slice(),
    ];

    let dict = Dictionary::train(samples.into_iter(), 512).unwrap();

    let input = b"dddd";
    let compressed = dict.compress(input).unwrap();
    let decompressed = dict.decompress(&compressed).unwrap();

    assert_eq!(input.as_slice(), decompressed.as_slice());
}

#[cfg(feature = "dictionary")]
#[test]
fn test_unicode_data() {
    let samples = vec![
        "Olá, Mundo!".as_bytes(),
        "Olá, Brasil!".as_bytes(),
    ];

    let dict = Dictionary::train(samples.into_iter(), 1024).unwrap();

    let input = "Olá, AvilaDB!".as_bytes();
    let compressed = dict.compress(input).unwrap();
    let decompressed = dict.decompress(&compressed).unwrap();

    assert_eq!(input, decompressed.as_slice());
}

#[cfg(feature = "dictionary")]
#[test]
fn test_multiple_compressions() {
    let samples = vec![
        b"prefix_data_suffix".as_slice(),
        b"prefix_value_suffix".as_slice(),
    ];

    let dict = Dictionary::train(samples.into_iter(), 1024).unwrap();

    // Compress multiple inputs with same dictionary
    let inputs = vec![
        b"prefix_test_suffix".as_slice(),
        b"prefix_demo_suffix".as_slice(),
        b"prefix_sample_suffix".as_slice(),
    ];

    for input in inputs {
        let compressed = dict.compress(input).unwrap();
        let decompressed = dict.decompress(&compressed).unwrap();
        assert_eq!(input, decompressed.as_slice());
    }
}

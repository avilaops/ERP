//! Native compression examples - Zero external dependencies!

use avila_arrow::compression::*;

fn main() {
    println!("🚀 avila-arrow Native Compression - No External Dependencies!\n");

    // ============= RLE COMPRESSION =============
    println!("📦 RLE (Run-Length Encoding)");
    println!("Best for: Repeated values\n");

    let repeated_data = vec![42u8; 10000];
    let rle_encoded = rle::encode(&repeated_data).unwrap();
    let compression_ratio = repeated_data.len() as f64 / rle_encoded.len() as f64;

    println!("Original:   {} bytes", repeated_data.len());
    println!("Compressed: {} bytes", rle_encoded.len());
    println!("Ratio:      {:.2}x compression! 🎯\n", compression_ratio);

    let decoded = rle::decode(&rle_encoded).unwrap();
    assert_eq!(decoded, repeated_data);
    println!("✅ RLE round-trip successful!\n");

    // ============= DELTA ENCODING =============
    println!("🔢 Delta Encoding");
    println!("Best for: Sequential/sorted data (timestamps, IDs)\n");

    // Simulate timestamps
    let base = 1700000000i64;
    let timestamps: Vec<i64> = (0..10000).map(|i| base + i * 1000).collect();

    let delta_encoded = delta::encode_i64(&timestamps).unwrap();
    let delta_ratio = (timestamps.len() * 8) as f64 / delta_encoded.len() as f64;

    println!("Original:   {} bytes ({} timestamps)", timestamps.len() * 8, timestamps.len());
    println!("Compressed: {} bytes", delta_encoded.len());
    println!("Ratio:      {:.2}x compression! 🎯\n", delta_ratio);

    let decoded_timestamps = delta::decode_i64(&delta_encoded).unwrap();
    assert_eq!(decoded_timestamps, timestamps);
    println!("✅ Delta round-trip successful!\n");

    // Delta with floats
    println!("📊 Delta with float64 data");
    let floats: Vec<f64> = (0..1000).map(|i| i as f64 * 0.1).collect();
    let float_encoded = delta::encode_f64(&floats).unwrap();
    let float_ratio = (floats.len() * 8) as f64 / float_encoded.len() as f64;

    println!("Original:   {} bytes", floats.len() * 8);
    println!("Compressed: {} bytes", float_encoded.len());
    println!("Ratio:      {:.2}x\n", float_ratio);

    // ============= DICTIONARY ENCODING =============
    println!("📚 Dictionary Encoding");
    println!("Best for: Low cardinality data (categories, enums)\n");

    // Categorical data
    let categories: Vec<u8> = (0..10000).map(|i| (i % 10) as u8).collect();
    let dict_encoded = dictionary::encode(&categories).unwrap();
    let dict_ratio = categories.len() as f64 / dict_encoded.len() as f64;

    println!("Original:   {} bytes (10 unique values, 10000 entries)", categories.len());
    println!("Compressed: {} bytes", dict_encoded.len());
    println!("Ratio:      {:.2}x compression! 🎯\n", dict_ratio);

    let decoded_dict = dictionary::decode(&dict_encoded).unwrap();
    assert_eq!(decoded_dict, categories);
    println!("✅ Dictionary round-trip successful!\n");

    // Dictionary with i64
    println!("🔢 Dictionary with integer data");
    let mut dict_encoder = DictionaryEncoderI64::new();
    for i in 0..10000 {
        dict_encoder.encode(i % 20); // Only 20 unique values
    }
    println!("Dictionary size: {} unique values", dict_encoder.dict_size());
    let (dict, indices) = dict_encoder.finish();
    println!("Storage: {} values + {} indices\n", dict.len(), indices.len());

    // ============= BIT-PACKING =============
    println!("🗜️  Bit-Packing");
    println!("Best for: Small integers (flags, counters)\n");

    // Small integers (0-15, needs only 4 bits each)
    let small_ints: Vec<i64> = (0..10000).map(|i| (i % 16) as i64).collect();
    let bit_width = bitpack::detect_bit_width(&small_ints);
    let packed = bitpack::pack(&small_ints, bit_width).unwrap();
    let pack_ratio = (small_ints.len() * 8) as f64 / packed.len() as f64;

    println!("Original:   {} bytes ({} i64 values)", small_ints.len() * 8, small_ints.len());
    println!("Detected:   {} bits per value", bit_width);
    println!("Compressed: {} bytes", packed.len());
    println!("Ratio:      {:.2}x compression! 🎯\n", pack_ratio);

    let unpacked = bitpack::unpack(&packed, bit_width, small_ints.len()).unwrap();
    assert_eq!(unpacked, small_ints);
    println!("✅ Bit-packing round-trip successful!\n");

    // ============= SUMMARY =============
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("📊 COMPRESSION SUMMARY");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("RLE:        {:.2}x  (repeated values)", compression_ratio);
    println!("Delta:      {:.2}x  (timestamps)", delta_ratio);
    println!("Dictionary: {:.2}x  (categorical)", dict_ratio);
    println!("Bit-Pack:   {:.2}x  (small integers)", pack_ratio);
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    println!("✨ All compression codecs working perfectly!");
    println!("🎉 Zero external dependencies - 100% native Rust!");
    println!("🚀 Ready for columnar data compression at scale!");
}

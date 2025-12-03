//! Large integer operations with U512, U1024, U2048, U4096
//!
//! Demonstrates working with very large integers for cryptography

use avila_primitives::{U512, U1024, U2048, U4096};

fn main() {
    println!("=== Large Integer Arithmetic ===\n");

    // U512 - 512 bits
    println!("--- U512 (512 bits) ---");
    let a512 = U512::from_u64(u64::MAX);
    let b512 = U512::from_u64(1);
    let sum512 = a512 + b512;

    println!("u64::MAX = 0x{:016x}", a512.to_u64());
    println!("u64::MAX + 1 (U512) = {}", sum512);
    println!("Leading zeros: {}", sum512.leading_zeros());
    println!("Trailing zeros: {}", sum512.trailing_zeros());

    // U1024 - 1024 bits (RSA-1024 size)
    println!("\n--- U1024 (1024 bits, RSA-1024) ---");
    let large1024 = U1024::from_u64(1) << 100;
    println!("2^100 = {}", large1024);
    println!("Leading zeros: {}", large1024.leading_zeros());
    println!("Trailing zeros: {}", large1024.trailing_zeros());

    // U2048 - 2048 bits (RSA-2048 size)
    println!("\n--- U2048 (2048 bits, RSA-2048) ---");
    let prime_candidate = U2048::from_u64(u64::MAX);
    let doubled = prime_candidate + prime_candidate;
    println!("Example value: {}", doubled);
    println!("Leading zeros: {}", doubled.leading_zeros());

    // U4096 - 4096 bits (RSA-4096 size)
    println!("\n--- U4096 (4096 bits, RSA-4096) ---");
    let huge = U4096::from_u64(12345678901234567890u64);
    println!("Huge number: {}", huge);
    println!("Trailing zeros: {}", huge.trailing_zeros());

    // Arithmetic across sizes
    println!("\n=== Cryptographic Operations ===\n");

    // Modular exponentiation simulation (simplified)
    let base = U512::from_u64(123);
    let exponent = 2u32;
    let mut result = base;
    for _ in 1..exponent {
        result = result * base;
    }
    println!("{}^{} (mod 2^512) = {}", base.to_u64(), exponent, result);

    // Byte conversions for key material
    println!("\n=== Byte Conversions ===\n");

    let key_material = U256::from_u64(0xDEADBEEF);
    let bytes = key_material.to_le_bytes();
    println!("Key material: 0x{:016x}", key_material.to_u64());
    println!("As bytes (first 8): {:02x?}", &bytes[..8]);

    let reconstructed = U256::from_le_bytes(&bytes);
    println!("Reconstructed: 0x{:016x}", reconstructed.to_u64());
    println!("Match: {}", key_material == reconstructed);

    // Constant-time operations for cryptography
    println!("\n=== Constant-Time Operations ===\n");

    let secret_key1 = U1024::from_u64(0x123456789ABCDEF0);
    let secret_key2 = U1024::from_u64(0x123456789ABCDEF0);
    let different_key = U1024::from_u64(0xFEDCBA9876543210);

    println!("Comparing secret keys (constant-time):");
    println!("key1 == key2: {}", secret_key1.ct_eq(&secret_key2));
    println!("key1 == different: {}", secret_key1.ct_eq(&different_key));

    // Bitwise operations for masking
    println!("\n=== Bitwise Masking ===\n");

    let data = U512::from_u64(0xFF00FF00);
    let mask = U512::from_u64(0x00FF00FF);
    let masked = data & mask;

    println!("Data:   0x{:08x}", data.to_u64());
    println!("Mask:   0x{:08x}", mask.to_u64());
    println!("Result: 0x{:08x}", masked.to_u64());

    // Use case: Large prime numbers
    println!("\n=== Prime Number Candidates ===\n");

    // In real cryptography, these would be actual primes
    let prime_candidate_2048 = U2048::from_u64(u64::MAX) << 1000;
    println!("2048-bit prime candidate:");
    println!("  Leading zeros: {}", prime_candidate_2048.leading_zeros());
    println!("  Is zero: {}", prime_candidate_2048.is_zero());

    println!("\n=== Summary ===");
    println!("✓ U256:  256 bits  (32 bytes)   - AES-256, SHA-256");
    println!("✓ U512:  512 bits  (64 bytes)   - SHA-512, EdDSA");
    println!("✓ U1024: 1024 bits (128 bytes)  - RSA-1024, DSA");
    println!("✓ U2048: 2048 bits (256 bytes)  - RSA-2048 (recommended)");
    println!("✓ U4096: 4096 bits (512 bytes)  - RSA-4096 (high security)");
}

use avila_primitives::U256;

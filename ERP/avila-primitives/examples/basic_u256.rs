//! Basic arithmetic operations with U256
//!
//! Demonstrates addition, subtraction, multiplication, and division
//! with 256-bit unsigned integers.

use avila_primitives::U256;

fn main() {
    println!("=== U256 Basic Arithmetic ===\n");

    // Create some 256-bit integers
    let a = U256::from_u64(1_000_000);
    let b = U256::from_u64(500_000);

    println!("a = {}", a);
    println!("b = {}\n", b);

    // Addition
    let sum = a + b;
    println!("a + b = {} ({})", sum, sum.to_u64());

    // Subtraction
    let diff = a - b;
    println!("a - b = {} ({})", diff, diff.to_u64());

    // Multiplication
    let product = a * b;
    println!("a * b = {} ({})", product, product.to_u64());

    // Division
    let quotient = a / b;
    println!("a / b = {} ({})", quotient, quotient.to_u64());

    // Remainder
    let remainder = a % b;
    println!("a % b = {} ({})", remainder, remainder.to_u64());

    println!("\n=== Large Number Operations ===\n");

    // Work with larger numbers
    let large = U256::from_u64(u64::MAX);
    println!("u64::MAX = {}", large);

    let doubled = large + large;
    println!("2 * u64::MAX = {}", doubled);

    // Comparison
    println!("\n=== Comparisons ===\n");
    println!("a > b: {}", a > b);
    println!("a == a: {}", a == a);
    println!("b < a: {}", b < a);

    // Bitwise operations
    println!("\n=== Bitwise Operations ===\n");
    let x = U256::from_u64(0b1010);
    let y = U256::from_u64(0b1100);

    println!("x = {:04b} ({})", x.to_u64(), x.to_u64());
    println!("y = {:04b} ({})", y.to_u64(), y.to_u64());
    println!("x & y = {:04b} ({})", (x & y).to_u64(), (x & y).to_u64());
    println!("x | y = {:04b} ({})", (x | y).to_u64(), (x | y).to_u64());
    println!("x ^ y = {:04b} ({})", (x ^ y).to_u64(), (x ^ y).to_u64());
    println!("!x = {}", !x);

    // Shifts
    println!("\n=== Shift Operations ===\n");
    let val = U256::from_u64(100);
    println!("val = {}", val);
    println!("val << 1 = {}", val << 1);
    println!("val >> 1 = {}", val >> 1);
    println!("val << 10 = {}", val << 10);

    // Constant-time equality
    println!("\n=== Constant-Time Operations ===\n");
    let secret1 = U256::from_u64(12345);
    let secret2 = U256::from_u64(12345);
    let secret3 = U256::from_u64(54321);

    println!("ct_eq(secret1, secret2): {}", secret1.ct_eq(&secret2));
    println!("ct_eq(secret1, secret3): {}", secret1.ct_eq(&secret3));
}

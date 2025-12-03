//! Working with signed 256-bit integers
//!
//! Demonstrates two's complement arithmetic with I256

use avila_primitives::I256;

fn main() {
    println!("=== I256 Signed Arithmetic ===\n");

    // Positive numbers
    let positive = I256::from_i64(1000);
    println!("positive = {}", positive);
    println!("is_negative: {}", positive.is_negative());

    // Negative numbers
    let negative = I256::from_i64(-500);
    println!("\nnegative = {}", negative);
    println!("is_negative: {}", negative.is_negative());

    // Addition with sign
    println!("\n=== Addition ===");
    let sum1 = positive + negative;
    println!("{} + {} = {}", positive, negative, sum1);

    let sum2 = negative + negative;
    println!("{} + {} = {}", negative, negative, sum2);

    // Subtraction
    println!("\n=== Subtraction ===");
    let diff = positive - negative;
    println!("{} - {} = {}", positive, negative, diff);

    // Multiplication
    println!("\n=== Multiplication ===");
    let a = I256::from_i64(10);
    let b = I256::from_i64(-5);
    let product = a * b;
    println!("{} * {} = {}", a, b, product);

    // Division
    println!("\n=== Division ===");
    let dividend = I256::from_i64(-100);
    let divisor = I256::from_i64(10);
    let quotient = dividend / divisor;
    println!("{} / {} = {}", dividend, divisor, quotient);

    // Absolute value
    println!("\n=== Absolute Value ===");
    let neg = I256::from_i64(-12345);
    let abs = neg.abs();
    println!("abs({}) = {}", neg, abs);

    // Negation
    println!("\n=== Negation ===");
    let val = I256::from_i64(42);
    let neg_val = -val;
    println!("-{} = {}", val, neg_val);
    println!("-{} = {}", neg_val, -neg_val);

    // Comparison
    println!("\n=== Comparisons ===");
    let small = I256::from_i64(-100);
    let large = I256::from_i64(100);

    println!("{} < {}: {}", small, large, small < large);
    println!("{} > {}: {}", large, small, large > small);
    println!("{} == {}: {}", small, small, small == small);

    // Bitwise operations preserve sign representation
    println!("\n=== Bitwise Operations ===");
    let x = I256::from_i64(10);
    let y = I256::from_i64(-5);

    println!("x = {}", x);
    println!("y = {}", y);
    println!("x & y = {}", x & y);
    println!("x | y = {}", x | y);
    println!("x ^ y = {}", x ^ y);
    println!("!x = {}", !x);

    // Arithmetic right shift (preserves sign)
    println!("\n=== Arithmetic Shift ===");
    let pos = I256::from_i64(100);
    let neg = I256::from_i64(-100);

    println!("{} >> 1 = {}", pos, pos >> 1);
    println!("{} >> 1 = {}", neg, neg >> 1);
    println!("{} << 1 = {}", pos, pos << 1);
    println!("{} << 1 = {}", neg, neg << 1);

    // Edge cases
    println!("\n=== Edge Cases ===");
    let zero = I256::from_i64(0);
    let max_pos = I256::from_i64(i64::MAX);
    let max_neg = I256::from_i64(i64::MIN + 1); // Avoid overflow with MIN

    println!("zero = {}", zero);
    println!("i64::MAX = {}", max_pos);
    println!("i64::MIN+1 = {}", max_neg);
    println!("abs(i64::MIN+1) = {}", max_neg.abs());
    println!("\nNote: i64::MIN itself would overflow on abs/negation");
}

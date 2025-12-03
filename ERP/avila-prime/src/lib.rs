//! # avila-prime - Prime Numbers
//!
//! Prime generation and testing for cryptographic applications.

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]

use avila_math::{is_prime, mod_exp};

/// Small prime constants for quick testing
pub const SMALL_PRIMES: [u64; 168] = [
    2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53,
    59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131,
    137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223,
    227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311,
    313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409,
    419, 421, 431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503,
    509, 521, 523, 541, 547, 557, 563, 569, 571, 577, 587, 593, 599, 601, 607, 613,
    617, 619, 631, 641, 643, 647, 653, 659, 661, 673, 677, 683, 691, 701, 709, 719,
    727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797, 809, 811, 821, 823, 827,
    829, 839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929, 937, 941,
    947, 953, 967, 971, 977, 983, 991, 997,
];

/// Fast primality test using trial division
pub fn is_prime_fast(n: u64) -> bool {
    if n < 2 {
        return false;
    }

    // Check against small primes
    for &p in &SMALL_PRIMES {
        if n == p {
            return true;
        }
        if n % p == 0 {
            return false;
        }
        if p * p > n {
            return true;
        }
    }

    // Use Miller-Rabin for larger numbers
    is_prime(n, 5)
}

/// Finds next prime >= n
pub fn next_prime(mut n: u64) -> Option<u64> {
    if n < 2 {
        return Some(2);
    }

    // Make odd
    if n % 2 == 0 {
        n += 1;
    }

    // Search for prime
    for _ in 0..1000 {
        if is_prime_fast(n) {
            return Some(n);
        }
        n = n.checked_add(2)?;
    }

    None
}

/// Finds previous prime <= n
pub fn prev_prime(mut n: u64) -> Option<u64> {
    if n <= 2 {
        return None;
    }
    if n == 3 {
        return Some(2);
    }

    // Make odd
    if n % 2 == 0 {
        n -= 1;
    }

    // Search backward
    while n > 2 {
        if is_prime_fast(n) {
            return Some(n);
        }
        n = n.checked_sub(2)?;
    }

    Some(2)
}

/// Sophie Germain prime test: p is prime and 2p+1 is prime
pub fn is_sophie_germain(p: u64) -> bool {
    if !is_prime_fast(p) {
        return false;
    }

    match p.checked_mul(2) {
        Some(q) => match q.checked_add(1) {
            Some(safe) => is_prime_fast(safe),
            None => false,
        },
        None => false,
    }
}

/// Safe prime test: p is prime and (p-1)/2 is prime
pub fn is_safe_prime(p: u64) -> bool {
    if !is_prime_fast(p) {
        return false;
    }

    if p <= 2 {
        return false;
    }

    let q = (p - 1) / 2;
    is_prime_fast(q)
}

/// Prelude
pub mod prelude {
    pub use crate::{
        is_prime_fast, next_prime, prev_prime,
        is_sophie_germain, is_safe_prime,
        SMALL_PRIMES,
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_small_primes() {
        assert!(is_prime_fast(2));
        assert!(is_prime_fast(3));
        assert!(is_prime_fast(17));
        assert!(is_prime_fast(97));
    }

    #[test]
    fn test_composites() {
        assert!(!is_prime_fast(4));
        assert!(!is_prime_fast(100));
        assert!(!is_prime_fast(1000));
    }

    #[test]
    fn test_next_prime() {
        assert_eq!(next_prime(10), Some(11));
        assert_eq!(next_prime(14), Some(17));
        assert_eq!(next_prime(2), Some(2));
    }

    #[test]
    fn test_prev_prime() {
        assert_eq!(prev_prime(10), Some(7));
        assert_eq!(prev_prime(14), Some(13));
        assert_eq!(prev_prime(2), None);
    }

    #[test]
    fn test_sophie_germain() {
        assert!(is_sophie_germain(2));  // 2*2+1 = 5
        assert!(is_sophie_germain(3));  // 2*3+1 = 7
        assert!(is_sophie_germain(5));  // 2*5+1 = 11
        assert!(!is_sophie_germain(7)); // 2*7+1 = 15 (not prime)
    }

    #[test]
    fn test_safe_prime() {
        assert!(is_safe_prime(5));  // (5-1)/2 = 2
        assert!(is_safe_prime(7));  // (7-1)/2 = 3
        assert!(is_safe_prime(11)); // (11-1)/2 = 5
        assert!(!is_safe_prime(13)); // (13-1)/2 = 6 (not prime)
    }
}

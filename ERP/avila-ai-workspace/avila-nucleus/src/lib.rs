//! # Ávila Nucleus
//!
//! Operações atômicas de baixo nível - o núcleo de todas as operações criptográficas.
//! Zero dependencies, apenas Rust puro e intrinsics SIMD.
//!
//! ## Filosofia
//! - Stack-only operations
//! - Constant-time quando necessário (previne timing attacks)
//! - SIMD otimizado (AVX2/AVX-512)
//! - Zero heap allocations

#![no_std]
#![deny(unsafe_op_in_unsafe_fn)]
#![warn(missing_docs)]

pub mod bits;
pub mod simd;

/// Adição de 64 bits com carry
///
/// Retorna (soma, carry_out)
#[inline(always)]
pub const fn adc(a: u64, b: u64, carry_in: u64) -> (u64, u64) {
    let sum = (a as u128) + (b as u128) + (carry_in as u128);
    (sum as u64, (sum >> 64) as u64)
}

/// Subtração de 64 bits com borrow
///
/// Retorna (diferença, borrow_out)
#[inline(always)]
pub const fn sbb(a: u64, b: u64, borrow_in: u64) -> (u64, u64) {
    let diff = (a as u128).wrapping_sub(b as u128).wrapping_sub(borrow_in as u128);
    (diff as u64, if diff >> 64 != 0 { 1 } else { 0 })
}

/// Multiplicação de 64 bits com resultado de 128 bits
///
/// Retorna (low, high)
#[inline(always)]
pub const fn mul_wide(a: u64, b: u64) -> (u64, u64) {
    let prod = (a as u128) * (b as u128);
    (prod as u64, (prod >> 64) as u64)
}

/// Multiply-add com carry: a * b + c + carry
///
/// Retorna (low, high)
#[inline(always)]
pub const fn mac(a: u64, b: u64, c: u64, carry: u64) -> (u64, u64) {
    let prod = (a as u128) * (b as u128) + (c as u128) + (carry as u128);
    (prod as u64, (prod >> 64) as u64)
}

/// Seleção constant-time
///
/// Se condition = true, retorna if_true, senão retorna if_false
/// Sem branches - resistente a timing attacks
#[inline(always)]
pub const fn select_u64(condition: bool, if_true: u64, if_false: u64) -> u64 {
    let mask = (condition as u64).wrapping_neg();
    (if_true & mask) | (if_false & !mask)
}

/// Swap condicional constant-time
///
/// Se condition = true, troca a e b
#[inline(always)]
pub const fn cswap_u64(condition: bool, a: u64, b: u64) -> (u64, u64) {
    let mask = (condition as u64).wrapping_neg();
    let xor = (a ^ b) & mask;
    (a ^ xor, b ^ xor)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adc() {
        let (sum, carry) = adc(u64::MAX, 1, 0);
        assert_eq!(sum, 0);
        assert_eq!(carry, 1);

        let (sum, carry) = adc(u64::MAX, 1, 1);
        assert_eq!(sum, 1);
        assert_eq!(carry, 1);
    }

    #[test]
    fn test_sbb() {
        let (diff, borrow) = sbb(0, 1, 0);
        assert_eq!(diff, u64::MAX);
        assert_eq!(borrow, 1);
    }

    #[test]
    fn test_mul_wide() {
        let (low, high) = mul_wide(u64::MAX, u64::MAX);
        assert_eq!(low, 1);
        assert_eq!(high, u64::MAX - 1);
    }

    #[test]
    fn test_select_constant_time() {
        assert_eq!(select_u64(true, 42, 99), 42);
        assert_eq!(select_u64(false, 42, 99), 99);
    }

    #[test]
    fn test_cswap() {
        let (a, b) = cswap_u64(true, 10, 20);
        assert_eq!(a, 20);
        assert_eq!(b, 10);

        let (a, b) = cswap_u64(false, 10, 20);
        assert_eq!(a, 10);
        assert_eq!(b, 20);
    }
}

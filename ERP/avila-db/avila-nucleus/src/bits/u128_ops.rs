//! Operações auxiliares sobre valores de 128 bits expressos em duas words `u64`.
//! Mantemos todas as combinações necessárias para composição de limbs maiores.

use crate::bits::{adc, mul_wide, sbb};

/// Soma dois valores de 128 bits representados por (lo, hi).
#[inline(always)]
pub const fn add128(a_lo: u64, a_hi: u64, b_lo: u64, b_hi: u64) -> (u64, u64, u64) {
    let (lo, carry) = adc(a_lo, b_lo, 0);
    let (hi, carry_hi) = adc(a_hi, b_hi, carry);
    (lo, hi, carry_hi)
}

/// Subtrai dois valores de 128 bits representados por (lo, hi).
#[inline(always)]
pub const fn sub128(a_lo: u64, a_hi: u64, b_lo: u64, b_hi: u64) -> (u64, u64, u64) {
    let (lo, borrow) = sbb(a_lo, b_lo, 0);
    let (hi, borrow_hi) = sbb(a_hi, b_hi, borrow);
    (lo, hi, borrow_hi)
}

/// Multiplicação de 128 (lo, hi) por 64 bits, retornando 192 bits.
#[inline(always)]
pub const fn mul128x64(a_lo: u64, a_hi: u64, b: u64) -> (u64, u64, u64) {
    let (lo, carry) = mul_wide(a_lo, b);
    let (mid, hi) = mul_wide(a_hi, b);

    let (mid, carry_mid) = adc(mid, carry, 0);
    let hi = hi + carry_mid;
    (lo, mid, hi)
}

/// Shift lógico à esquerda em 128 bits.
#[inline(always)]
pub const fn shl128(lo: u64, hi: u64, shift: u32) -> (u64, u64) {
    if shift == 0 {
        (lo, hi)
    } else if shift < 64 {
        let new_lo = lo << shift;
        let new_hi = (hi << shift) | (lo >> (64 - shift));
        (new_lo, new_hi)
    } else if shift < 128 {
        (0, lo << (shift - 64))
    } else {
        (0, 0)
    }
}

/// Shift lógico à direita em 128 bits.
#[inline(always)]
pub const fn shr128(lo: u64, hi: u64, shift: u32) -> (u64, u64) {
    if shift == 0 {
        (lo, hi)
    } else if shift < 64 {
        let new_lo = (lo >> shift) | (hi << (64 - shift));
        let new_hi = hi >> shift;
        (new_lo, new_hi)
    } else if shift < 128 {
        (hi >> (shift - 64), 0)
    } else {
        (0, 0)
    }
}

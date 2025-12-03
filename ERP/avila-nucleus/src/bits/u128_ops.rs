//! Operações em u128 e construção de tipos maiores
//!
//! Operações para manipular valores 128-bit e construir tipos ainda maiores

use super::u64_ops::*;

/// Adição 128-bit com carry: (a_lo, a_hi) + (b_lo, b_hi) → (sum_lo, sum_hi, carry_out)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::add128;
///
/// let (lo, hi, carry) = add128(10, 0, 20, 0);
/// assert_eq!(lo, 30);
/// assert_eq!(hi, 0);
/// assert_eq!(carry, 0);
///
/// // Overflow
/// let (lo, hi, carry) = add128(u64::MAX, u64::MAX, 1, 0);
/// assert_eq!(lo, 0);
/// assert_eq!(hi, 0);
/// assert_eq!(carry, 1);
/// ```
#[inline(always)]
pub const fn add128(a_lo: u64, a_hi: u64, b_lo: u64, b_hi: u64) -> (u64, u64, u64) {
    let (sum_lo, carry) = adc(a_lo, b_lo, 0);
    let (sum_hi, carry_out) = adc(a_hi, b_hi, carry);
    (sum_lo, sum_hi, carry_out)
}

/// Subtração 128-bit com borrow: (a_lo, a_hi) - (b_lo, b_hi) → (diff_lo, diff_hi, borrow_out)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::sub128;
///
/// let (lo, hi, borrow) = sub128(30, 0, 10, 0);
/// assert_eq!(lo, 20);
/// assert_eq!(hi, 0);
/// assert_eq!(borrow, 0);
///
/// // Underflow
/// let (lo, hi, borrow) = sub128(0, 0, 1, 0);
/// assert_eq!(lo, u64::MAX);
/// assert_eq!(hi, u64::MAX);
/// assert_eq!(borrow, 1);
/// ```
#[inline(always)]
pub const fn sub128(a_lo: u64, a_hi: u64, b_lo: u64, b_hi: u64) -> (u64, u64, u64) {
    let (diff_lo, borrow) = sbb(a_lo, b_lo, 0);
    let (diff_hi, borrow_out) = sbb(a_hi, b_hi, borrow);
    (diff_lo, diff_hi, borrow_out)
}

/// Multiplicação 128x64 → 192: (a_lo, a_hi) * b → (prod_lo, prod_mid, prod_hi)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::mul128x64;
///
/// let (lo, mid, hi) = mul128x64(2, 0, 3);
/// assert_eq!(lo, 6);
/// assert_eq!(mid, 0);
/// assert_eq!(hi, 0);
/// ```
#[inline(always)]
pub const fn mul128x64(a_lo: u64, a_hi: u64, b: u64) -> (u64, u64, u64) {
    let (prod_lo, carry) = mul_wide(a_lo, b);
    let (prod_mid, prod_hi) = mac(a_hi, b, carry);
    (prod_lo, prod_mid, prod_hi)
}

/// Multiplicação 128x128 → 256: (a_lo, a_hi) * (b_lo, b_hi) → [u64; 4]
///
/// Retorna array [limb0, limb1, limb2, limb3] em little-endian
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::mul128x128;
///
/// let result = mul128x128(2, 0, 3, 0);
/// assert_eq!(result, [6, 0, 0, 0]);
/// ```
#[inline(always)]
pub const fn mul128x128(a_lo: u64, a_hi: u64, b_lo: u64, b_hi: u64) -> [u64; 4] {
    // a_lo * b_lo
    let (r0, carry) = mul_wide(a_lo, b_lo);

    // a_lo * b_hi + a_hi * b_lo + carry
    let (t1, c1) = mac(a_lo, b_hi, carry);
    let (r1, c2) = mac(a_hi, b_lo, t1);
    let carry2 = c1 + c2;

    // a_hi * b_hi + carry2
    let (r2, r3) = mac(a_hi, b_hi, carry2);

    [r0, r1, r2, r3]
}

/// Shift left 128-bit: (lo, hi) << shift → (new_lo, new_hi)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::shl128;
///
/// let (lo, hi) = shl128(1, 0, 1);
/// assert_eq!(lo, 2);
/// assert_eq!(hi, 0);
///
/// let (lo, hi) = shl128(1, 0, 64);
/// assert_eq!(lo, 0);
/// assert_eq!(hi, 1);
/// ```
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

/// Shift right 128-bit: (lo, hi) >> shift → (new_lo, new_hi)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::shr128;
///
/// let (lo, hi) = shr128(2, 0, 1);
/// assert_eq!(lo, 1);
/// assert_eq!(hi, 0);
///
/// let (lo, hi) = shr128(0, 1, 64);
/// assert_eq!(lo, 1);
/// assert_eq!(hi, 0);
/// ```
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

/// Comparação 128-bit: a == b (constant-time)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::eq128;
///
/// assert!(eq128(5, 10, 5, 10));
/// assert!(!eq128(5, 10, 5, 11));
/// ```
#[inline(always)]
pub const fn eq128(a_lo: u64, a_hi: u64, b_lo: u64, b_hi: u64) -> bool {
    let diff_lo = a_lo ^ b_lo;
    let diff_hi = a_hi ^ b_hi;
    (diff_lo | diff_hi) == 0
}

/// Comparação 128-bit: a < b (constant-time)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::lt128;
///
/// assert!(lt128(5, 0, 10, 0));
/// assert!(!lt128(10, 0, 5, 0));
/// assert!(lt128(5, 0, 5, 1));
/// ```
#[inline(always)]
pub const fn lt128(a_lo: u64, a_hi: u64, b_lo: u64, b_hi: u64) -> bool {
    if a_hi != b_hi {
        a_hi < b_hi
    } else {
        a_lo < b_lo
    }
}

/// Comparação 128-bit: a > b (constant-time)
#[inline(always)]
pub const fn gt128(a_lo: u64, a_hi: u64, b_lo: u64, b_hi: u64) -> bool {
    lt128(b_lo, b_hi, a_lo, a_hi)
}

/// Comparação 128-bit: a <= b
#[inline(always)]
pub const fn le128(a_lo: u64, a_hi: u64, b_lo: u64, b_hi: u64) -> bool {
    !gt128(a_lo, a_hi, b_lo, b_hi)
}

/// Comparação 128-bit: a >= b
#[inline(always)]
pub const fn ge128(a_lo: u64, a_hi: u64, b_lo: u64, b_hi: u64) -> bool {
    !lt128(a_lo, a_hi, b_lo, b_hi)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add128() {
        let (lo, hi, carry) = add128(10, 0, 20, 0);
        assert_eq!(lo, 30);
        assert_eq!(hi, 0);
        assert_eq!(carry, 0);

        let (lo, hi, carry) = add128(u64::MAX, 0, 1, 0);
        assert_eq!(lo, 0);
        assert_eq!(hi, 1);
        assert_eq!(carry, 0);

        let (lo, hi, carry) = add128(u64::MAX, u64::MAX, 1, 0);
        assert_eq!(lo, 0);
        assert_eq!(hi, 0);
        assert_eq!(carry, 1);
    }

    #[test]
    fn test_mul128x128() {
        let result = mul128x128(2, 0, 3, 0);
        assert_eq!(result, [6, 0, 0, 0]);

        let result = mul128x128(u64::MAX, 0, u64::MAX, 0);
        assert_eq!(result[0], 1);
        assert!(result[1] > 0);
    }

    #[test]
    fn test_shl128() {
        let (lo, hi) = shl128(1, 0, 1);
        assert_eq!(lo, 2);
        assert_eq!(hi, 0);

        let (lo, hi) = shl128(1, 0, 64);
        assert_eq!(lo, 0);
        assert_eq!(hi, 1);

        let (lo, hi) = shl128(u64::MAX, 0, 1);
        assert_eq!(lo, u64::MAX - 1);
        assert_eq!(hi, 1);
    }

    #[test]
    fn test_comparisons() {
        assert!(eq128(5, 10, 5, 10));
        assert!(!eq128(5, 10, 5, 11));

        assert!(lt128(5, 0, 10, 0));
        assert!(!lt128(10, 0, 5, 0));
        assert!(lt128(5, 0, 5, 1));

        assert!(gt128(10, 0, 5, 0));
        assert!(!gt128(5, 0, 10, 0));
    }
}

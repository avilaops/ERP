//! Operações U512 (8 limbs × 64-bit)
//!
//! Aritmética de 512-bit usando representação little-endian:
//! [limb0, limb1, ..., limb7] onde limb0 = bits menos significativos.

use super::u64_ops::*;

/// Adição U512: a + b → (soma, carry)
///
/// Retorna (soma, carry_out) onde carry_out = 1 se overflow.
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::add512;
///
/// let a = [1, 0, 0, 0, 0, 0, 0, 0];
/// let b = [2, 0, 0, 0, 0, 0, 0, 0];
/// let (sum, carry) = add512(&a, &b);
/// assert_eq!(sum[0], 3);
/// assert_eq!(carry, 0);
/// ```
#[inline]
pub const fn add512(a: &[u64; 8], b: &[u64; 8]) -> ([u64; 8], u64) {
    let mut result = [0u64; 8];
    let mut carry = 0u64;

    let (r0, c0) = adc(a[0], b[0], 0);
    result[0] = r0;
    carry = c0;

    let (r1, c1) = adc(a[1], b[1], carry);
    result[1] = r1;
    carry = c1;

    let (r2, c2) = adc(a[2], b[2], carry);
    result[2] = r2;
    carry = c2;

    let (r3, c3) = adc(a[3], b[3], carry);
    result[3] = r3;
    carry = c3;

    let (r4, c4) = adc(a[4], b[4], carry);
    result[4] = r4;
    carry = c4;

    let (r5, c5) = adc(a[5], b[5], carry);
    result[5] = r5;
    carry = c5;

    let (r6, c6) = adc(a[6], b[6], carry);
    result[6] = r6;
    carry = c6;

    let (r7, c7) = adc(a[7], b[7], carry);
    result[7] = r7;

    (result, c7)
}

/// Subtração U512: a - b → (diferença, borrow)
///
/// Retorna (diferença, borrow_out) onde borrow_out = 1 se underflow.
#[inline]
pub const fn sub512(a: &[u64; 8], b: &[u64; 8]) -> ([u64; 8], u64) {
    let mut result = [0u64; 8];
    let mut borrow = 0u64;

    let (r0, b0) = sbb(a[0], b[0], 0);
    result[0] = r0;
    borrow = b0;

    let (r1, b1) = sbb(a[1], b[1], borrow);
    result[1] = r1;
    borrow = b1;

    let (r2, b2) = sbb(a[2], b[2], borrow);
    result[2] = r2;
    borrow = b2;

    let (r3, b3) = sbb(a[3], b[3], borrow);
    result[3] = r3;
    borrow = b3;

    let (r4, b4) = sbb(a[4], b[4], borrow);
    result[4] = r4;
    borrow = b4;

    let (r5, b5) = sbb(a[5], b[5], borrow);
    result[5] = r5;
    borrow = b5;

    let (r6, b6) = sbb(a[6], b[6], borrow);
    result[6] = r6;
    borrow = b6;

    let (r7, b7) = sbb(a[7], b[7], borrow);
    result[7] = r7;

    (result, b7)
}

/// Multiplicação U512 × U64 → U576 (result em [u64; 9])
///
/// Multiplica número de 512-bit por escalar de 64-bit.
#[inline]
pub const fn mul512x64(a: &[u64; 8], b: u64) -> [u64; 9] {
    let mut result = [0u64; 9];
    let mut carry = 0u64;

    let (lo, hi) = mul_wide(a[0], b);
    result[0] = lo;
    carry = hi;

    let (prod, hi) = mul_wide(a[1], b);
    let (sum, c) = adc(prod, carry, 0);
    result[1] = sum;
    carry = hi + c;

    let (prod, hi) = mul_wide(a[2], b);
    let (sum, c) = adc(prod, carry, 0);
    result[2] = sum;
    carry = hi + c;

    let (prod, hi) = mul_wide(a[3], b);
    let (sum, c) = adc(prod, carry, 0);
    result[3] = sum;
    carry = hi + c;

    let (prod, hi) = mul_wide(a[4], b);
    let (sum, c) = adc(prod, carry, 0);
    result[4] = sum;
    carry = hi + c;

    let (prod, hi) = mul_wide(a[5], b);
    let (sum, c) = adc(prod, carry, 0);
    result[5] = sum;
    carry = hi + c;

    let (prod, hi) = mul_wide(a[6], b);
    let (sum, c) = adc(prod, carry, 0);
    result[6] = sum;
    carry = hi + c;

    let (prod, hi) = mul_wide(a[7], b);
    let (sum, c) = adc(prod, carry, 0);
    result[7] = sum;
    carry = hi + c;

    result[8] = carry;

    result
}

/// Multiplicação U512 × U512 → U1024
///
/// Usa schoolbook multiplication (pode ser otimizado com Karatsuba).
#[inline]
pub fn mul512x512(a: &[u64; 8], b: &[u64; 8]) -> [u64; 16] {
    let mut result = [0u64; 16];

    for i in 0..8 {
        let mut carry = 0u64;

        for j in 0..8 {
            let (lo, hi) = mul_wide(a[i], b[j]);

            let (sum, c1) = adc(result[i + j], lo, 0);
            result[i + j] = sum;

            let (sum2, c2) = adc(result[i + j + 1], hi, c1);
            result[i + j + 1] = sum2;

            carry = c2;
        }

        // Propaga carry final
        if carry != 0 && i + 8 < 16 {
            let mut k = i + 8;
            while carry != 0 && k < 16 {
                let (sum, c) = result[k].overflowing_add(carry);
                result[k] = sum;
                carry = c as u64;
                k += 1;
            }
        }
    }

    result
}

/// Shift left U512 por bits (0 ≤ bits < 64)
///
/// Shift dentro de um limb.
#[inline]
pub const fn shl512(a: &[u64; 8], bits: u32) -> [u64; 8] {
    if bits == 0 {
        return *a;
    }

    let mut result = [0u64; 8];
    let shift_right = 64 - bits;

    result[0] = a[0] << bits;
    result[1] = (a[1] << bits) | (a[0] >> shift_right);
    result[2] = (a[2] << bits) | (a[1] >> shift_right);
    result[3] = (a[3] << bits) | (a[2] >> shift_right);
    result[4] = (a[4] << bits) | (a[3] >> shift_right);
    result[5] = (a[5] << bits) | (a[4] >> shift_right);
    result[6] = (a[6] << bits) | (a[5] >> shift_right);
    result[7] = (a[7] << bits) | (a[6] >> shift_right);

    result
}

/// Shift right U512 por bits (0 ≤ bits < 64)
#[inline]
pub const fn shr512(a: &[u64; 8], bits: u32) -> [u64; 8] {
    if bits == 0 {
        return *a;
    }

    let mut result = [0u64; 8];
    let shift_left = 64 - bits;

    result[7] = a[7] >> bits;
    result[6] = (a[6] >> bits) | (a[7] << shift_left);
    result[5] = (a[5] >> bits) | (a[6] << shift_left);
    result[4] = (a[4] >> bits) | (a[5] << shift_left);
    result[3] = (a[3] >> bits) | (a[4] << shift_left);
    result[2] = (a[2] >> bits) | (a[3] << shift_left);
    result[1] = (a[1] >> bits) | (a[2] << shift_left);
    result[0] = (a[0] >> bits) | (a[1] << shift_left);

    result
}

/// Igualdade U512: a == b
#[inline]
pub const fn eq512(a: &[u64; 8], b: &[u64; 8]) -> bool {
    (a[0] == b[0])
        & (a[1] == b[1])
        & (a[2] == b[2])
        & (a[3] == b[3])
        & (a[4] == b[4])
        & (a[5] == b[5])
        & (a[6] == b[6])
        & (a[7] == b[7])
}

/// Less than U512: a < b
#[inline]
pub const fn lt512(a: &[u64; 8], b: &[u64; 8]) -> bool {
    let mut i = 7;
    loop {
        if a[i] < b[i] {
            return true;
        }
        if a[i] > b[i] {
            return false;
        }
        if i == 0 {
            break;
        }
        i -= 1;
    }
    false
}

/// Greater than U512: a > b
#[inline]
pub const fn gt512(a: &[u64; 8], b: &[u64; 8]) -> bool {
    lt512(b, a)
}

/// Less than or equal U512: a <= b
#[inline]
pub const fn le512(a: &[u64; 8], b: &[u64; 8]) -> bool {
    !gt512(a, b)
}

/// Greater than or equal U512: a >= b
#[inline]
pub const fn ge512(a: &[u64; 8], b: &[u64; 8]) -> bool {
    !lt512(a, b)
}

/// Conta leading zeros em U512
#[inline]
pub const fn leading_zeros512(a: &[u64; 8]) -> u32 {
    if a[7] != 0 {
        return a[7].leading_zeros();
    }
    if a[6] != 0 {
        return 64 + a[6].leading_zeros();
    }
    if a[5] != 0 {
        return 128 + a[5].leading_zeros();
    }
    if a[4] != 0 {
        return 192 + a[4].leading_zeros();
    }
    if a[3] != 0 {
        return 256 + a[3].leading_zeros();
    }
    if a[2] != 0 {
        return 320 + a[2].leading_zeros();
    }
    if a[1] != 0 {
        return 384 + a[1].leading_zeros();
    }
    if a[0] != 0 {
        return 448 + a[0].leading_zeros();
    }
    512
}

/// Verifica se é zero
#[inline]
pub const fn is_zero512(a: &[u64; 8]) -> bool {
    (a[0] | a[1] | a[2] | a[3] | a[4] | a[5] | a[6] | a[7]) == 0
}

/// Verifica se é par
#[inline]
pub const fn is_even512(a: &[u64; 8]) -> bool {
    (a[0] & 1) == 0
}

/// Divisão U512: a / b → (quotient, remainder)
pub fn div512(a: &[u64; 8], b: &[u64; 8]) -> ([u64; 8], [u64; 8]) {
    if is_zero512(b) {
        return ([0; 8], *a);
    }

    if lt512(a, b) {
        return ([0; 8], *a);
    }

    if eq512(a, b) {
        return ([1, 0, 0, 0, 0, 0, 0, 0], [0; 8]);
    }

    let mut quotient = [0u64; 8];
    let mut remainder = [0u64; 8];

    for i in (0..512).rev() {
        remainder = shl512(&remainder, 1);

        let limb_idx = i / 64;
        let bit_idx = i % 64;
        if (a[limb_idx] >> bit_idx) & 1 == 1 {
            remainder[0] |= 1;
        }

        if ge512(&remainder, b) {
            let (new_remainder, _) = sub512(&remainder, b);
            remainder = new_remainder;

            let q_limb = i / 64;
            let q_bit = i % 64;
            quotient[q_limb] |= 1u64 << q_bit;
        }
    }

    (quotient, remainder)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add512() {
        let a = [1, 0, 0, 0, 0, 0, 0, 0];
        let b = [2, 0, 0, 0, 0, 0, 0, 0];
        let (sum, carry) = add512(&a, &b);
        assert_eq!(sum[0], 3);
        assert_eq!(carry, 0);

        let a = [u64::MAX, 0, 0, 0, 0, 0, 0, 0];
        let b = [1, 0, 0, 0, 0, 0, 0, 0];
        let (sum, carry) = add512(&a, &b);
        assert_eq!(sum[0], 0);
        assert_eq!(sum[1], 1);
        assert_eq!(carry, 0);
    }

    #[test]
    fn test_sub512() {
        let a = [3, 0, 0, 0, 0, 0, 0, 0];
        let b = [2, 0, 0, 0, 0, 0, 0, 0];
        let (diff, borrow) = sub512(&a, &b);
        assert_eq!(diff[0], 1);
        assert_eq!(borrow, 0);
    }

    #[test]
    fn test_mul512x64() {
        let a = [2, 0, 0, 0, 0, 0, 0, 0];
        let result = mul512x64(&a, 3);
        assert_eq!(result[0], 6);
        assert_eq!(result[8], 0);
    }

    #[test]
    fn test_mul512x512() {
        let a = [2, 0, 0, 0, 0, 0, 0, 0];
        let b = [3, 0, 0, 0, 0, 0, 0, 0];
        let result = mul512x512(&a, &b);
        assert_eq!(result[0], 6);
        for i in 1..16 {
            assert_eq!(result[i], 0);
        }
    }

    #[test]
    fn test_shl512() {
        let a = [1, 0, 0, 0, 0, 0, 0, 0];
        let result = shl512(&a, 1);
        assert_eq!(result[0], 2);

        let a = [u64::MAX, 0, 0, 0, 0, 0, 0, 0];
        let result = shl512(&a, 1);
        assert_eq!(result[0], u64::MAX - 1);
        assert_eq!(result[1], 1);
    }

    #[test]
    fn test_comparisons() {
        let a = [1, 0, 0, 0, 0, 0, 0, 0];
        let b = [2, 0, 0, 0, 0, 0, 0, 0];

        assert!(lt512(&a, &b));
        assert!(gt512(&b, &a));
        assert!(eq512(&a, &a));
    }

    #[test]
    fn test_leading_zeros512() {
        let a = [0, 0, 0, 0, 0, 0, 0, 1];
        assert_eq!(leading_zeros512(&a), 63);

        let a = [1, 0, 0, 0, 0, 0, 0, 0];
        assert_eq!(leading_zeros512(&a), 448 + 63);
    }
}

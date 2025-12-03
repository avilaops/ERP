//! Operações U2048 (32 limbs × 64-bit)
//!
//! Aritmética de 2048-bit para RSA-2048.

use super::u64_ops::*;

/// Adição U2048
#[inline]
pub const fn add2048(a: &[u64; 32], b: &[u64; 32]) -> ([u64; 32], u64) {
    let mut result = [0u64; 32];
    let mut carry = 0u64;

    let mut i = 0;
    while i < 32 {
        let (r, c) = adc(a[i], b[i], carry);
        result[i] = r;
        carry = c;
        i += 1;
    }

    (result, carry)
}

/// Subtração U2048
#[inline]
pub const fn sub2048(a: &[u64; 32], b: &[u64; 32]) -> ([u64; 32], u64) {
    let mut result = [0u64; 32];
    let mut borrow = 0u64;

    let mut i = 0;
    while i < 32 {
        let (r, b) = sbb(a[i], b[i], borrow);
        result[i] = r;
        borrow = b;
        i += 1;
    }

    (result, borrow)
}

/// Multiplicação U2048 × U64
#[inline]
pub const fn mul2048x64(a: &[u64; 32], b: u64) -> [u64; 33] {
    let mut result = [0u64; 33];
    let mut carry = 0u64;

    let mut i = 0;
    while i < 32 {
        let (lo, hi) = mul_wide(a[i], b);
        let (sum, c) = adc(lo, carry, 0);
        result[i] = sum;
        carry = hi + c;
        i += 1;
    }

    result[32] = carry;
    result
}

/// Shift left U2048
#[inline]
pub const fn shl2048(a: &[u64; 32], bits: u32) -> [u64; 32] {
    if bits == 0 {
        return *a;
    }
    if bits >= 2048 {
        return [0u64; 32];
    }

    let mut result = [0u64; 32];
    let word_shift = (bits / 64) as usize;
    let bit_shift = bits % 64;

    if bit_shift == 0 {
        // Simple word shift
        let mut i = word_shift;
        while i < 32 {
            result[i] = a[i - word_shift];
            i += 1;
        }
    } else {
        let shift_right = 64 - bit_shift;
        result[word_shift] = a[0] << bit_shift;

        let mut i = word_shift + 1;
        while i < 32 {
            let src_idx = i - word_shift;
            if src_idx < 32 {
                result[i] = (a[src_idx] << bit_shift) | (a[src_idx - 1] >> shift_right);
            }
            i += 1;
        }
    }

    result
}

/// Shift right U2048
#[inline]
pub const fn shr2048(a: &[u64; 32], bits: u32) -> [u64; 32] {
    if bits == 0 {
        return *a;
    }

    let mut result = [0u64; 32];
    let shift_left = 64 - bits;

    result[31] = a[31] >> bits;

    let mut i = 30;
    loop {
        result[i] = (a[i] >> bits) | (a[i + 1] << shift_left);
        if i == 0 {
            break;
        }
        i -= 1;
    }

    result
}

/// Comparações U2048
#[inline]
pub const fn eq2048(a: &[u64; 32], b: &[u64; 32]) -> bool {
    let mut i = 0;
    while i < 32 {
        if a[i] != b[i] {
            return false;
        }
        i += 1;
    }
    true
}

#[inline]
pub const fn lt2048(a: &[u64; 32], b: &[u64; 32]) -> bool {
    let mut i = 31;
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

#[inline]
pub const fn is_zero2048(a: &[u64; 32]) -> bool {
    let mut acc = 0u64;
    let mut i = 0;
    while i < 32 {
        acc |= a[i];
        i += 1;
    }
    acc == 0
}

#[inline]
pub const fn gt2048(a: &[u64; 32], b: &[u64; 32]) -> bool {
    lt2048(b, a)
}

#[inline]
pub const fn le2048(a: &[u64; 32], b: &[u64; 32]) -> bool {
    !gt2048(a, b)
}

#[inline]
pub const fn ge2048(a: &[u64; 32], b: &[u64; 32]) -> bool {
    !lt2048(a, b)
}

#[inline]
pub const fn leading_zeros2048(a: &[u64; 32]) -> u32 {
    let mut i = 31;
    loop {
        if a[i] != 0 {
            return ((31 - i) as u32) * 64 + a[i].leading_zeros();
        }
        if i == 0 {
            break;
        }
        i -= 1;
    }
    2048
}

/// Multiplicação U2048 × U2048 → U4096
pub fn mul2048x2048(a: &[u64; 32], b: &[u64; 32]) -> [u64; 64] {
    let mut result = [0u64; 64];
    for i in 0..32 {
        let mut carry = 0u64;
        for j in 0..32 {
            let (lo, hi) = mul_wide(a[i], b[j]);
            let (sum, c1) = adc(result[i + j], lo, 0);
            result[i + j] = sum;
            let (sum2, c2) = adc(result[i + j + 1], hi, c1);
            result[i + j + 1] = sum2;
            carry = c2;
        }
        if carry != 0 && i + 32 < 64 {
            let mut k = i + 32;
            while carry != 0 && k < 64 {
                let (sum, c) = result[k].overflowing_add(carry);
                result[k] = sum;
                carry = c as u64;
                k += 1;
            }
        }
    }
    result
}

/// Divisão U2048
pub fn div2048(a: &[u64; 32], b: &[u64; 32]) -> ([u64; 32], [u64; 32]) {
    if is_zero2048(b) {
        return ([0; 32], *a);
    }
    if lt2048(a, b) {
        return ([0; 32], *a);
    }
    if eq2048(a, b) {
        let mut one = [0u64; 32];
        one[0] = 1;
        return (one, [0; 32]);
    }

    let mut quotient = [0u64; 32];
    let mut remainder = [0u64; 32];

    for i in (0..2048).rev() {
        remainder = shl2048(&remainder, 1);
        let limb_idx = i / 64;
        let bit_idx = i % 64;
        if (a[limb_idx] >> bit_idx) & 1 == 1 {
            remainder[0] |= 1;
        }
        if ge2048(&remainder, b) {
            let (new_remainder, _) = sub2048(&remainder, b);
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
    fn test_add2048() {
        let mut a = [0u64; 32];
        let mut b = [0u64; 32];
        a[0] = 1;
        b[0] = 2;

        let (sum, carry) = add2048(&a, &b);
        assert_eq!(sum[0], 3);
        assert_eq!(carry, 0);
    }

    #[test]
    fn test_comparisons() {
        let mut a = [0u64; 32];
        let mut b = [0u64; 32];
        a[0] = 1;
        b[0] = 2;

        assert!(lt2048(&a, &b));
        assert!(eq2048(&a, &a));
    }
}

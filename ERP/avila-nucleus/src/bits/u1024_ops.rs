//! Operações U1024 (16 limbs × 64-bit)
//!
//! Aritmética de 1024-bit para RSA-1024.

use super::u64_ops::*;

/// Adição U1024: a + b → (soma, carry)
#[inline]
pub const fn add1024(a: &[u64; 16], b: &[u64; 16]) -> ([u64; 16], u64) {
    let mut result = [0u64; 16];
    let mut carry = 0u64;

    let mut i = 0;
    while i < 16 {
        let (r, c) = adc(a[i], b[i], carry);
        result[i] = r;
        carry = c;
        i += 1;
    }

    (result, carry)
}

/// Subtração U1024: a - b → (diferença, borrow)
#[inline]
pub const fn sub1024(a: &[u64; 16], b: &[u64; 16]) -> ([u64; 16], u64) {
    let mut result = [0u64; 16];
    let mut borrow = 0u64;

    let mut i = 0;
    while i < 16 {
        let (r, b) = sbb(a[i], b[i], borrow);
        result[i] = r;
        borrow = b;
        i += 1;
    }

    (result, borrow)
}

/// Multiplicação U1024 × U64 → U1088
#[inline]
pub const fn mul1024x64(a: &[u64; 16], b: u64) -> [u64; 17] {
    let mut result = [0u64; 17];
    let mut carry = 0u64;

    let mut i = 0;
    while i < 16 {
        let (lo, hi) = mul_wide(a[i], b);
        let (sum, c) = adc(lo, carry, 0);
        result[i] = sum;
        carry = hi + c;
        i += 1;
    }

    result[16] = carry;
    result
}

/// Shift left U1024
#[inline]
pub const fn shl1024(a: &[u64; 16], bits: u32) -> [u64; 16] {
    if bits == 0 {
        return *a;
    }
    if bits >= 1024 {
        return [0u64; 16];
    }

    let mut result = [0u64; 16];
    let word_shift = (bits / 64) as usize;
    let bit_shift = bits % 64;

    if bit_shift == 0 {
        // Simple word shift
        let mut i = word_shift;
        while i < 16 {
            result[i] = a[i - word_shift];
            i += 1;
        }
    } else {
        let shift_right = 64 - bit_shift;
        result[word_shift] = a[0] << bit_shift;

        let mut i = word_shift + 1;
        while i < 16 {
            let src_idx = i - word_shift;
            if src_idx < 16 {
                result[i] = (a[src_idx] << bit_shift) | (a[src_idx - 1] >> shift_right);
            }
            i += 1;
        }
    }

    result
}

/// Shift right U1024
#[inline]
pub const fn shr1024(a: &[u64; 16], bits: u32) -> [u64; 16] {
    if bits == 0 {
        return *a;
    }

    let mut result = [0u64; 16];
    let shift_left = 64 - bits;

    result[15] = a[15] >> bits;

    let mut i = 14;
    loop {
        result[i] = (a[i] >> bits) | (a[i + 1] << shift_left);
        if i == 0 {
            break;
        }
        i -= 1;
    }

    result
}

/// Comparações U1024
#[inline]
pub const fn eq1024(a: &[u64; 16], b: &[u64; 16]) -> bool {
    let mut i = 0;
    while i < 16 {
        if a[i] != b[i] {
            return false;
        }
        i += 1;
    }
    true
}

#[inline]
pub const fn lt1024(a: &[u64; 16], b: &[u64; 16]) -> bool {
    let mut i = 15;
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
pub const fn is_zero1024(a: &[u64; 16]) -> bool {
    let mut acc = 0u64;
    let mut i = 0;
    while i < 16 {
        acc |= a[i];
        i += 1;
    }
    acc == 0
}

#[inline]
pub const fn gt1024(a: &[u64; 16], b: &[u64; 16]) -> bool {
    lt1024(b, a)
}

#[inline]
pub const fn le1024(a: &[u64; 16], b: &[u64; 16]) -> bool {
    !gt1024(a, b)
}

#[inline]
pub const fn ge1024(a: &[u64; 16], b: &[u64; 16]) -> bool {
    !lt1024(a, b)
}

/// Leading zeros
#[inline]
pub const fn leading_zeros1024(a: &[u64; 16]) -> u32 {
    let mut i = 15;
    loop {
        if a[i] != 0 {
            return a[i].leading_zeros() + ((15 - i) as u32) * 64;
        }
        if i == 0 {
            break;
        }
        i -= 1;
    }
    1024
}

/// Multiplicação U1024 × U1024 → U2048
pub fn mul1024x1024(a: &[u64; 16], b: &[u64; 16]) -> [u64; 32] {
    let mut result = [0u64; 32];
    for i in 0..16 {
        let mut carry = 0u64;
        for j in 0..16 {
            let (lo, hi) = mul_wide(a[i], b[j]);
            let (sum, c1) = adc(result[i + j], lo, 0);
            result[i + j] = sum;
            let (sum2, c2) = adc(result[i + j + 1], hi, c1);
            result[i + j + 1] = sum2;
            carry = c2;
        }
        if carry != 0 && i + 16 < 32 {
            let mut k = i + 16;
            while carry != 0 && k < 32 {
                let (sum, c) = result[k].overflowing_add(carry);
                result[k] = sum;
                carry = c as u64;
                k += 1;
            }
        }
    }
    result
}

/// Divisão U1024 (algoritmo long division)
pub fn div1024(a: &[u64; 16], b: &[u64; 16]) -> ([u64; 16], [u64; 16]) {
    if is_zero1024(b) {
        return ([0; 16], *a);
    }
    if lt1024(a, b) {
        return ([0; 16], *a);
    }
    if eq1024(a, b) {
        let mut one = [0u64; 16];
        one[0] = 1;
        return (one, [0; 16]);
    }

    let mut quotient = [0u64; 16];
    let mut remainder = [0u64; 16];

    for i in (0..1024).rev() {
        remainder = shl1024(&remainder, 1);
        let limb_idx = i / 64;
        let bit_idx = i % 64;
        if (a[limb_idx] >> bit_idx) & 1 == 1 {
            remainder[0] |= 1;
        }
        if ge1024(&remainder, b) {
            let (new_remainder, _) = sub1024(&remainder, b);
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
    fn test_add1024() {
        let a = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let b = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let (sum, carry) = add1024(&a, &b);
        assert_eq!(sum[0], 3);
        assert_eq!(carry, 0);
    }

    #[test]
    fn test_comparisons() {
        let a = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let b = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        assert!(lt1024(&a, &b));
        assert!(eq1024(&a, &a));
    }
}

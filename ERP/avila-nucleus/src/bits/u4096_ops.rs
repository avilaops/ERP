//! Operações U4096 (64 limbs × 64-bit)
//!
//! Aritmética de 4096-bit para RSA-4096 e aplicações avançadas.

use super::u64_ops::*;

/// Adição U4096
#[inline]
pub fn add4096(a: &[u64; 64], b: &[u64; 64]) -> ([u64; 64], u64) {
    let mut result = [0u64; 64];
    let mut carry = 0u64;

    for i in 0..64 {
        let (r, c) = adc(a[i], b[i], carry);
        result[i] = r;
        carry = c;
    }

    (result, carry)
}

/// Subtração U4096
#[inline]
pub fn sub4096(a: &[u64; 64], b: &[u64; 64]) -> ([u64; 64], u64) {
    let mut result = [0u64; 64];
    let mut borrow = 0u64;

    for i in 0..64 {
        let (r, b) = sbb(a[i], b[i], borrow);
        result[i] = r;
        borrow = b;
    }

    (result, borrow)
}

/// Multiplicação U4096 × U64
#[inline]
pub fn mul4096x64(a: &[u64; 64], b: u64) -> [u64; 65] {
    let mut result = [0u64; 65];
    let mut carry = 0u64;

    for i in 0..64 {
        let (lo, hi) = mul_wide(a[i], b);
        let (sum, c) = adc(lo, carry, 0);
        result[i] = sum;
        carry = hi + c;
    }

    result[64] = carry;
    result
}

/// Comparações U4096
#[inline]
pub fn eq4096(a: &[u64; 64], b: &[u64; 64]) -> bool {
    a.iter().zip(b.iter()).all(|(x, y)| x == y)
}

#[inline]
pub fn lt4096(a: &[u64; 64], b: &[u64; 64]) -> bool {
    for i in (0..64).rev() {
        if a[i] < b[i] {
            return true;
        }
        if a[i] > b[i] {
            return false;
        }
    }
    false
}

#[inline]
pub fn is_zero4096(a: &[u64; 64]) -> bool {
    a.iter().all(|&x| x == 0)
}

#[inline]
pub fn gt4096(a: &[u64; 64], b: &[u64; 64]) -> bool {
    lt4096(b, a)
}

#[inline]
pub fn le4096(a: &[u64; 64], b: &[u64; 64]) -> bool {
    !gt4096(a, b)
}

#[inline]
pub fn ge4096(a: &[u64; 64], b: &[u64; 64]) -> bool {
    !lt4096(a, b)
}

#[inline]
pub fn leading_zeros4096(a: &[u64; 64]) -> u32 {
    for i in (0..64).rev() {
        if a[i] != 0 {
            return ((63 - i) as u32) * 64 + a[i].leading_zeros();
        }
    }
    4096
}

/// Shift left U4096
#[inline]
pub fn shl4096(a: &[u64; 64], bits: u32) -> [u64; 64] {
    if bits == 0 {
        return *a;
    }
    if bits >= 4096 {
        return [0u64; 64];
    }

    let mut result = [0u64; 64];
    let word_shift = (bits / 64) as usize;
    let bit_shift = bits % 64;

    if bit_shift == 0 {
        // Simple word shift
        for i in word_shift..64 {
            result[i] = a[i - word_shift];
        }
    } else {
        let shift_right = 64 - bit_shift;
        result[word_shift] = a[0] << bit_shift;

        for i in (word_shift + 1)..64 {
            let src_idx = i - word_shift;
            if src_idx < 64 {
                result[i] = (a[src_idx] << bit_shift) | (a[src_idx - 1] >> shift_right);
            }
        }
    }

    result
}

/// Shift right U4096
#[inline]
pub fn shr4096(a: &[u64; 64], bits: u32) -> [u64; 64] {
    if bits == 0 {
        return *a;
    }

    let mut result = [0u64; 64];
    let shift_left = 64 - bits;

    result[63] = a[63] >> bits;

    for i in (0..63).rev() {
        result[i] = (a[i] >> bits) | (a[i + 1] << shift_left);
    }

    result
}

/// Multiplicação U4096 × U4096 → U8192
pub fn mul4096x4096(a: &[u64; 64], b: &[u64; 64]) -> [u64; 128] {
    let mut result = [0u64; 128];
    for i in 0..64 {
        let mut carry = 0u64;
        for j in 0..64 {
            let (lo, hi) = mul_wide(a[i], b[j]);
            let (sum, c1) = adc(result[i + j], lo, 0);
            result[i + j] = sum;
            let (sum2, c2) = adc(result[i + j + 1], hi, c1);
            result[i + j + 1] = sum2;
            carry = c2;
        }
        if carry != 0 && i + 64 < 128 {
            let mut k = i + 64;
            while carry != 0 && k < 128 {
                let (sum, c) = result[k].overflowing_add(carry);
                result[k] = sum;
                carry = c as u64;
                k += 1;
            }
        }
    }
    result
}

/// Divisão U4096
pub fn div4096(a: &[u64; 64], b: &[u64; 64]) -> ([u64; 64], [u64; 64]) {
    if is_zero4096(b) {
        return ([0; 64], *a);
    }
    if lt4096(a, b) {
        return ([0; 64], *a);
    }
    if eq4096(a, b) {
        let mut one = [0u64; 64];
        one[0] = 1;
        return (one, [0; 64]);
    }

    let mut quotient = [0u64; 64];
    let mut remainder = [0u64; 64];

    for i in (0..4096).rev() {
        remainder = shl4096(&remainder, 1);
        let limb_idx = i / 64;
        let bit_idx = i % 64;
        if (a[limb_idx] >> bit_idx) & 1 == 1 {
            remainder[0] |= 1;
        }
        if ge4096(&remainder, b) {
            let (new_remainder, _) = sub4096(&remainder, b);
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
    fn test_add4096() {
        let mut a = [0u64; 64];
        let mut b = [0u64; 64];
        a[0] = 1;
        b[0] = 2;

        let (sum, carry) = add4096(&a, &b);
        assert_eq!(sum[0], 3);
        assert_eq!(carry, 0);
    }
}

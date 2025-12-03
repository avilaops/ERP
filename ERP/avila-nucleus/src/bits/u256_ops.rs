//! Operações em 256-bit usando primitivas u64
//!
//! Operações fundamentais para tipos U256 construídos como [u64; 4]

use super::u64_ops::*;

/// Adição 256-bit: a + b → (result, carry)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::add256;
///
/// let a = [1, 2, 3, 4];
/// let b = [5, 6, 7, 8];
/// let (result, carry) = add256(&a, &b);
/// assert_eq!(result, [6, 8, 10, 12]);
/// assert_eq!(carry, 0);
/// ```
#[inline]
pub fn add256(a: &[u64; 4], b: &[u64; 4]) -> ([u64; 4], u64) {
    let mut result = [0u64; 4];
    let mut carry = 0u64;

    for i in 0..4 {
        let (sum, c) = adc(a[i], b[i], carry);
        result[i] = sum;
        carry = c;
    }

    (result, carry)
}

/// Subtração 256-bit: a - b → (result, borrow)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::sub256;
///
/// let a = [10, 20, 30, 40];
/// let b = [5, 6, 7, 8];
/// let (result, borrow) = sub256(&a, &b);
/// assert_eq!(result, [5, 14, 23, 32]);
/// assert_eq!(borrow, 0);
/// ```
#[inline]
pub fn sub256(a: &[u64; 4], b: &[u64; 4]) -> ([u64; 4], u64) {
    let mut result = [0u64; 4];
    let mut borrow = 0u64;

    for i in 0..4 {
        let (diff, b) = sbb(a[i], b[i], borrow);
        result[i] = diff;
        borrow = b;
    }

    (result, borrow)
}

/// Multiplicação 256x64 → 320: a * b → [u64; 5]
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::mul256x64;
///
/// let a = [2, 0, 0, 0];
/// let result = mul256x64(&a, 3);
/// assert_eq!(result[0], 6);
/// assert_eq!(result[1], 0);
/// ```
#[inline]
pub fn mul256x64(a: &[u64; 4], b: u64) -> [u64; 5] {
    let mut result = [0u64; 5];
    let mut carry = 0u64;

    for i in 0..4 {
        let (prod, c) = mac(a[i], b, carry);
        result[i] = prod;
        carry = c;
    }
    result[4] = carry;

    result
}

/// Multiplicação 256x256 → 512 (schoolbook)
///
/// Retorna [u64; 8] com resultado em little-endian
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::mul256x256;
///
/// let a = [2, 0, 0, 0];
/// let b = [3, 0, 0, 0];
/// let result = mul256x256(&a, &b);
/// assert_eq!(result[0], 6);
/// for i in 1..8 {
///     assert_eq!(result[i], 0);
/// }
/// ```
#[inline]
pub fn mul256x256(a: &[u64; 4], b: &[u64; 4]) -> [u64; 8] {
    let mut result = [0u64; 8];

    for i in 0..4 {
        let mut carry = 0u128;
        for j in 0..4 {
            let prod = (a[i] as u128) * (b[j] as u128);
            let sum = (result[i + j] as u128) + prod + carry;
            result[i + j] = sum as u64;
            carry = sum >> 64;
        }
        result[i + 4] = carry as u64;
    }

    result
}

/// Shift left 256-bit
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::shl256;
///
/// let a = [1, 0, 0, 0];
/// let result = shl256(&a, 1);
/// assert_eq!(result, [2, 0, 0, 0]);
///
/// let result = shl256(&a, 64);
/// assert_eq!(result, [0, 1, 0, 0]);
/// ```
#[inline]
pub fn shl256(a: &[u64; 4], shift: u32) -> [u64; 4] {
    if shift == 0 {
        return *a;
    }

    let limb_shift = (shift / 64) as usize;
    let bit_shift = shift % 64;

    let mut result = [0u64; 4];

    if bit_shift == 0 {
        // Shift apenas limbs inteiros
        for i in limb_shift..4 {
            result[i] = a[i - limb_shift];
        }
    } else {
        // Shift com carry entre limbs
        for i in limb_shift..4 {
            result[i] = a[i - limb_shift] << bit_shift;
            if i > limb_shift {
                result[i] |= a[i - limb_shift - 1] >> (64 - bit_shift);
            }
        }
    }

    result
}

/// Shift right 256-bit
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::shr256;
///
/// let a = [2, 0, 0, 0];
/// let result = shr256(&a, 1);
/// assert_eq!(result, [1, 0, 0, 0]);
///
/// let a = [0, 1, 0, 0];
/// let result = shr256(&a, 64);
/// assert_eq!(result, [1, 0, 0, 0]);
/// ```
#[inline]
pub fn shr256(a: &[u64; 4], shift: u32) -> [u64; 4] {
    if shift == 0 {
        return *a;
    }

    let limb_shift = (shift / 64) as usize;
    let bit_shift = shift % 64;

    let mut result = [0u64; 4];

    if bit_shift == 0 {
        // Shift apenas limbs inteiros
        for i in 0..(4 - limb_shift) {
            result[i] = a[i + limb_shift];
        }
    } else {
        // Shift com carry entre limbs
        for i in 0..(4 - limb_shift) {
            result[i] = a[i + limb_shift] >> bit_shift;
            if i + limb_shift + 1 < 4 {
                result[i] |= a[i + limb_shift + 1] << (64 - bit_shift);
            }
        }
    }

    result
}

/// Comparação: a == b
#[inline]
pub const fn eq256(a: &[u64; 4], b: &[u64; 4]) -> bool {
    a[0] == b[0] && a[1] == b[1] && a[2] == b[2] && a[3] == b[3]
}

/// Comparação: a < b
#[inline]
pub fn lt256(a: &[u64; 4], b: &[u64; 4]) -> bool {
    // Compara de high para low
    for i in (0..4).rev() {
        if a[i] != b[i] {
            return a[i] < b[i];
        }
    }
    false // são iguais
}

/// Comparação: a > b
#[inline]
pub fn gt256(a: &[u64; 4], b: &[u64; 4]) -> bool {
    lt256(b, a)
}

/// Comparação: a <= b
#[inline]
pub fn le256(a: &[u64; 4], b: &[u64; 4]) -> bool {
    !gt256(a, b)
}

/// Comparação: a >= b
#[inline]
pub fn ge256(a: &[u64; 4], b: &[u64; 4]) -> bool {
    !lt256(a, b)
}

/// Leading zeros em 256-bit
#[inline]
pub fn leading_zeros256(a: &[u64; 4]) -> u32 {
    for i in (0..4).rev() {
        if a[i] != 0 {
            return a[i].leading_zeros() + ((3 - i) as u32) * 64;
        }
    }
    256 // todos zeros
}

/// Trailing zeros em 256-bit
#[inline]
pub fn trailing_zeros256(a: &[u64; 4]) -> u32 {
    for i in 0..4 {
        if a[i] != 0 {
            return a[i].trailing_zeros() + (i as u32) * 64;
        }
    }
    256 // todos zeros
}

/// Count ones em 256-bit
#[inline]
pub const fn count_ones256(a: &[u64; 4]) -> u32 {
    a[0].count_ones() + a[1].count_ones() + a[2].count_ones() + a[3].count_ones()
}

/// Testa se é zero
#[inline]
pub const fn is_zero256(a: &[u64; 4]) -> bool {
    a[0] == 0 && a[1] == 0 && a[2] == 0 && a[3] == 0
}

/// Testa se é par
#[inline]
pub const fn is_even256(a: &[u64; 4]) -> bool {
    a[0] & 1 == 0
}

/// Testa se é ímpar
#[inline]
pub const fn is_odd256(a: &[u64; 4]) -> bool {
    a[0] & 1 == 1
}

/// Divisão 256-bit: a / b → (quotient, remainder)
///
/// Implementa algoritmo de divisão long division
/// Retorna (0, a) se b == 0 (divisão por zero)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::div256;
///
/// let a = [100, 0, 0, 0];
/// let b = [10, 0, 0, 0];
/// let (quotient, remainder) = div256(&a, &b);
/// assert_eq!(quotient, [10, 0, 0, 0]);
/// assert_eq!(remainder, [0, 0, 0, 0]);
/// ```
pub fn div256(a: &[u64; 4], b: &[u64; 4]) -> ([u64; 4], [u64; 4]) {
    // Check for division by zero
    if is_zero256(b) {
        return ([0, 0, 0, 0], *a);
    }

    // Check if a < b (quotient is 0)
    if lt256(a, b) {
        return ([0, 0, 0, 0], *a);
    }

    // Check if a == b (quotient is 1)
    if eq256(a, b) {
        return ([1, 0, 0, 0], [0, 0, 0, 0]);
    }

    // Long division algorithm
    let mut quotient = [0u64; 4];
    let mut remainder = [0u64; 4];

    // Process bits from high to low
    for i in (0..256).rev() {
        // Shift remainder left by 1
        remainder = shl256(&remainder, 1);

        // Set bit 0 of remainder to bit i of dividend
        let limb_idx = i / 64;
        let bit_idx = i % 64;
        if (a[limb_idx] >> bit_idx) & 1 == 1 {
            remainder[0] |= 1;
        }

        // If remainder >= divisor, subtract and set quotient bit
        if ge256(&remainder, b) {
            let (new_remainder, _) = sub256(&remainder, b);
            remainder = new_remainder;

            // Set bit i of quotient
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
    fn test_add256() {
        let a = [1, 2, 3, 4];
        let b = [5, 6, 7, 8];
        let (result, carry) = add256(&a, &b);
        assert_eq!(result, [6, 8, 10, 12]);
        assert_eq!(carry, 0);

        // Overflow
        let a = [u64::MAX, u64::MAX, u64::MAX, u64::MAX];
        let b = [1, 0, 0, 0];
        let (result, carry) = add256(&a, &b);
        assert_eq!(result, [0, 0, 0, 0]);
        assert_eq!(carry, 1);
    }

    #[test]
    fn test_sub256() {
        let a = [10, 20, 30, 40];
        let b = [5, 6, 7, 8];
        let (result, borrow) = sub256(&a, &b);
        assert_eq!(result, [5, 14, 23, 32]);
        assert_eq!(borrow, 0);
    }

    #[test]
    fn test_mul256x256() {
        let a = [2, 0, 0, 0];
        let b = [3, 0, 0, 0];
        let result = mul256x256(&a, &b);
        assert_eq!(result[0], 6);
        for i in 1..8 {
            assert_eq!(result[i], 0);
        }
    }

    #[test]
    fn test_shl256() {
        let a = [1, 0, 0, 0];
        let result = shl256(&a, 1);
        assert_eq!(result, [2, 0, 0, 0]);

        let result = shl256(&a, 64);
        assert_eq!(result, [0, 1, 0, 0]);
    }

    #[test]
    fn test_comparisons() {
        let a = [1, 2, 3, 4];
        let b = [1, 2, 3, 4];
        let c = [1, 2, 3, 5];

        assert!(eq256(&a, &b));
        assert!(!eq256(&a, &c));
        assert!(lt256(&a, &c));
        assert!(gt256(&c, &a));
    }

    #[test]
    fn test_bit_ops() {
        assert_eq!(leading_zeros256(&[0, 0, 0, 0]), 256);
        // [1, 0, 0, 0] means a[0]=1, a[3]=0 (most significant)
        // So we have 192 zeros from a[3],a[2],a[1] and then a[0]=1 has 63 leading zeros
        assert_eq!(leading_zeros256(&[1, 0, 0, 0]), 192 + 63);
        // [0, 0, 0, 1] means a[3]=1 (most significant word)
        assert_eq!(leading_zeros256(&[0, 0, 0, 1]), 63);

        assert_eq!(trailing_zeros256(&[0, 0, 0, 0]), 256);
        assert_eq!(trailing_zeros256(&[1, 0, 0, 0]), 0);
        assert_eq!(trailing_zeros256(&[0, 1, 0, 0]), 64);
    }

    #[test]
    fn test_div256() {
        // Simple division
        let a = [100, 0, 0, 0];
        let b = [10, 0, 0, 0];
        let (q, r) = div256(&a, &b);
        assert_eq!(q, [10, 0, 0, 0]);
        assert_eq!(r, [0, 0, 0, 0]);

        // Division with remainder
        let a = [107, 0, 0, 0];
        let b = [10, 0, 0, 0];
        let (q, r) = div256(&a, &b);
        assert_eq!(q, [10, 0, 0, 0]);
        assert_eq!(r, [7, 0, 0, 0]);

        // a < b
        let a = [5, 0, 0, 0];
        let b = [10, 0, 0, 0];
        let (q, r) = div256(&a, &b);
        assert_eq!(q, [0, 0, 0, 0]);
        assert_eq!(r, [5, 0, 0, 0]);

        // a == b
        let a = [42, 0, 0, 0];
        let b = [42, 0, 0, 0];
        let (q, r) = div256(&a, &b);
        assert_eq!(q, [1, 0, 0, 0]);
        assert_eq!(r, [0, 0, 0, 0]);
    }
}

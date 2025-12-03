//! Multiplicações wide especializadas
//!
//! Implementações otimizadas de multiplicações que produzem
//! resultados de largura dupla.

use super::u64_ops::*;

/// Multiplicação 64x64 → 128 usando Karatsuba
///
/// Mais eficiente que schoolbook para números grandes.
#[inline(always)]
pub const fn mul64x64_karatsuba(a: u64, b: u64) -> (u64, u64) {
    // Para 64-bit, schoolbook é mais eficiente
    // Karatsuba só vale a pena para > 128-bit
    mul_wide(a, b)
}

/// Multiplicação 128x128 → 256 usando Karatsuba
///
/// a = a_hi * 2^64 + a_lo
/// b = b_hi * 2^64 + b_lo
///
/// Karatsuba: a * b = z2 * 2^128 + z1 * 2^64 + z0
/// onde:
///   z0 = a_lo * b_lo
///   z2 = a_hi * b_hi
///   z1 = (a_lo + a_hi) * (b_lo + b_hi) - z0 - z2
///
/// Reduz 4 multiplicações para 3.
#[inline]
pub const fn mul128x128_karatsuba(a_lo: u64, a_hi: u64, b_lo: u64, b_hi: u64) -> [u64; 4] {
    // z0 = a_lo * b_lo
    let (z0_lo, z0_hi) = mul_wide(a_lo, b_lo);

    // z2 = a_hi * b_hi
    let (z2_lo, z2_hi) = mul_wide(a_hi, b_hi);

    // (a_lo + a_hi) * (b_lo + b_hi)
    let (sum_a, carry_a) = a_lo.overflowing_add(a_hi);
    let (sum_b, carry_b) = b_lo.overflowing_add(b_hi);

    let (mid_lo, mid_hi) = mul_wide(sum_a, sum_b);

    // Ajusta carries
    let mut mid_hi = mid_hi;
    if carry_a {
        let (new_lo, c) = mid_lo.overflowing_add(sum_b);
        let (new_hi, _) = mid_hi.overflowing_add(c as u64);
        mid_hi = new_hi;
    }
    if carry_b {
        let (new_lo, c) = mid_lo.overflowing_add(sum_a);
        let (new_hi, _) = mid_hi.overflowing_add(c as u64);
        mid_hi = new_hi;
    }

    // z1 = mid - z0 - z2
    let (z1_lo, borrow1) = mid_lo.overflowing_sub(z0_lo);
    let (z1_lo, borrow2) = z1_lo.overflowing_sub(z2_lo);
    let borrow = (borrow1 as u64) + (borrow2 as u64);

    let (z1_hi, borrow3) = mid_hi.overflowing_sub(z0_hi);
    let (z1_hi, borrow4) = z1_hi.overflowing_sub(z2_hi);
    let (z1_hi, _) = z1_hi.overflowing_sub(borrow);
    let total_borrow = (borrow3 as u64) + (borrow4 as u64);

    // Monta resultado: z2 * 2^128 + z1 * 2^64 + z0
    let mut result = [z0_lo, z0_hi, z2_lo, z2_hi];

    // Adiciona z1 * 2^64
    let (r1, carry) = result[1].overflowing_add(z1_lo);
    result[1] = r1;

    let (r2, carry2) = result[2].overflowing_add(z1_hi);
    result[2] = r2.wrapping_add(carry as u64);

    result[3] = result[3].wrapping_add(carry2 as u64);

    result
}

/// Multiplicação 256x256 → 512 usando Karatsuba recursivo
///
/// Split em 128-bit chunks e aplica Karatsuba.
#[inline]
pub fn mul256x256_karatsuba(a: &[u64; 4], b: &[u64; 4]) -> [u64; 8] {
    // a = a_hi * 2^128 + a_lo  (onde a_hi = [a[2], a[3]], a_lo = [a[0], a[1]])
    // b = b_hi * 2^128 + b_lo

    // z0 = a_lo * b_lo (128x128 → 256)
    let z0 = mul128x128_karatsuba(a[0], a[1], b[0], b[1]);

    // z2 = a_hi * b_hi (128x128 → 256)
    let z2 = mul128x128_karatsuba(a[2], a[3], b[2], b[3]);

    // (a_lo + a_hi)
    let (sum_a0, carry0) = a[0].overflowing_add(a[2]);
    let (sum_a1, carry1) = a[1].overflowing_add(a[3]);
    let sum_a1 = sum_a1.wrapping_add(carry0 as u64);
    let carry_a = carry1 as u64;

    // (b_lo + b_hi)
    let (sum_b0, carry0) = b[0].overflowing_add(b[2]);
    let (sum_b1, carry1) = b[1].overflowing_add(b[3]);
    let sum_b1 = sum_b1.wrapping_add(carry0 as u64);
    let carry_b = carry1 as u64;

    // mid = (a_lo + a_hi) * (b_lo + b_hi)
    let mut mid = mul128x128_karatsuba(sum_a0, sum_a1, sum_b0, sum_b1);

    // Ajusta por carries (simplificado)
    if carry_a != 0 {
        let (m0, c) = mid[0].overflowing_add(sum_b0);
        mid[0] = m0;
        let (m1, c2) = mid[1].overflowing_add(sum_b1);
        mid[1] = m1.wrapping_add(c as u64);
        mid[2] = mid[2].wrapping_add(c2 as u64);
    }
    if carry_b != 0 {
        let (m0, c) = mid[0].overflowing_add(sum_a0);
        mid[0] = m0;
        let (m1, c2) = mid[1].overflowing_add(sum_a1);
        mid[1] = m1.wrapping_add(c as u64);
        mid[2] = mid[2].wrapping_add(c2 as u64);
    }

    // z1 = mid - z0 - z2
    let mut z1 = [0u64; 4];
    let mut borrow = 0u64;

    for i in 0..4 {
        let (diff, b1) = mid[i].overflowing_sub(z0[i]);
        let (diff, b2) = diff.overflowing_sub(z2[i]);
        let (diff, b3) = diff.overflowing_sub(borrow);
        z1[i] = diff;
        borrow = (b1 as u64) + (b2 as u64) + (b3 as u64);
    }

    // Monta resultado: z2 * 2^256 + z1 * 2^128 + z0
    let mut result = [0u64; 8];

    // z0
    result[0..4].copy_from_slice(&z0);

    // z1 * 2^128 (shift left 128 bits = adiciona em [2..6])
    let mut carry = 0u64;
    for i in 0..4 {
        let (sum, c) = result[i + 2].overflowing_add(z1[i]);
        let (sum, c2) = sum.overflowing_add(carry);
        result[i + 2] = sum;
        carry = (c as u64) + (c2 as u64);
    }

    // z2 * 2^256 (adiciona em [4..8])
    carry = 0;
    for i in 0..4 {
        let (sum, c) = result[i + 4].overflowing_add(z2[i]);
        let (sum, c2) = sum.overflowing_add(carry);
        result[i + 4] = sum;
        carry = (c as u64) + (c2 as u64);
    }

    result
}

/// Squaring 64x64 → 128 otimizado
///
/// x^2 mais eficiente que x * x porque evita produtos duplicados.
#[inline(always)]
pub const fn square64(x: u64) -> (u64, u64) {
    mul_wide(x, x)
}

/// Squaring 128-bit → 256
///
/// (a * 2^64 + b)^2 = a^2 * 2^128 + 2*a*b * 2^64 + b^2
#[inline]
pub const fn square128(lo: u64, hi: u64) -> [u64; 4] {
    // b^2
    let (b2_lo, b2_hi) = mul_wide(lo, lo);

    // a^2
    let (a2_lo, a2_hi) = mul_wide(hi, hi);

    // 2 * a * b
    let (ab_lo, ab_hi) = mul_wide(hi, lo);

    // Dobra
    let (ab2_lo, carry) = ab_lo.overflowing_add(ab_lo);
    let ab2_hi = ab_hi.wrapping_add(ab_hi).wrapping_add(carry as u64);

    // Monta resultado
    let mut result = [b2_lo, b2_hi, a2_lo, a2_hi];

    // Adiciona 2*a*b * 2^64
    let (r1, c1) = result[1].overflowing_add(ab2_lo);
    result[1] = r1;

    let (r2, c2) = result[2].overflowing_add(ab2_hi);
    result[2] = r2.wrapping_add(c1 as u64);

    result[3] = result[3].wrapping_add(c2 as u64);

    result
}

/// Squaring 256-bit → 512
#[inline]
pub fn square256(a: &[u64; 4]) -> [u64; 8] {
    // Otimização: evita produtos duplicados
    // (a3*2^192 + a2*2^128 + a1*2^64 + a0)^2

    let mut result = [0u64; 8];

    // Diagonal: a[i]^2
    for i in 0..4 {
        let (lo, hi) = mul_wide(a[i], a[i]);
        let (r, c) = result[2 * i].overflowing_add(lo);
        result[2 * i] = r;
        let (r, c2) = result[2 * i + 1].overflowing_add(hi);
        result[2 * i + 1] = r.wrapping_add(c as u64);
        if 2 * i + 2 < 8 {
            result[2 * i + 2] = result[2 * i + 2].wrapping_add(c2 as u64);
        }
    }

    // Off-diagonal: 2 * a[i] * a[j] para i < j
    for i in 0..4 {
        for j in (i + 1)..4 {
            let (lo, hi) = mul_wide(a[i], a[j]);

            // Dobra (2x)
            let (lo2, c1) = lo.overflowing_add(lo);
            let hi2 = hi.wrapping_add(hi).wrapping_add(c1 as u64);

            // Adiciona em result[i + j]
            let mut carry = 0u64;
            let idx = i + j;

            let (r, c) = result[idx].overflowing_add(lo2);
            result[idx] = r;
            carry = c as u64;

            if idx + 1 < 8 {
                let (r, c) = result[idx + 1].overflowing_add(hi2);
                let (r, c2) = r.overflowing_add(carry);
                result[idx + 1] = r;
                carry = (c as u64) + (c2 as u64);
            }

            if idx + 2 < 8 && carry != 0 {
                result[idx + 2] = result[idx + 2].wrapping_add(carry);
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mul128x128_karatsuba() {
        let result = mul128x128_karatsuba(2, 0, 3, 0);
        assert_eq!(result[0], 6);
        assert_eq!(result[1], 0);
        assert_eq!(result[2], 0);
        assert_eq!(result[3], 0);

        let result = mul128x128_karatsuba(u64::MAX, 0, u64::MAX, 0);
        assert_eq!(result[0], 1);
        assert!(result[1] > 0);
    }

    #[test]
    fn test_mul256x256_karatsuba() {
        let a = [2, 0, 0, 0];
        let b = [3, 0, 0, 0];
        let result = mul256x256_karatsuba(&a, &b);
        assert_eq!(result[0], 6);
        for i in 1..8 {
            assert_eq!(result[i], 0);
        }
    }

    #[test]
    fn test_square128() {
        let result = square128(2, 0);
        assert_eq!(result[0], 4);
        assert_eq!(result[1], 0);

        let result = square128(3, 5);
        // (5 * 2^64 + 3)^2 = 25 * 2^128 + 30 * 2^64 + 9
        assert_eq!(result[0], 9);
        assert_eq!(result[1], 30);
        assert_eq!(result[2], 25);
    }

    #[test]
    fn test_square256() {
        let a = [2, 0, 0, 0];
        let result = square256(&a);
        assert_eq!(result[0], 4);
        for i in 1..8 {
            assert_eq!(result[i], 0);
        }
    }
}

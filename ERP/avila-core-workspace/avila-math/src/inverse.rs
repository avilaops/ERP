//! Inversão modular usando Extended Euclidean Algorithm
//!
//! Calcula a^(-1) mod n tal que a × a^(-1) ≡ 1 (mod n)

use avila_primitives::U256;

/// Inversão modular: retorna a^(-1) mod n
///
/// Usa algoritmo Extended Euclidean Algorithm (EEA)
///
/// Algoritmo:
/// 1. old_r = n, r = a
/// 2. old_s = 0, s = 1
/// 3. Enquanto r ≠ 0:
///    - quotient = old_r / r
///    - (old_r, r) = (r, old_r - quotient × r)
///    - (old_s, s) = (s, old_s - quotient × s)
/// 4. Se old_r > 1: não existe inverso
/// 5. Se old_s < 0: old_s = old_s + n
/// 6. Retorna old_s
pub fn mod_inverse(a: &U256, n: &U256) -> Option<U256> {
    // Casos especiais
    if a.is_zero() || n <= &U256::ONE {
        return None;
    }

    // Se a >= n, reduz a primeiro
    let mut a_mod = if a >= n { mod_reduce(a, n)? } else { *a };

    // Extended Euclidean Algorithm
    let mut old_r = *n;
    let mut r = a_mod;

    // Coeficientes de Bézout (s, t tal que gcd = as + nt)
    let mut old_s = (U256::ZERO, false); // (value, is_negative)
    let mut s = (U256::ONE, false);

    while !r.is_zero() {
        // quotient = old_r / r
        let (quotient, remainder) = div_rem(&old_r, &r);

        // old_r = r, r = remainder
        old_r = r;
        r = remainder;

        // Calcula novo s: old_s - quotient × s
        let prod = quotient.wrapping_mul(&s.0);
        let new_s = if old_s.1 == s.1 {
            // Mesmo sinal: |old_s| - |quotient × s|
            if old_s.0 >= prod {
                (old_s.0.wrapping_sub(&prod), old_s.1)
            } else {
                (prod.wrapping_sub(&old_s.0), !old_s.1)
            }
        } else {
            // Sinais opostos: |old_s| + |quotient × s|
            (old_s.0.wrapping_add(&prod), old_s.1)
        };

        old_s = s;
        s = new_s;
    }

    // old_r é o GCD
    // Se GCD > 1, não existe inverso
    if old_r > U256::ONE {
        return None;
    }

    // Se old_s é negativo, adiciona n
    if old_s.1 {
        // old_s < 0, então old_s + n
        Some(n.wrapping_sub(&old_s.0))
    } else {
        Some(old_s.0)
    }
}

/// Redução modular simples: a mod n
fn mod_reduce(a: &U256, n: &U256) -> Option<U256> {
    if n.is_zero() {
        return None;
    }

    let mut result = *a;
    while result >= *n {
        result = result.wrapping_sub(n);
    }
    Some(result)
}

/// Divisão com resto: retorna (quotient, remainder)
///
/// Implementação usando subtração repetida otimizada
fn div_rem(dividend: &U256, divisor: &U256) -> (U256, U256) {
    if divisor.is_zero() {
        return (U256::ZERO, *dividend);
    }

    if dividend < divisor {
        return (U256::ZERO, *dividend);
    }

    let mut quotient = U256::ZERO;
    let mut remainder = *dividend;

    // Conta quantos bits temos que processar
    let dividend_bits = 256 - dividend.leading_zeros();
    let divisor_bits = 256 - divisor.leading_zeros();

    if divisor_bits == 0 {
        return (U256::ZERO, *dividend);
    }

    let mut shift = dividend_bits.saturating_sub(divisor_bits);

    // Divisão long division binária
    loop {
        let shifted_divisor = divisor.shl(shift as usize);

        if remainder >= shifted_divisor {
            remainder = remainder.wrapping_sub(&shifted_divisor);
            quotient = quotient | U256::ONE.shl(shift as usize);
        }

        if shift == 0 {
            break;
        }
        shift -= 1;
    }

    (quotient, remainder)
}

/// Binary Extended GCD (mais eficiente para hardware)
///
/// Variante do EEA que usa apenas shifts e subtrações
pub fn binary_gcd(a: &U256, b: &U256) -> U256 {
    if a.is_zero() {
        return *b;
    }
    if b.is_zero() {
        return *a;
    }

    // Conta fatores de 2 comuns
    let mut shift = 0u32;
    let mut temp_a = *a;
    let mut temp_b = *b;

    while !temp_a.is_odd() && !temp_b.is_odd() {
        temp_a = temp_a.shr1();
        temp_b = temp_b.shr1();
        shift += 1;
    }

    // Remove fatores de 2 de a
    while !temp_a.is_odd() {
        temp_a = temp_a.shr1();
    }

    // Loop principal
    loop {
        // Remove fatores de 2 de b
        while !temp_b.is_odd() {
            temp_b = temp_b.shr1();
        }

        // Garante temp_a <= temp_b
        if temp_a > temp_b {
            core::mem::swap(&mut temp_a, &mut temp_b);
        }

        temp_b = temp_b.wrapping_sub(&temp_a);

        if temp_b.is_zero() {
            break;
        }
    }

    // Restaura fatores de 2
    for _ in 0..shift {
        temp_a = temp_a.shl1();
    }

    temp_a
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_binary_gcd() {
        let a = U256::from_u64(48);
        let b = U256::from_u64(18);
        let gcd = binary_gcd(&a, &b);
        assert_eq!(gcd, U256::from_u64(6));
    }

    #[test]
    fn test_div_rem() {
        let a = U256::from_u64(100);
        let b = U256::from_u64(7);
        let (q, r) = div_rem(&a, &b);
        assert_eq!(q, U256::from_u64(14));
        assert_eq!(r, U256::from_u64(2));
    }

    #[test]
    fn test_mod_reduce() {
        let a = U256::from_u64(100);
        let n = U256::from_u64(7);
        let result = mod_reduce(&a, &n).unwrap();
        assert_eq!(result, U256::from_u64(2));
    }

    #[test]
    fn test_mod_inverse_simple() {
        // 3^(-1) mod 7 = 5 (porque 3 × 5 = 15 ≡ 1 mod 7)
        let a = U256::from_u64(3);
        let n = U256::from_u64(7);
        let inv = mod_inverse(&a, &n).unwrap();
        assert_eq!(inv, U256::from_u64(5));

        // Verifica: 3 × 5 mod 7 = 1
        let product = a.mul_u64(5).0;
        let check = mod_reduce(&product, &n).unwrap();
        assert_eq!(check, U256::ONE);
    }

    #[test]
    fn test_mod_inverse_larger() {
        // 17^(-1) mod 43
        let a = U256::from_u64(17);
        let n = U256::from_u64(43);
        let inv = mod_inverse(&a, &n).unwrap();

        // Verifica: a × inv ≡ 1 (mod n)
        let (product, _) = a.mul_u64(inv.limbs[0]);
        let check = mod_reduce(&product, &n).unwrap();
        assert_eq!(check, U256::ONE);
    }

    #[test]
    fn test_mod_inverse_no_inverse() {
        // 2 não tem inverso mod 4 (gcd(2, 4) = 2 ≠ 1)
        let a = U256::from_u64(2);
        let n = U256::from_u64(4);
        let inv = mod_inverse(&a, &n);
        assert!(inv.is_none());
    }
}

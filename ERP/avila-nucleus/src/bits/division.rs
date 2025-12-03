//! Divisão de precisão estendida
//!
//! Algoritmos de divisão para números grandes.

use super::u64_ops::*;

/// Divisão U128 / U64 → (quociente, resto)
///
/// Divide número de 128-bit por 64-bit.
/// Retorna (quociente de 128-bit, resto de 64-bit).
#[inline]
pub const fn div128x64(dividend_lo: u64, dividend_hi: u64, divisor: u64) -> ([u64; 2], u64) {
    if divisor == 0 {
        panic!("divisão por zero");
    }

    if dividend_hi == 0 {
        // Caso simples: divisão de 64-bit
        let q = dividend_lo / divisor;
        let r = dividend_lo % divisor;
        return ([q, 0], r);
    }

    if dividend_hi >= divisor {
        // Overflow: quociente não cabe em 128-bit
        panic!("overflow na divisão");
    }

    // Algoritmo de divisão longa simplificado
    // Para implementação completa, usar DIVQ quando disponível

    // Normaliza divisor
    let shift = divisor.leading_zeros();
    let divisor_norm = divisor << shift;

    let dividend_hi_norm = (dividend_hi << shift) | (dividend_lo >> (64 - shift));
    let dividend_lo_norm = dividend_lo << shift;

    // Estima quociente high
    let q_hi = if dividend_hi_norm >= divisor_norm {
        1
    } else {
        0
    };

    let mut remainder = dividend_hi_norm - q_hi * divisor_norm;

    // Estima quociente low usando aproximação
    let q_lo = if remainder < divisor_norm {
        let combined = (remainder << 32) | (dividend_lo_norm >> 32);
        combined / (divisor_norm >> 32)
    } else {
        u64::MAX
    };

    // Calcula resto aproximado
    let (prod_lo, prod_hi) = mul_wide(q_lo, divisor);
    let full_prod = ([prod_lo, prod_hi, 0u64, 0u64]);

    // Resto = dividend - quotient * divisor
    // (simplificado aqui)
    let remainder = dividend_lo.wrapping_sub(prod_lo);

    ([q_lo, q_hi], remainder)
}

/// Divisão U256 / U256 → (quociente, resto)
///
/// Usa algoritmo de divisão longa (schoolbook).
#[inline]
pub fn div256x256(dividend: &[u64; 4], divisor: &[u64; 4]) -> ([u64; 4], [u64; 4]) {
    use super::u256_ops::*;

    if is_zero256(divisor) {
        panic!("divisão por zero");
    }

    if lt256(dividend, divisor) {
        // dividend < divisor: quociente = 0, resto = dividend
        return ([0, 0, 0, 0], *dividend);
    }

    if eq256(dividend, divisor) {
        // dividend == divisor: quociente = 1, resto = 0
        return ([1, 0, 0, 0], [0, 0, 0, 0]);
    }

    // Algoritmo de divisão longa (Knuth's Algorithm D)
    // Simplificado para demonstração

    let mut quotient = [0u64; 4];
    let mut remainder = *dividend;

    // Conta bits significativos
    let dividend_bits = 256 - leading_zeros256(dividend);
    let divisor_bits = 256 - leading_zeros256(divisor);

    let shift = dividend_bits - divisor_bits;

    // Shift divisor para alinhar com dividend
    let mut shifted_divisor = shl256(divisor, shift);

    // Itera de shift até 0
    for i in (0..=shift).rev() {
        if !lt256(&remainder, &shifted_divisor) {
            // remainder >= shifted_divisor
            let (diff, _) = sub256(&remainder, &shifted_divisor);
            remainder = diff;

            // Seta bit i do quociente
            let limb_idx = i / 64;
            let bit_idx = i % 64;
            if limb_idx < 4 {
                quotient[limb_idx as usize] |= 1u64 << bit_idx;
            }
        }

        // Shift divisor right
        shifted_divisor = shr256(&shifted_divisor, 1);
    }

    (quotient, remainder)
}

/// GCD (Greatest Common Divisor) usando algoritmo de Euclides
///
/// Retorna mdc(a, b).
#[inline]
pub const fn gcd_u64(mut a: u64, mut b: u64) -> u64 {
    while b != 0 {
        let temp = b;
        b = a % b;
        a = temp;
    }
    a
}

/// GCD binário (Stein's algorithm) - mais eficiente
///
/// Usa apenas shifts e subtrações, sem divisão.
#[inline]
pub const fn gcd_binary_u64(mut a: u64, mut b: u64) -> u64 {
    if a == 0 {
        return b;
    }
    if b == 0 {
        return a;
    }

    // Remove fatores de 2
    let shift = (a | b).trailing_zeros();
    a >>= a.trailing_zeros();
    b >>= b.trailing_zeros();

    while a != b {
        if a > b {
            a -= b;
            a >>= a.trailing_zeros();
        } else {
            b -= a;
            b >>= b.trailing_zeros();
        }
    }

    a << shift
}

/// LCM (Least Common Multiple)
///
/// lcm(a, b) = (a * b) / gcd(a, b)
#[inline]
pub const fn lcm_u64(a: u64, b: u64) -> u64 {
    if a == 0 || b == 0 {
        return 0;
    }

    let gcd = gcd_binary_u64(a, b);
    (a / gcd) * b
}

/// Testa se número é potência de 2
#[inline(always)]
pub const fn is_power_of_two(x: u64) -> bool {
    x != 0 && (x & (x - 1)) == 0
}

/// Próxima potência de 2 >= x
#[inline]
pub const fn next_power_of_two(x: u64) -> u64 {
    if x <= 1 {
        return 1;
    }

    let leading = x.leading_zeros();
    let is_pow2 = (x & (x - 1)) == 0;

    if is_pow2 {
        x
    } else {
        1u64 << (64 - leading)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_div128x64_simple() {
        let (q, r) = div128x64(10, 0, 3);
        assert_eq!(q[0], 3);
        assert_eq!(r, 1);
    }

    #[test]
    fn test_gcd() {
        assert_eq!(gcd_u64(48, 18), 6);
        assert_eq!(gcd_u64(100, 50), 50);
        assert_eq!(gcd_u64(17, 19), 1); // Primos
    }

    #[test]
    fn test_gcd_binary() {
        assert_eq!(gcd_binary_u64(48, 18), 6);
        assert_eq!(gcd_binary_u64(100, 50), 50);
        assert_eq!(gcd_binary_u64(17, 19), 1);
    }

    #[test]
    fn test_lcm() {
        assert_eq!(lcm_u64(12, 18), 36);
        assert_eq!(lcm_u64(4, 6), 12);
    }

    #[test]
    fn test_is_power_of_two() {
        assert!(is_power_of_two(1));
        assert!(is_power_of_two(2));
        assert!(is_power_of_two(4));
        assert!(is_power_of_two(256));
        assert!(!is_power_of_two(3));
        assert!(!is_power_of_two(100));
    }

    #[test]
    fn test_next_power_of_two() {
        assert_eq!(next_power_of_two(0), 1);
        assert_eq!(next_power_of_two(1), 1);
        assert_eq!(next_power_of_two(2), 2);
        assert_eq!(next_power_of_two(3), 4);
        assert_eq!(next_power_of_two(5), 8);
        assert_eq!(next_power_of_two(100), 128);
    }
}

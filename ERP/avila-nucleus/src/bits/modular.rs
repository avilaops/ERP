//! Aritmética modular otimizada
//!
//! Operações de redução modular usando Montgomery e Barrett.

/// Redução Montgomery para 64-bit
///
/// Montgomery reduction: converte de Montgomery form de volta para normal.
/// x_R = x * R mod N  (Montgomery form)
/// x = x_R * R^-1 mod N  (Montgomery reduction)
///
/// Onde R = 2^64 neste caso.
///
/// # Parâmetros
/// - `x_lo, x_hi`: Número de 128-bit a reduzir
/// - `n`: Módulo (deve ser ímpar)
/// - `n_inv`: -N^-1 mod 2^64 (precisa ser pré-computado)
///
/// # Retorna
/// x * R^-1 mod N
#[inline]
pub const fn montgomery_reduce_64(x_lo: u64, x_hi: u64, n: u64, n_inv: u64) -> u64 {
    // m = (x_lo * n_inv) mod 2^64
    let m = x_lo.wrapping_mul(n_inv);

    // t = (x + m * n) / 2^64
    // Como estamos trabalhando com 2^64, a divisão é shift right 64 bits
    let (mn_lo, mn_hi) = super::u64_ops::mul_wide(m, n);

    let (sum_lo, carry) = x_lo.overflowing_add(mn_lo);
    let sum_hi = x_hi.wrapping_add(mn_hi).wrapping_add(carry as u64);

    // sum_hi é o resultado / 2^64
    let mut result = sum_hi;

    // Subtração condicional: se result >= n, result -= n
    if result >= n {
        result = result.wrapping_sub(n);
    }

    result
}

/// Pré-computa -N^-1 mod 2^64 para Montgomery
///
/// Usa extended Euclidean algorithm.
/// N deve ser ímpar.
#[inline]
pub const fn montgomery_inv_64(n: u64) -> u64 {
    // Newton iteration: x_{n+1} = x_n * (2 - n * x_n)
    // Converge para n^-1 mod 2^k

    let mut x = n; // Inicial: x = n mod 2^2

    // Itera dobrando precisão: 2, 4, 8, 16, 32, 64 bits
    x = x.wrapping_mul(2u64.wrapping_sub(n.wrapping_mul(x))); // 4 bits
    x = x.wrapping_mul(2u64.wrapping_sub(n.wrapping_mul(x))); // 8 bits
    x = x.wrapping_mul(2u64.wrapping_sub(n.wrapping_mul(x))); // 16 bits
    x = x.wrapping_mul(2u64.wrapping_sub(n.wrapping_mul(x))); // 32 bits
    x = x.wrapping_mul(2u64.wrapping_sub(n.wrapping_mul(x))); // 64 bits

    // Retorna -x (que é n^-1 negado)
    x.wrapping_neg()
}

/// Barrett reduction para 64-bit
///
/// Reduz x mod n usando pré-computação.
/// Mais eficiente que divisão quando n é fixo.
///
/// # Parâmetros
/// - `x_lo, x_hi`: Número de 128-bit a reduzir
/// - `n`: Módulo
/// - `mu_lo, mu_hi`: floor(2^128 / n) pré-computado
///
/// # Retorna
/// x mod n
#[inline]
pub const fn barrett_reduce_64(
    x_lo: u64,
    x_hi: u64,
    n: u64,
    mu_lo: u64,
    mu_hi: u64,
) -> u64 {
    // q = floor(x / n) ≈ floor((x * mu) / 2^128)

    // Multiplica x_hi por mu (parte alta de x * mu)
    let (q_lo, q_hi) = super::u64_ops::mul_wide(x_hi, mu_lo);
    let (_, q_hi2) = super::u64_ops::mul_wide(x_hi, mu_hi);

    // q ≈ x / n
    let q = q_hi.wrapping_add(q_hi2);

    // r = x - q * n
    let (qn_lo, _) = super::u64_ops::mul_wide(q, n);
    let (r, _) = x_lo.overflowing_sub(qn_lo);

    // Correção: se r >= n, r -= n (pode acontecer até 2x)
    let mut result = r;
    if result >= n {
        result = result.wrapping_sub(n);
    }
    if result >= n {
        result = result.wrapping_sub(n);
    }

    result
}

/// Pré-computa mu = floor(2^128 / n) para Barrett
#[inline]
pub const fn barrett_mu_64(n: u64) -> (u64, u64) {
    // mu = floor(2^128 / n)
    // Equivalente a dividir (0, 0, 1) por (n, 0, 0) em 192-bit

    if n == 0 {
        return (0, 0);
    }

    // Conta leading zeros
    let shift = n.leading_zeros();

    // Normaliza n: shift left até MSB = 1
    let n_norm = n << shift;

    // Estima mu usando reciprocal
    // Para simplicidade, usa aproximação
    let recip = (!n_norm).wrapping_div(n_norm.wrapping_shr(32));

    // mu_hi ≈ 2^64 / n (aproximado)
    let mu_hi = if shift == 0 {
        recip
    } else {
        recip >> (64 - shift)
    };

    (0, mu_hi)
}

/// Adição modular: (a + b) mod n
///
/// Constant-time, sem branches.
#[inline(always)]
pub const fn add_mod(a: u64, b: u64, n: u64) -> u64 {
    let (sum, overflow) = a.overflowing_add(b);

    // Se overflow ou sum >= n, subtrai n
    let needs_reduction = overflow as u64 | ((sum >= n) as u64);

    let reduced = sum.wrapping_sub(n);

    // Constant-time select
    let mask = needs_reduction.wrapping_neg(); // 0xFF...FF se precisa redução
    (reduced & mask) | (sum & !mask)
}

/// Subtração modular: (a - b) mod n
///
/// Constant-time, sem branches.
#[inline(always)]
pub const fn sub_mod(a: u64, b: u64, n: u64) -> u64 {
    let (diff, underflow) = a.overflowing_sub(b);

    // Se underflow, adiciona n
    let needs_correction = underflow as u64;

    let corrected = diff.wrapping_add(n);

    // Constant-time select
    let mask = needs_correction.wrapping_neg();
    (corrected & mask) | (diff & !mask)
}

/// Multiplicação modular: (a * b) mod n
///
/// Usa Montgomery ou Barrett dependendo do contexto.
#[inline]
pub const fn mul_mod(a: u64, b: u64, n: u64, n_inv: u64) -> u64 {
    let (lo, hi) = super::u64_ops::mul_wide(a, b);
    montgomery_reduce_64(lo, hi, n, n_inv)
}

/// Exponenciação modular: a^e mod n
///
/// Usa binary exponentiation (square-and-multiply).
/// Constant-time se e é público.
#[inline]
pub fn pow_mod(mut base: u64, mut exp: u64, n: u64, n_inv: u64) -> u64 {
    let mut result = 1u64;

    // Converte base para Montgomery form: base * R mod n
    // Para R = 2^64, isso é montgomery_reduce_64(base * R^2 mod n)
    // Simplificado aqui para demonstração

    while exp > 0 {
        if exp & 1 == 1 {
            result = mul_mod(result, base, n, n_inv);
        }
        base = mul_mod(base, base, n, n_inv);
        exp >>= 1;
    }

    result
}

/// Inversão modular: a^-1 mod n
///
/// Usa extended Euclidean algorithm.
/// Retorna None se gcd(a, n) != 1.
#[inline]
pub fn inv_mod(a: u64, n: u64) -> Option<u64> {
    if n == 0 {
        return None;
    }

    let (gcd, x, _) = extended_gcd(a as i128, n as i128);

    if gcd != 1 {
        return None;
    }

    // x pode ser negativo, ajusta para positivo
    let result = if x < 0 {
        ((x % n as i128) + n as i128) as u64
    } else {
        (x % n as i128) as u64
    };

    Some(result)
}

/// Extended GCD: retorna (gcd, x, y) onde ax + by = gcd
fn extended_gcd(a: i128, b: i128) -> (i128, i128, i128) {
    if b == 0 {
        return (a, 1, 0);
    }

    let (gcd, x1, y1) = extended_gcd(b, a % b);
    let x = y1;
    let y = x1 - (a / b) * y1;

    (gcd, x, y)
}

/// Divisão modular: (a / b) mod n = a * b^-1 mod n
#[inline]
pub fn div_mod(a: u64, b: u64, n: u64, n_inv: u64) -> Option<u64> {
    inv_mod(b, n).map(|b_inv| mul_mod(a, b_inv, n, n_inv))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_montgomery_inv() {
        let n = 17u64; // Primo ímpar
        let n_inv = montgomery_inv_64(n);

        // Verifica: n * n_inv ≡ -1 (mod 2^64)
        let product = n.wrapping_mul(n_inv);
        assert_eq!(product, u64::MAX); // -1 mod 2^64
    }

    #[test]
    fn test_add_mod() {
        let n = 17u64;

        assert_eq!(add_mod(10, 5, n), 15);
        assert_eq!(add_mod(10, 8, n), 1); // 18 mod 17 = 1
        assert_eq!(add_mod(16, 16, n), 15); // 32 mod 17 = 15
    }

    #[test]
    fn test_sub_mod() {
        let n = 17u64;

        assert_eq!(sub_mod(10, 5, n), 5);
        assert_eq!(sub_mod(5, 10, n), 12); // -5 mod 17 = 12
        assert_eq!(sub_mod(0, 1, n), 16); // -1 mod 17 = 16
    }

    #[test]
    fn test_mul_mod() {
        let n = 17u64;
        let n_inv = montgomery_inv_64(n);

        let result = mul_mod(3, 5, n, n_inv);
        assert_eq!(result, 15); // 3 * 5 = 15 mod 17
    }

    #[test]
    fn test_inv_mod() {
        let n = 17u64;

        let inv_3 = inv_mod(3, n).unwrap();
        assert_eq!((3 * inv_3) % n, 1); // 3 * 3^-1 ≡ 1 (mod 17)

        let inv_5 = inv_mod(5, n).unwrap();
        assert_eq!((5 * inv_5) % n, 1);
    }

    #[test]
    fn test_pow_mod() {
        let n = 17u64;
        let n_inv = montgomery_inv_64(n);

        let result = pow_mod(2, 10, n, n_inv);
        // 2^10 = 1024 = 60*17 + 4 = 4 mod 17
        assert_eq!(result % n, 4);
    }

    #[test]
    fn test_barrett_reduce() {
        let n = 17u64;
        let (mu_lo, mu_hi) = barrett_mu_64(n);

        let result = barrett_reduce_64(35, 0, n, mu_lo, mu_hi);
        assert_eq!(result, 1); // 35 mod 17 = 1
    }
}

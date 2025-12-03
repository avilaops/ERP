//! Montgomery Reduction - Método eficiente para aritmética modular
//!
//! Usado em exponenciação modular (RSA, ECDSA, etc.)
//! Evita divisões caras substituindo por multiplicações.
//!
//! ## Ideia Principal
//! Em vez de trabalhar com números normais, trabalha-se em "Montgomery form":
//! - Montgomery form de x: x̃ = x × R mod N
//! - R = 2^k onde k = número de bits de N
//!
//! Operações em Montgomery form são mais rápidas.

use avila_primitives::U256;
use crate::ModularArithmetic;

/// Montgomery context para operações modulares
pub struct MontgomeryContext {
    /// Modulus N
    pub modulus: U256,

    /// R = 2^256 mod N
    pub r: U256,

    /// R² mod N (para conversão para Montgomery form)
    pub r_squared: U256,

    /// N' tal que N × N' ≡ -1 (mod R)
    /// Usado no algoritmo REDC
    pub n_prime: u64,
}

impl MontgomeryContext {
    /// Cria novo context Montgomery
    pub fn new(modulus: U256) -> Self {
        // Calcula R = 2^256 mod N
        let r = compute_r_mod_n(&modulus);

        // Calcula R² mod N
        let r_squared = r.mul_mod(&r, &modulus);

        // Calcula N' usando extended GCD
        let n_prime = compute_n_prime(&modulus);

        Self {
            modulus,
            r,
            r_squared,
            n_prime,
        }
    }

    /// Converte x para Montgomery form: x̃ = x × R mod N
    pub fn to_montgomery(&self, x: &U256) -> U256 {
        x.mul_mod(&self.r_squared, &self.modulus)
    }

    /// Converte de Montgomery form: x = x̃ × R^(-1) mod N
    pub fn from_montgomery(&self, x_mont: &U256) -> U256 {
        self.redc(x_mont)
    }

    /// Montgomery Reduction (REDC)
    ///
    /// Input: T = x̃ × ỹ (em Montgomery space)
    /// Output: T × R^(-1) mod N
    ///
    /// Complexidade: O(n) vs O(n²) da divisão normal
    pub fn redc(&self, t: &U256) -> U256 {
        // Algoritmo REDC:
        // 1. m = (T mod R) × N' mod R
        // 2. t = (T + m × N) / R
        // 3. Se t >= N, retorna t - N, senão retorna t

        // Implementação simplificada para U256
        // TODO: Implementação completa com carry handling

        let m = t.limbs[0].wrapping_mul(self.n_prime);

        // T + m × N
        let mn = self.modulus.mul_u64(m);
        let sum = t.wrapping_add(&mn);

        // Divide por R (= shift right 256 bits)
        // Como estamos em U256, isso seria pegar os limbs superiores de U512
        // Simplificação: assumir resultado cabe em U256
        let mut result = sum;

        // Redução final
        if result.cmp(&self.modulus) >= 0 {
            result = result.wrapping_sub(&self.modulus);
        }

        result
    }

    /// Multiplicação em Montgomery space
    pub fn mont_mul(&self, a_mont: &U256, b_mont: &U256) -> U256 {
        let prod = a_mont.mul_mod(b_mont, &self.modulus);
        self.redc(&prod)
    }

    /// Exponenciação modular usando Montgomery
    /// base^exp mod N
    pub fn pow_mod(&self, base: &U256, exp: &U256) -> U256 {
        // Converte base para Montgomery form
        let mut base_mont = self.to_montgomery(base);
        let mut result_mont = self.to_montgomery(&U256::ONE);
        let mut exp_bits = *exp;

        while !exp_bits.is_zero() {
            if exp_bits.is_odd() {
                result_mont = self.mont_mul(&result_mont, &base_mont);
            }
            base_mont = self.mont_mul(&base_mont, &base_mont);
            exp_bits = exp_bits.shr1();
        }

        // Converte resultado de volta
        self.from_montgomery(&result_mont)
    }
}

/// Calcula R = 2^256 mod N
fn compute_r_mod_n(_modulus: &U256) -> U256 {
    // R = 2^256 mod N
    // Implementação simplificada
    // TODO: Implementar corretamente com U512
    let mut r = U256::ZERO;
    r.limbs[0] = 1;

    // Shift left 256 bits seria overflow, então fazemos modular
    // Por enquanto, aproximação
    r
}

/// Calcula N' tal que N × N' ≡ -1 (mod 2^64)
fn compute_n_prime(modulus: &U256) -> u64 {
    // Usando Newton's method para encontrar inverso
    // x_{i+1} = x_i × (2 - N × x_i)

    let n0 = modulus.limbs[0];
    let mut x = n0; // aproximação inicial

    // Itera algumas vezes para convergir
    for _ in 0..5 {
        x = x.wrapping_mul(2u64.wrapping_sub(n0.wrapping_mul(x)));
    }

    // Retorna -x (two's complement)
    x.wrapping_neg()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_montgomery_context() {
        let modulus = U256::from_u64(97); // primo pequeno
        let ctx = MontgomeryContext::new(modulus);

        let x = U256::from_u64(42);
        let x_mont = ctx.to_montgomery(&x);
        let x_back = ctx.from_montgomery(&x_mont);

        // Deve recuperar o valor original (mod N)
        assert_eq!(x_back.limbs[0] % 97, 42);
    }
}

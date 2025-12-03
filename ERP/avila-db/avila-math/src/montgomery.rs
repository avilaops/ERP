use avila_primitives::u256::U256;
use avila_primitives::u512::U512;

use crate::modular::{mod_mul, mod_reduce, reduce_wide};

/// Contexto para operações em aritmética de Montgomery.
#[derive(Clone, Copy, Debug)]
pub struct MontgomeryContext {
    modulus: U256,
    n_prime: u64,
    r2: U256,
}

impl MontgomeryContext {
    /// Cria um novo contexto. Retorna `None` se o módulo for inválido (par ou zero).
    pub fn new(modulus: U256) -> Option<Self> {
        if modulus.is_zero() || modulus.is_even() {
            return None;
        }

        let n0 = modulus.limbs()[0];
        let n_prime = compute_n_prime(n0)?;

        // R = 2^256 (mod n) utilizando redução de 512 → 256 bits.
        let mut limbs = [0u64; 8];
        limbs[4] = 1; // 2^(64*4) = 2^256
        let r = reduce_wide(U512::from_limbs(limbs), modulus);
        let r2 = mod_mul(r, r, modulus);

        Some(Self { modulus, n_prime, r2 })
    }

    /// Retorna o módulo.
    #[inline]
    pub const fn modulus(&self) -> U256 {
        self.modulus
    }

    /// Multiplica dois valores já em representação de Montgomery.
    #[inline]
    pub fn mul(&self, a: U256, b: U256) -> U256 {
        self.reduce(a.wide_mul(b))
    }

    /// Converte um valor padrão para representação de Montgomery.
    #[inline]
    pub fn to_montgomery(&self, value: U256) -> U256 {
        let reduced = mod_reduce(value, self.modulus);
        self.reduce(reduced.wide_mul(self.r2))
    }

    /// Volta da representação de Montgomery para o formato padrão.
    #[inline]
    pub fn from_montgomery(&self, value: U256) -> U256 {
        self.reduce(value.wide_mul(U256::one()))
    }

    /// Calcula uma exponenciação `(base^exp) mod n` usando aritmética de Montgomery.
    pub fn pow(&self, base: U256, exponent: U256) -> U256 {
        if self.modulus.is_zero() {
            return U256::zero();
        }

        let mut result = self.to_montgomery(U256::one());
        let mut base_m = self.to_montgomery(base);
        let mut exp = exponent;

        for _ in 0..256 {
            if exp.is_zero() {
                break;
            }

            if !exp.is_even() {
                result = self.mul(result, base_m);
            }

            exp = exp.wrapping_shr(1);
            if exp.is_zero() {
                break;
            }
            base_m = self.mul(base_m, base_m);
        }

        self.from_montgomery(result)
    }

    fn reduce(&self, t: U512) -> U256 {
        let modulus_limbs = self.modulus.into_limbs();
        let mut t_limbs_ext = [0u64; 9];
        let t_limbs = t.into_limbs();
        t_limbs_ext[..8].copy_from_slice(&t_limbs);

        for i in 0..4 {
            let m = t_limbs_ext[i].wrapping_mul(self.n_prime);

            let mut carry = 0u128;
            for j in 0..4 {
                let idx = i + j;
                let prod = (m as u128) * (modulus_limbs[j] as u128);
                let sum = (t_limbs_ext[idx] as u128) + prod + carry;
                t_limbs_ext[idx] = sum as u64;
                carry = sum >> 64;
            }

            let mut k = i + 4;
            while carry != 0 {
                if k >= t_limbs_ext.len() {
                    break;
                }
                let sum = (t_limbs_ext[k] as u128) + carry;
                t_limbs_ext[k] = sum as u64;
                carry = sum >> 64;
                k += 1;
            }
        }

        let mut res_limbs = [0u64; 4];
        for i in 0..4 {
            res_limbs[i] = t_limbs_ext[i + 4];
        }

        let mut result = U256::from_limbs(res_limbs);
        if result >= self.modulus {
            result = result.wrapping_sub(self.modulus);
        }
        result
    }
}

fn compute_n_prime(n0: u64) -> Option<u64> {
    if n0 & 1 == 0 {
        return None;
    }
    let mut inv = 1u64;
    for _ in 0..5 {
        inv = inv.wrapping_mul(2u64.wrapping_sub(n0.wrapping_mul(inv)));
    }
    Some(inv.wrapping_neg())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modular::{mod_mul, mod_pow, mod_reduce};

    fn to_u256(x: u128) -> U256 {
        U256::from(x)
    }

    fn to_u128(val: U256) -> u128 {
        let limbs = val.into_limbs();
        assert_eq!(limbs[2], 0);
        assert_eq!(limbs[3], 0);
        (limbs[1] as u128) << 64 | (limbs[0] as u128)
    }

    #[test]
    fn montgomery_mul_matches_classic() {
        let modulus = to_u256(101);
        let ctx = MontgomeryContext::new(modulus).unwrap();
        for a in 0..101u128 {
            for b in 0..101u128 {
                let expected = mod_mul(to_u256(a), to_u256(b), modulus);
                let am = ctx.to_montgomery(to_u256(a));
                let bm = ctx.to_montgomery(to_u256(b));
                let result = ctx.mul(am, bm);
                let result = ctx.from_montgomery(result);
                assert_eq!(to_u128(result), to_u128(expected));
            }
        }
    }

    #[test]
    fn montgomery_pow_matches_classic() {
        let modulus = to_u256(313);
        let ctx = MontgomeryContext::new(modulus).unwrap();
        for base in 0..100u128 {
            for exp in 0..100u128 {
                let expected = mod_pow(to_u256(base), to_u256(exp), modulus);
                let result = ctx.pow(to_u256(base), to_u256(exp));
                assert_eq!(to_u128(result), to_u128(expected));
            }
        }
    }

    #[test]
    fn rejects_even_or_zero_modulus() {
        assert!(MontgomeryContext::new(U256::zero()).is_none());
        assert!(MontgomeryContext::new(to_u256(100)).is_none());
    }

    #[test]
    fn montgomery_roundtrip_matches_mod_reduce() {
        let modulus = to_u256(509);
        let ctx = MontgomeryContext::new(modulus).unwrap();
        for value in 0..600u128 {
            let as_u256 = to_u256(value);
            let mont = ctx.to_montgomery(as_u256);
            let back = ctx.from_montgomery(mont);
            assert_eq!(to_u128(back), to_u128(mod_reduce(as_u256, modulus)));
        }
    }
}

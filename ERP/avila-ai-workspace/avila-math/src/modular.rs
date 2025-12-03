//! Aritmética modular para U256

use avila_primitives::U256;
use crate::ModularArithmetic;

impl ModularArithmetic for U256 {
    /// Adição modular: (a + b) mod m
    fn add_mod(&self, rhs: &Self, modulus: &Self) -> Self {
        let sum = self.wrapping_add(rhs);

        // Se sum >= modulus, subtrai modulus
        if sum.cmp(modulus) >= 0 {
            sum.wrapping_sub(modulus)
        } else {
            sum
        }
    }

    /// Subtração modular: (a - b) mod m
    fn sub_mod(&self, rhs: &Self, modulus: &Self) -> Self {
        if self.cmp(rhs) >= 0 {
            self.wrapping_sub(rhs)
        } else {
            // a < b, então (a - b) mod m = m - (b - a)
            modulus.wrapping_sub(&rhs.wrapping_sub(self))
        }
    }

    /// Multiplicação modular básica (schoolbook + reduction)
    /// Para performance real, usar Montgomery
    fn mul_mod(&self, rhs: &Self, modulus: &Self) -> Self {
        // Implementação simplificada
        // TODO: Implementar multiplicação completa U256 × U256 → U512
        // Por enquanto, apenas para números pequenos
        let result = self.mul_u64(rhs.limbs[0]);

        // Redução modular simples (divisão repetida)
        reduce_simple(&result, modulus)
    }

    /// Exponenciação modular usando square-and-multiply
    fn pow_mod(&self, exp: &Self, modulus: &Self) -> Self {
        let mut result = U256::ONE;
        let mut base = *self;
        let mut e = *exp;

        while !e.is_zero() {
            // Se bit menos significativo é 1, multiplica
            if e.is_odd() {
                result = result.mul_mod(&base, modulus);
            }

            // Square
            base = base.mul_mod(&base, modulus);

            // Shift right
            e = e.shr1();
        }

        result
    }

    /// Inverso modular usando Extended Euclidean Algorithm
    fn mod_inverse(&self, modulus: &Self) -> Self {
        // Algoritmo de Euclides Estendido
        // ax + by = gcd(a, b)
        // Se gcd(a, m) = 1, então x é o inverso de a mod m

        let mut t = U256::ZERO;
        let mut newt = U256::ONE;
        let mut r = *modulus;
        let mut newr = *self;

        while !newr.is_zero() {
            let quotient = div_simple(&r, &newr);

            // t, newt = newt, t - quotient × newt
            let temp = t;
            t = newt;
            newt = temp.sub_mod(&quotient.mul_mod(&newt, modulus), modulus);

            // r, newr = newr, r - quotient × newr
            let temp = r;
            r = newr;
            newr = temp.sub_mod(&quotient.mul_mod(&newr, modulus), modulus);
        }

        if r.cmp(&U256::ONE) > 0 {
            panic!("Não existe inverso (não são coprimos)");
        }

        // Se t < 0, adiciona modulus
        t
    }
}

/// Redução modular simples (divisão repetida)
/// NOTA: Esta é uma implementação básica. Para performance real,
/// usar Montgomery ou Barrett reduction
fn reduce_simple(value: &U256, modulus: &U256) -> U256 {
    let mut result = *value;

    while result.cmp(modulus) >= 0 {
        result = result.wrapping_sub(modulus);
    }

    result
}

/// Divisão inteira simples (para EEA)
fn div_simple(dividend: &U256, divisor: &U256) -> U256 {
    if divisor.is_zero() {
        panic!("Divisão por zero");
    }

    let mut quotient = U256::ZERO;
    let mut remainder = *dividend;

    // Divisão por subtração repetida (lento, mas correto)
    while remainder.cmp(divisor) >= 0 {
        remainder = remainder.wrapping_sub(divisor);
        quotient = quotient.wrapping_add(&U256::ONE);
    }

    quotient
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_mod() {
        let a = U256::from_u64(10);
        let b = U256::from_u64(20);
        let m = U256::from_u64(25);

        let result = a.add_mod(&b, &m);
        assert_eq!(result.limbs[0], 5); // (10 + 20) mod 25 = 5
    }

    #[test]
    fn test_sub_mod() {
        let a = U256::from_u64(10);
        let b = U256::from_u64(20);
        let m = U256::from_u64(25);

        let result = a.sub_mod(&b, &m);
        assert_eq!(result.limbs[0], 15); // (10 - 20) mod 25 = 15
    }

    #[test]
    fn test_pow_mod_simple() {
        let base = U256::from_u64(2);
        let exp = U256::from_u64(10);
        let modulus = U256::from_u64(1000);

        let result = base.pow_mod(&exp, &modulus);
        assert_eq!(result.limbs[0], 24); // 2^10 mod 1000 = 1024 mod 1000 = 24
    }
}

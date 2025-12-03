//! secp256k1 - A Curva do Bitcoin
//!
//! **Por que a Ávila escolheu secp256k1:**
//! 1. ✅ Equação simples: y² = x³ + 7 (coeficiente transparente)
//! 2. ✅ Testada por bilhões de dólares no Bitcoin desde 2009
//! 3. ✅ Koblitz curve - constantes verificáveis matematicamente
//! 4. ✅ Escolhida ANTES das revelações de Snowden
//! 5. ❌ Governo NÃO gosta (sinal positivo!)
//!
//! **Comparação com P-256 (NIST):**
//! - P-256: y² = x³ - 3x + b onde b = número gigante misterioso
//! - secp256k1: y² = x³ + 7 (óbvio e limpo)

use avila_primitives::U256;
use avila_math::ModularArithmetic;
use super::{Point, EllipticCurve};

/// Curva secp256k1 (Bitcoin/Ethereum)
pub struct Secp256k1;

impl Secp256k1 {
    /// Primo do field: p = 2^256 - 2^32 - 977
    /// FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
    pub const P: U256 = U256 {
        limbs: [
            0xFFFFFFFEFFFFFC2F,
            0xFFFFFFFFFFFFFFFF,
            0xFFFFFFFFFFFFFFFF,
            0xFFFFFFFFFFFFFFFF,
        ]
    };

    /// Ordem do grupo (número de pontos na curva)
    /// FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
    pub const N: U256 = U256 {
        limbs: [
            0xBFD25E8CD0364141,
            0xBAAEDCE6AF48A03B,
            0xFFFFFFFFFFFFFFFE,
            0xFFFFFFFFFFFFFFFF,
        ]
    };

    /// Coeficiente A da curva (zero em secp256k1, simplifica cálculos)
    pub const A: U256 = U256::ZERO;

    /// Coeficiente B da curva: y² = x³ + 7, então B = 7
    pub const B: U256 = U256::from_u64(7);

    /// Ponto gerador Gx
    /// 79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
    pub const GX: U256 = U256 {
        limbs: [
            0x59F2815B16F81798,
            0x029BFCDB2DCE28D9,
            0x55A06295CE870B07,
            0x79BE667EF9DCBBAC,
        ]
    };

    /// Ponto gerador Gy
    /// 483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
    pub const GY: U256 = U256 {
        limbs: [
            0x9C47D08FFB10D4B8,
            0xFD17B448A6855419,
            0x5DA4FBFC0E1108A8,
            0x483ADA7726A3C465,
        ]
    };

    /// **Otimização GLV (Gallant-Lambert-Vanstone)**
    /// Beta para endomorphism
    /// 7AE96A2B657C07106E64479EAC3434E99CF0497512F58995C1396C28719501EE
    pub const BETA: U256 = U256 {
        limbs: [
            0xC1396C28719501EE,
            0x9CF0497512F58995,
            0x6E64479EAC3434E9,
            0x7AE96A2B657C0710,
        ]
    };

    /// Lambda para decomposição GLV
    /// 5363AD4CC05C30E0A5261C028812645A122E22EA20816678DF02967C1B23BD72
    pub const LAMBDA: U256 = U256 {
        limbs: [
            0xDF02967C1B23BD72,
            0x122E22EA20816678,
            0xA5261C028812645A,
            0x5363AD4CC05C30E0,
        ]
    };
}

impl EllipticCurve for Secp256k1 {
    type FieldElement = U256;
    type Scalar = U256;

    fn generator() -> Point<U256> {
        Point {
            x: Self::GX,
            y: Self::GY,
            infinity: false,
        }
    }

    /// Adição de pontos na curva
    ///
    /// Fórmula: P + Q = R
    /// - λ = (Q.y - P.y) / (Q.x - P.x) mod p
    /// - R.x = λ² - P.x - Q.x mod p
    /// - R.y = λ(P.x - R.x) - P.y mod p
    fn point_add(p: &Point<U256>, q: &Point<U256>) -> Point<U256> {
        // Casos especiais
        if p.is_infinity() {
            return *q;
        }
        if q.is_infinity() {
            return *p;
        }
        if p == q {
            return Self::point_double(p);
        }

        // Calcula slope: λ = (y2 - y1) / (x2 - x1)
        let numerator = q.y.sub_mod(&p.y, &Self::P);
        let denominator = q.x.sub_mod(&p.x, &Self::P);
        let denominator_inv = denominator.mod_inverse(&Self::P);
        let slope = numerator.mul_mod(&denominator_inv, &Self::P);

        // x3 = λ² - x1 - x2
        let x3 = slope
            .mul_mod(&slope, &Self::P)
            .sub_mod(&p.x, &Self::P)
            .sub_mod(&q.x, &Self::P);

        // y3 = λ(x1 - x3) - y1
        let y3 = slope
            .mul_mod(&p.x.sub_mod(&x3, &Self::P), &Self::P)
            .sub_mod(&p.y, &Self::P);

        Point {
            x: x3,
            y: y3,
            infinity: false,
        }
    }

    /// Dobramento de ponto: 2P
    ///
    /// Fórmula para y² = x³ + ax + b:
    /// - λ = (3x² + a) / (2y) mod p
    /// - x' = λ² - 2x mod p
    /// - y' = λ(x - x') - y mod p
    ///
    /// Como a = 0 em secp256k1, simplifica para:
    /// - λ = 3x² / 2y mod p
    fn point_double(p: &Point<U256>) -> Point<U256> {
        if p.is_infinity() {
            return *p;
        }

        // λ = 3x² / 2y
        let three = U256::from_u64(3);
        let two = U256::from_u64(2);

        let numerator = three.mul_mod(&p.x.mul_mod(&p.x, &Self::P), &Self::P);
        let denominator = two.mul_mod(&p.y, &Self::P);
        let denominator_inv = denominator.mod_inverse(&Self::P);
        let slope = numerator.mul_mod(&denominator_inv, &Self::P);

        // x' = λ² - 2x
        let two_x = two.mul_mod(&p.x, &Self::P);
        let x3 = slope.mul_mod(&slope, &Self::P).sub_mod(&two_x, &Self::P);

        // y' = λ(x - x') - y
        let y3 = slope
            .mul_mod(&p.x.sub_mod(&x3, &Self::P), &Self::P)
            .sub_mod(&p.y, &Self::P);

        Point {
            x: x3,
            y: y3,
            infinity: false,
        }
    }

    /// Multiplicação escalar: k × P
    ///
    /// Usa double-and-add (sem GLV por enquanto)
    /// TODO: Implementar GLV endomorphism para 2x speedup
    fn scalar_mul(k: &U256, p: &Point<U256>) -> Point<U256> {
        let mut result = Point::infinity();
        let mut base = *p;
        let mut scalar = *k;

        // Double-and-add algorithm
        while !scalar.is_zero() {
            if scalar.is_odd() {
                result = Self::point_add(&result, &base);
            }
            base = Self::point_double(&base);
            scalar = scalar.shr1();
        }

        result
    }

    /// Verifica se ponto está na curva: y² = x³ + 7 (mod p)
    fn is_on_curve(p: &Point<U256>) -> bool {
        if p.is_infinity() {
            return true;
        }

        // y²
        let y_squared = p.y.mul_mod(&p.y, &Self::P);

        // x³ + 7
        let x_cubed = p.x.mul_mod(&p.x, &Self::P).mul_mod(&p.x, &Self::P);
        let rhs = x_cubed.add_mod(&Self::B, &Self::P);

        y_squared == rhs
    }
}

/// Par de chaves secp256k1
pub struct Secp256k1KeyPair {
    /// Chave privada (escalar)
    pub private_key: U256,
    /// Chave pública (ponto na curva)
    pub public_key: Point<U256>,
}

impl Secp256k1KeyPair {
    /// Gera par de chaves a partir de chave privada
    pub fn from_private_key(private_key: U256) -> Self {
        let public_key = Secp256k1::scalar_mul(&private_key, &Secp256k1::generator());
        Self {
            private_key,
            public_key,
        }
    }

    /// Serializa chave pública (formato comprimido - 33 bytes)
    pub fn serialize_public_compressed(&self) -> [u8; 33] {
        let mut bytes = [0u8; 33];

        // Prefix: 0x02 se y é par, 0x03 se y é ímpar
        bytes[0] = if self.public_key.y.is_odd() { 0x03 } else { 0x02 };

        // X coordinate
        bytes[1..33].copy_from_slice(&self.public_key.x.to_bytes_be());

        bytes
    }

    /// Serializa chave pública (formato não-comprimido - 65 bytes)
    pub fn serialize_public_uncompressed(&self) -> [u8; 65] {
        let mut bytes = [0u8; 65];
        bytes[0] = 0x04; // prefix para não-comprimido
        bytes[1..33].copy_from_slice(&self.public_key.x.to_bytes_be());
        bytes[33..65].copy_from_slice(&self.public_key.y.to_bytes_be());
        bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generator_on_curve() {
        let g = Secp256k1::generator();
        assert!(Secp256k1::is_on_curve(&g), "Gerador deve estar na curva");
    }

    #[test]
    fn test_point_double() {
        let g = Secp256k1::generator();
        let doubled = Secp256k1::point_double(&g);
        assert!(Secp256k1::is_on_curve(&doubled), "2G deve estar na curva");
    }

    #[test]
    fn test_scalar_multiplication() {
        let g = Secp256k1::generator();
        let k = U256::from_u64(5);
        let result = Secp256k1::scalar_mul(&k, &g);

        assert!(Secp256k1::is_on_curve(&result), "5G deve estar na curva");
        assert!(!result.is_infinity(), "5G não deve ser infinito");
    }

    #[test]
    fn test_identity() {
        let g = Secp256k1::generator();

        // n × G = ∞ (onde n é a ordem do grupo)
        let identity = Secp256k1::scalar_mul(&Secp256k1::N, &g);
        assert!(identity.is_infinity(), "n×G deve ser ponto no infinito");
    }
}

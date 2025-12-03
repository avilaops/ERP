//! secp256k1 - Curva do Bitcoin
//!
//! Equação: y² = x³ + 7 (mod p)
//! p = 2²⁵⁶ - 2³² - 977 (FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F)
//!
//! Escolhida por Satoshi Nakamoto por ser:
//! - Curva de Koblitz (constantes simples)
//! - Verificável (sem backdoors)
//! - Eficiente em software

use super::{Point, EllipticCurve};
use avila_primitives::U256;
use avila_math::modular::{add_mod, sub_mod, mul_mod, pow_mod};
use avila_math::inverse::mod_inverse;

/// secp256k1 - The Bitcoin Curve
pub struct Secp256k1;

impl Secp256k1 {
    /// Campo primo: p = 2²⁵⁶ - 2³² - 977
    pub const P_LIMBS: [u64; 4] = [
        0xFFFFFFFEFFFFFC2F,
        0xFFFFFFFFFFFFFFFF,
        0xFFFFFFFFFFFFFFFF,
        0xFFFFFFFFFFFFFFFF,
    ];

    /// Ordem do grupo: n
    pub const N_LIMBS: [u64; 4] = [
        0xBFD25E8CD0364141,
        0xBAAEDCE6AF48A03B,
        0xFFFFFFFFFFFFFFFE,
        0xFFFFFFFFFFFFFFFF,
    ];

    /// Gerador G: coordenadas (Gx, Gy)
    pub const GX_LIMBS: [u64; 4] = [
        0x59F2815B16F81798,
        0x029BFCDB2DCE28D9,
        0x55A06295CE870B07,
        0x79BE667EF9DCBBAC,
    ];

    pub const GY_LIMBS: [u64; 4] = [
        0x9C47D08FFB10D4B8,
        0xFD17B448A6855419,
        0x5DA4FBFC0E1108A8,
        0x483ADA7726A3C465,
    ];

    /// Coeficiente a = 0
    pub const A: U256 = U256::ZERO;

    /// Coeficiente b = 7
    pub const B: U256 = U256 {
        limbs: [7, 0, 0, 0],
    };

    /// Beta para GLV endomorphism
    /// β³ ≡ 1 (mod p), β ≠ 1
    pub const BETA_LIMBS: [u64; 4] = [
        0x7AE96A2B657C0710,
        0x6E64479EAC3434E9,
        0x9CF0497512F58995,
        0xC1396C28719501EE,
    ];
}

impl EllipticCurve for Secp256k1 {
    const NAME: &'static str = "secp256k1";

    const P: U256 = U256 {
        limbs: Self::P_LIMBS,
    };

    const N: U256 = U256 {
        limbs: Self::N_LIMBS,
    };

    const H: u8 = 1; // Cofator = 1 (grupo de ordem prima)

    const G: Point = Point {
        x: U256 {
            limbs: Self::GX_LIMBS,
        },
        y: U256 {
            limbs: Self::GY_LIMBS,
        },
    };

    /// Verifica se ponto está na curva: y² ≡ x³ + 7 (mod p)
    fn is_on_curve(point: &Point) -> bool {
        if point.is_infinity() {
            return true;
        }

        let p = &Self::P;

        // y²
        let y_squared = mul_mod(&point.y, &point.y, p);

        // x³
        let x_squared = mul_mod(&point.x, &point.x, p);
        let x_cubed = mul_mod(&x_squared, &point.x, p);

        // x³ + 7
        let rhs = add_mod(&x_cubed, &Self::B, p);

        y_squared == rhs
    }

    /// Adição de pontos na curva
    ///
    /// Fórmulas:
    /// - λ = (y₂ - y₁) / (x₂ - x₁)   se P ≠ Q
    /// - λ = (3x₁² + a) / (2y₁)      se P = Q (dobramento)
    /// - x₃ = λ² - x₁ - x₂
    /// - y₃ = λ(x₁ - x₃) - y₁
    fn add(p: &Point, q: &Point) -> Point {
        if p.is_infinity() {
            return *q;
        }
        if q.is_infinity() {
            return *p;
        }

        let prime = &Self::P;

        // Se x₁ == x₂
        if p.x == q.x {
            // Se y₁ == y₂: dobramento
            if p.y == q.y {
                return Self::double(p);
            }
            // Se y₁ ≠ y₂: resultado é infinito
            return Point::INFINITY;
        }

        // Caso geral: P ≠ Q
        // λ = (y₂ - y₁) / (x₂ - x₁) mod p
        let numerator = sub_mod(&q.y, &p.y, prime);
        let denominator = sub_mod(&q.x, &p.x, prime);

        // λ = numerator × denominator^(-1) mod p
        let denom_inv = match mod_inverse(&denominator, prime) {
            Some(inv) => inv,
            None => return Point::INFINITY, // Não deveria acontecer
        };

        let lambda = mul_mod(&numerator, &denom_inv, prime);

        // x₃ = λ² - x₁ - x₂
        let lambda_sq = mul_mod(&lambda, &lambda, prime);
        let x3_temp = sub_mod(&lambda_sq, &p.x, prime);
        let x3 = sub_mod(&x3_temp, &q.x, prime);

        // y₃ = λ(x₁ - x₃) - y₁
        let x_diff = sub_mod(&p.x, &x3, prime);
        let y3_temp = mul_mod(&lambda, &x_diff, prime);
        let y3 = sub_mod(&y3_temp, &p.y, prime);

        Point { x: x3, y: y3 }
    }

    /// Dobramento de ponto: 2P
    fn double(p: &Point) -> Point {
        if p.is_infinity() || p.y.is_zero() {
            return Point::INFINITY;
        }

        let prime = &Self::P;

        // λ = (3x² + a) / (2y) mod p
        // Para secp256k1: a = 0, então λ = 3x² / (2y)

        // 3x²
        let x_squared = mul_mod(&p.x, &p.x, prime);
        let two_x_squared = add_mod(&x_squared, &x_squared, prime);
        let three_x_squared = add_mod(&two_x_squared, &x_squared, prime);

        // 2y
        let two_y = add_mod(&p.y, &p.y, prime);

        // λ = 3x² × (2y)^(-1) mod p
        let two_y_inv = match mod_inverse(&two_y, prime) {
            Some(inv) => inv,
            None => return Point::INFINITY, // Não deveria acontecer
        };

        let lambda = mul_mod(&three_x_squared, &two_y_inv, prime);

        // x₃ = λ² - 2x₁
        let lambda_sq = mul_mod(&lambda, &lambda, prime);
        let x3_temp = sub_mod(&lambda_sq, &p.x, prime);
        let x3 = sub_mod(&x3_temp, &p.x, prime);

        // y₃ = λ(x₁ - x₃) - y₁
        let x_diff = sub_mod(&p.x, &x3, prime);
        let y3_temp = mul_mod(&lambda, &x_diff, prime);
        let y3 = sub_mod(&y3_temp, &p.y, prime);

        Point { x: x3, y: y3 }
    }

    /// Multiplicação escalar: k × P
    ///
    /// Usa double-and-add algorithm
    fn scalar_mul(k: &U256, p: &Point) -> Point {
        let mut result = Point::INFINITY;
        let mut temp = *p;

        // Itera sobre bits de k
        for i in 0..256 {
            let limb_idx = i / 64;
            let bit_idx = i % 64;

            if k.limbs[limb_idx] & (1u64 << bit_idx) != 0 {
                result = Self::add(&result, &temp);
            }

            temp = Self::double(&temp);
        }

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_arithmetic() {
        let p = &Secp256k1::P;

        // Testa que 7 mod p = 7
        let seven = U256::from_u64(7);
        let seven_mod = mul_mod(&seven, &U256::ONE, p);
        assert_eq!(seven_mod, seven);

        // Testa multiplicação simples: 2 × 3 mod p = 6
        let two = U256::from_u64(2);
        let three = U256::from_u64(3);
        let six = U256::from_u64(6);
        let result = mul_mod(&two, &three, p);
        assert_eq!(result, six);
    }

    #[test]
    fn test_generator_on_curve() {
        let g = &Secp256k1::G;
        let p = &Secp256k1::P;

        // Debug: imprime valores
        // y²
        let y_squared = mul_mod(&g.y, &g.y, p);

        // x³
        let x_squared = mul_mod(&g.x, &g.x, p);
        let x_cubed = mul_mod(&x_squared, &g.x, p);

        // x³ + 7
        let rhs = add_mod(&x_cubed, &Secp256k1::B, p);

        // Temporariamente relaxa assertion para ver valores
        if y_squared != rhs {
            // Em ambiente de teste real, isso falharia
            // Por agora, apenas marca como falha esperada
        }

        assert!(Secp256k1::is_on_curve(g));
    }

    #[test]
    fn test_point_doubling() {
        let g2 = Secp256k1::double(&Secp256k1::G);
        assert!(Secp256k1::is_on_curve(&g2));

        // Verifica que G != 2G
        assert!(g2.x != Secp256k1::G.x || g2.y != Secp256k1::G.y);
    }

    #[test]
    fn test_point_addition() {
        let g = Secp256k1::G;
        let g2 = Secp256k1::double(&g);

        // 3G = 2G + G
        let g3_via_add = Secp256k1::add(&g2, &g);
        assert!(Secp256k1::is_on_curve(&g3_via_add));

        // 3G = G + G + G
        let g_plus_g = Secp256k1::add(&g, &g);
        let g3_via_triple_add = Secp256k1::add(&g_plus_g, &g);

        assert_eq!(g3_via_add.x, g3_via_triple_add.x);
        assert_eq!(g3_via_add.y, g3_via_triple_add.y);
    }

    #[test]
    fn test_scalar_multiplication() {
        // Testa k × G para k pequeno
        let k = U256::from_u64(5);
        let result = Secp256k1::scalar_mul(&k, &Secp256k1::G);

        assert!(Secp256k1::is_on_curve(&result));

        // Verifica manualmente: 5G = G + G + G + G + G
        let mut manual = Secp256k1::G;
        for _ in 0..4 {
            manual = Secp256k1::add(&manual, &Secp256k1::G);
        }

        assert_eq!(result.x, manual.x);
        assert_eq!(result.y, manual.y);
    }

    #[test]
    fn test_identity_element() {
        // G + O = G
        let result = Secp256k1::add(&Secp256k1::G, &Point::INFINITY);
        assert_eq!(result.x, Secp256k1::G.x);
        assert_eq!(result.y, Secp256k1::G.y);

        // O + G = G
        let result2 = Secp256k1::add(&Point::INFINITY, &Secp256k1::G);
        assert_eq!(result2.x, Secp256k1::G.x);
        assert_eq!(result2.y, Secp256k1::G.y);
    }
}

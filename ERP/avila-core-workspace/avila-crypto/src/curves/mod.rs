//! Curvas elípticas aprovadas pela Ávila

pub mod secp256k1;
pub mod curve25519;
pub mod bls12_381;

use avila_primitives::U256;

/// Ponto em curva elíptica (coordenadas afim)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Point {
    /// Coordenada x
    pub x: U256,
    /// Coordenada y
    pub y: U256,
}

impl Point {
    /// Ponto no infinito (identidade do grupo)
    pub const INFINITY: Self = Self {
        x: U256::ZERO,
        y: U256::ZERO,
    };

    /// Verifica se é ponto no infinito
    pub const fn is_infinity(&self) -> bool {
        self.x.is_zero() && self.y.is_zero()
    }
}

/// Trait para operações em curvas elípticas
pub trait EllipticCurve {
    /// Nome da curva
    const NAME: &'static str;

    /// Primo do campo (p)
    const P: U256;

    /// Ordem do grupo (n)
    const N: U256;

    /// Cofator (h)
    const H: u8;

    /// Ponto gerador (G)
    const G: Point;

    /// Valida se ponto está na curva
    fn is_on_curve(point: &Point) -> bool;

    /// Adição de pontos: P + Q
    fn add(p: &Point, q: &Point) -> Point;

    /// Dobramento de ponto: 2P
    fn double(p: &Point) -> Point;

    /// Multiplicação escalar: k × P
    fn scalar_mul(k: &U256, p: &Point) -> Point;
}

//! Curvas elípticas aprovadas pela Ávila

pub mod secp256k1;
pub mod curve25519;

/// Ponto em curva elíptica
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct Point<T> {
    /// Coordenada X
    pub x: T,
    /// Coordenada Y
    pub y: T,
    /// Flag indicando ponto no infinito (identidade)
    pub infinity: bool,
}

impl<T: Copy> Point<T> {
    /// Cria ponto no infinito (elemento identidade do grupo)
    pub fn infinity() -> Self where T: Default {
        Self {
            x: T::default(),
            y: T::default(),
            infinity: true,
        }
    }

    /// Verifica se é ponto no infinito
    pub fn is_infinity(&self) -> bool {
        self.infinity
    }
}

/// Trait para operações em curvas elípticas
pub trait EllipticCurve {
    /// Tipo do field element (U256, U384, etc.)
    type FieldElement: Copy;

    /// Tipo do scalar (ordem do grupo)
    type Scalar: Copy;

    /// Ponto gerador da curva
    fn generator() -> Point<Self::FieldElement>;

    /// Adição de pontos: P + Q
    fn point_add(p: &Point<Self::FieldElement>, q: &Point<Self::FieldElement>) -> Point<Self::FieldElement>;

    /// Dobramento de ponto: 2P
    fn point_double(p: &Point<Self::FieldElement>) -> Point<Self::FieldElement>;

    /// Multiplicação escalar: k × P
    fn scalar_mul(k: &Self::Scalar, p: &Point<Self::FieldElement>) -> Point<Self::FieldElement>;

    /// Valida se ponto está na curva
    fn is_on_curve(p: &Point<Self::FieldElement>) -> bool;
}

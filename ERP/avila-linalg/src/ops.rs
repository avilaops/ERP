//! Módulo de operações genéricas

use num_traits::{Float, Num};

/// Trait para tipos que suportam norma euclidiana
pub trait Norm {
    /// Tipo do resultado da norma
    type Output;

    /// Calcula a norma euclidiana
    fn norm(&self) -> Self::Output;

    /// Calcula a norma quadrada (evita sqrt)
    fn norm_squared(&self) -> Self::Output;
}

/// Trait para tipos que podem ser normalizados
pub trait Normalize {
    /// Normaliza o valor (torna unitário)
    fn normalize(&self) -> Self;
}

/// Trait para produto escalar
pub trait Dot<Rhs = Self> {
    /// Tipo do resultado
    type Output;

    /// Produto escalar
    fn dot(&self, rhs: &Rhs) -> Self::Output;
}

/// Trait para produto vetorial (apenas 3D)
pub trait Cross<Rhs = Self> {
    /// Tipo do resultado
    type Output;

    /// Produto vetorial
    fn cross(&self, rhs: &Rhs) -> Self::Output;
}

/// Distância euclidiana entre dois pontos
pub fn distance<T, V>(a: &V, b: &V) -> T
where
    T: Float,
    V: std::ops::Sub<Output = V> + Norm<Output = T> + Clone,
{
    (a.clone() - b.clone()).norm()
}

/// Interpolação linear (lerp)
///
/// lerp(a, b, t) = a + t(b - a) = (1-t)a + tb
pub fn lerp<T>(a: T, b: T, t: T) -> T
where
    T: Num + Copy,
{
    a + t * (b - a)
}

/// Clamp (limita valor entre min e max)
pub fn clamp<T: PartialOrd>(value: T, min: T, max: T) -> T {
    if value < min {
        min
    } else if value > max {
        max
    } else {
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lerp() {
        assert_eq!(lerp(0.0, 10.0, 0.5), 5.0);
        assert_eq!(lerp(0.0, 10.0, 0.0), 0.0);
        assert_eq!(lerp(0.0, 10.0, 1.0), 10.0);
    }

    #[test]
    fn test_clamp() {
        assert_eq!(clamp(5.0, 0.0, 10.0), 5.0);
        assert_eq!(clamp(-1.0, 0.0, 10.0), 0.0);
        assert_eq!(clamp(15.0, 0.0, 10.0), 10.0);
    }
}

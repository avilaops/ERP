//! Módulo de vetores
//!
//! Implementa vetores 2D, 3D, 4D e N-dimensionais

use num_traits::{Float, Num, Zero};
use std::ops::{Add, Mul, Sub};

/// Vetor 2D genérico
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vector2<T> {
    data: [T; 2],
}

impl<T: Num + Copy> Vector2<T> {
    /// Cria novo vetor 2D
    pub fn new(x: T, y: T) -> Self {
        Self { data: [x, y] }
    }

    /// Componente X
    pub fn x(&self) -> T {
        self.data[0]
    }

    /// Componente Y
    pub fn y(&self) -> T {
        self.data[1]
    }

    /// Produto escalar (dot product)
    ///
    /// ```rust
    /// use avila_linalg::Vector2;
    /// let v1 = Vector2::new(1.0, 2.0);
    /// let v2 = Vector2::new(3.0, 4.0);
    /// assert_eq!(v1.dot(&v2), 11.0); // 1*3 + 2*4
    /// ```
    pub fn dot(&self, other: &Self) -> T {
        self.data[0] * other.data[0] + self.data[1] * other.data[1]
    }
}

impl<T: Float> Vector2<T> {
    /// Norma euclidiana (comprimento do vetor)
    pub fn norm(&self) -> T {
        self.dot(self).sqrt()
    }

    /// Normaliza o vetor (torna unitário)
    pub fn normalize(&self) -> Self {
        let n = self.norm();
        Self::new(self.data[0] / n, self.data[1] / n)
    }
}

/// Vetor 3D genérico
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vector3<T> {
    data: [T; 3],
}

impl<T: Num + Copy> Vector3<T> {
    /// Cria novo vetor 3D
    pub fn new(x: T, y: T, z: T) -> Self {
        Self { data: [x, y, z] }
    }

    /// Componente X
    pub fn x(&self) -> T {
        self.data[0]
    }

    /// Componente Y
    pub fn y(&self) -> T {
        self.data[1]
    }

    /// Componente Z
    pub fn z(&self) -> T {
        self.data[2]
    }

    /// Produto escalar (dot product)
    ///
    /// v · w = vₓwₓ + vᵧwᵧ + vᵤwᵤ
    pub fn dot(&self, other: &Self) -> T {
        self.data[0] * other.data[0] + self.data[1] * other.data[1] + self.data[2] * other.data[2]
    }

    /// Produto vetorial (cross product)
    ///
    /// v × w = (vᵧwᵤ - vᵤwᵧ, vᵤwₓ - vₓwᵤ, vₓwᵧ - vᵧwₓ)
    ///
    /// ```rust
    /// use avila_linalg::Vector3;
    /// let v1 = Vector3::new(1.0, 0.0, 0.0);
    /// let v2 = Vector3::new(0.0, 1.0, 0.0);
    /// let cross = v1.cross(&v2);
    /// assert_eq!(cross, Vector3::new(0.0, 0.0, 1.0));
    /// ```
    pub fn cross(&self, other: &Self) -> Self
    where
        T: Sub<Output = T>,
    {
        Self::new(
            self.data[1] * other.data[2] - self.data[2] * other.data[1],
            self.data[2] * other.data[0] - self.data[0] * other.data[2],
            self.data[0] * other.data[1] - self.data[1] * other.data[0],
        )
    }
}

impl<T: Float> Vector3<T> {
    /// Norma euclidiana (comprimento do vetor)
    ///
    /// ||v|| = √(vₓ² + vᵧ² + vᵤ²)
    pub fn norm(&self) -> T {
        self.dot(self).sqrt()
    }

    /// Normaliza o vetor (torna unitário)
    ///
    /// v̂ = v / ||v||
    pub fn normalize(&self) -> Self {
        let n = self.norm();
        Self::new(self.data[0] / n, self.data[1] / n, self.data[2] / n)
    }

    /// Projeção de self em other
    ///
    /// proj_w(v) = (v·w / ||w||²) w
    pub fn project_onto(&self, other: &Self) -> Self {
        let scale = self.dot(other) / other.dot(other);
        Self::new(
            other.data[0] * scale,
            other.data[1] * scale,
            other.data[2] * scale,
        )
    }
}

/// Vetor 4D genérico
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vector4<T> {
    data: [T; 4],
}

impl<T: Num + Copy> Vector4<T> {
    /// Cria novo vetor 4D
    pub fn new(x: T, y: T, z: T, w: T) -> Self {
        Self { data: [x, y, z, w] }
    }

    /// Componente X
    pub fn x(&self) -> T {
        self.data[0]
    }

    /// Componente Y
    pub fn y(&self) -> T {
        self.data[1]
    }

    /// Componente Z
    pub fn z(&self) -> T {
        self.data[2]
    }

    /// Componente W
    pub fn w(&self) -> T {
        self.data[3]
    }

    /// Produto escalar
    pub fn dot(&self, other: &Self) -> T {
        self.data[0] * other.data[0]
            + self.data[1] * other.data[1]
            + self.data[2] * other.data[2]
            + self.data[3] * other.data[3]
    }
}

impl<T: Float> Vector4<T> {
    /// Norma euclidiana
    pub fn norm(&self) -> T {
        self.dot(self).sqrt()
    }

    /// Normaliza o vetor
    pub fn normalize(&self) -> Self {
        let n = self.norm();
        Self::new(
            self.data[0] / n,
            self.data[1] / n,
            self.data[2] / n,
            self.data[3] / n,
        )
    }
}

/// Vetor N-dimensional (tamanho dinâmico)
#[derive(Debug, Clone, PartialEq)]
pub struct VectorN<T> {
    data: Vec<T>,
}

impl<T: Num + Copy> VectorN<T> {
    /// Cria vetor de tamanho n com valor inicial
    pub fn new(data: Vec<T>) -> Self {
        Self { data }
    }

    /// Cria vetor zero de tamanho n
    pub fn zeros(n: usize) -> Self
    where
        T: Zero,
    {
        Self {
            data: vec![T::zero(); n],
        }
    }

    /// Dimensão do vetor
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// Verifica se está vazio
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    /// Produto escalar
    pub fn dot(&self, other: &Self) -> T {
        assert_eq!(self.len(), other.len(), "Vetores devem ter mesmo tamanho");
        self.data
            .iter()
            .zip(other.data.iter())
            .map(|(a, b)| *a * *b)
            .fold(T::zero(), |acc, x| acc + x)
    }
}

impl<T: Float> VectorN<T> {
    /// Norma euclidiana
    pub fn norm(&self) -> T {
        self.dot(self).sqrt()
    }

    /// Normaliza o vetor
    pub fn normalize(&self) -> Self {
        let n = self.norm();
        Self {
            data: self.data.iter().map(|x| *x / n).collect(),
        }
    }
}

// Implementa operações aritméticas
impl<T: Num + Copy> Add for Vector3<T> {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        Self::new(
            self.data[0] + other.data[0],
            self.data[1] + other.data[1],
            self.data[2] + other.data[2],
        )
    }
}

impl<T: Num + Copy> Sub for Vector3<T> {
    type Output = Self;

    fn sub(self, other: Self) -> Self {
        Self::new(
            self.data[0] - other.data[0],
            self.data[1] - other.data[1],
            self.data[2] - other.data[2],
        )
    }
}

impl<T: Num + Copy> Mul<T> for Vector3<T> {
    type Output = Self;

    fn mul(self, scalar: T) -> Self {
        Self::new(
            self.data[0] * scalar,
            self.data[1] * scalar,
            self.data[2] * scalar,
        )
    }
}

// Operadores para Vector4
impl<T: Num + Copy> Add for Vector4<T> {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        Self::new(
            self.data[0] + other.data[0],
            self.data[1] + other.data[1],
            self.data[2] + other.data[2],
            self.data[3] + other.data[3],
        )
    }
}

impl<T: Num + Copy> Sub for Vector4<T> {
    type Output = Self;

    fn sub(self, other: Self) -> Self {
        Self::new(
            self.data[0] - other.data[0],
            self.data[1] - other.data[1],
            self.data[2] - other.data[2],
            self.data[3] - other.data[3],
        )
    }
}

impl<T: Num + Copy> Mul<T> for Vector4<T> {
    type Output = Self;

    fn mul(self, scalar: T) -> Self {
        Self::new(
            self.data[0] * scalar,
            self.data[1] * scalar,
            self.data[2] * scalar,
            self.data[3] * scalar,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vector3_dot() {
        let v1 = Vector3::new(1.0, 2.0, 3.0);
        let v2 = Vector3::new(4.0, 5.0, 6.0);
        assert_eq!(v1.dot(&v2), 32.0); // 1*4 + 2*5 + 3*6
    }

    #[test]
    fn test_vector3_cross() {
        let v1 = Vector3::new(1.0, 0.0, 0.0);
        let v2 = Vector3::new(0.0, 1.0, 0.0);
        let cross = v1.cross(&v2);
        assert_eq!(cross, Vector3::new(0.0, 0.0, 1.0));
    }

    #[test]
    fn test_vector3_norm() {
        let v = Vector3::new(3.0, 4.0, 0.0);
        assert_eq!(v.norm(), 5.0);
    }
}

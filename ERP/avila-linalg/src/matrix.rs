//! Módulo de matrizes
//!
//! Implementa matrizes 2x2, 3x3, 4x4 e MxN

use crate::vector::Vector3;
use num_traits::{Float, Num, One, Zero};
use std::ops::Mul;

/// Matriz 2x2 genérica
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Matrix2x2<T> {
    data: [[T; 2]; 2],
}

impl<T: Num + Copy> Matrix2x2<T> {
    /// Cria matriz de linhas
    pub fn from_rows(rows: [[T; 2]; 2]) -> Self {
        Self { data: rows }
    }

    /// Matriz identidade
    pub fn identity() -> Self
    where
        T: Zero + One,
    {
        Self::from_rows([[T::one(), T::zero()], [T::zero(), T::one()]])
    }

    /// Transposta
    pub fn transpose(&self) -> Self {
        Self::from_rows([
            [self.data[0][0], self.data[1][0]],
            [self.data[0][1], self.data[1][1]],
        ])
    }

    /// Determinante
    pub fn det(&self) -> T {
        self.data[0][0] * self.data[1][1] - self.data[0][1] * self.data[1][0]
    }
}

/// Matriz 3x3 genérica
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Matrix3x3<T> {
    data: [[T; 3]; 3],
}

impl<T: Num + Copy> Matrix3x3<T> {
    /// Cria matriz de linhas
    pub fn from_rows(rows: [[T; 3]; 3]) -> Self {
        Self { data: rows }
    }

    /// Matriz identidade
    pub fn identity() -> Self
    where
        T: Zero + One,
    {
        Self::from_rows([
            [T::one(), T::zero(), T::zero()],
            [T::zero(), T::one(), T::zero()],
            [T::zero(), T::zero(), T::one()],
        ])
    }

    /// Matriz zero
    pub fn zeros() -> Self
    where
        T: Zero,
    {
        Self::from_rows([[T::zero(); 3], [T::zero(); 3], [T::zero(); 3]])
    }

    /// Acesso aos dados internos
    pub fn data(&self) -> &[[T; 3]; 3] {
        &self.data
    }

    /// Transposta
    pub fn transpose(&self) -> Self {
        Self::from_rows([
            [self.data[0][0], self.data[1][0], self.data[2][0]],
            [self.data[0][1], self.data[1][1], self.data[2][1]],
            [self.data[0][2], self.data[1][2], self.data[2][2]],
        ])
    }

    /// Traço (soma da diagonal)
    pub fn trace(&self) -> T {
        self.data[0][0] + self.data[1][1] + self.data[2][2]
    }

    /// Determinante (regra de Sarrus)
    pub fn det(&self) -> T {
        let a = self.data[0][0] * self.data[1][1] * self.data[2][2];
        let b = self.data[0][1] * self.data[1][2] * self.data[2][0];
        let c = self.data[0][2] * self.data[1][0] * self.data[2][1];
        let d = self.data[0][2] * self.data[1][1] * self.data[2][0];
        let e = self.data[0][0] * self.data[1][2] * self.data[2][1];
        let f = self.data[0][1] * self.data[1][0] * self.data[2][2];

        a + b + c - d - e - f
    }
}

impl<T: Float> Matrix3x3<T> {
    /// Inversa (usando adjunta)
    pub fn inverse(&self) -> Option<Self> {
        let det = self.det();
        if det.abs() < T::epsilon() {
            return None;
        }

        // Matriz de cofatores
        let c00 = self.data[1][1] * self.data[2][2] - self.data[1][2] * self.data[2][1];
        let c01 = -(self.data[1][0] * self.data[2][2] - self.data[1][2] * self.data[2][0]);
        let c02 = self.data[1][0] * self.data[2][1] - self.data[1][1] * self.data[2][0];

        let c10 = -(self.data[0][1] * self.data[2][2] - self.data[0][2] * self.data[2][1]);
        let c11 = self.data[0][0] * self.data[2][2] - self.data[0][2] * self.data[2][0];
        let c12 = -(self.data[0][0] * self.data[2][1] - self.data[0][1] * self.data[2][0]);

        let c20 = self.data[0][1] * self.data[1][2] - self.data[0][2] * self.data[1][1];
        let c21 = -(self.data[0][0] * self.data[1][2] - self.data[0][2] * self.data[1][0]);
        let c22 = self.data[0][0] * self.data[1][1] - self.data[0][1] * self.data[1][0];

        // Adjunta (transposta da matriz de cofatores)
        let adj = Self::from_rows([[c00, c10, c20], [c01, c11, c21], [c02, c12, c22]]);

        // Inversa = adjunta / det
        let inv_det = T::one() / det;
        Some(Self::from_rows([
            [
                adj.data[0][0] * inv_det,
                adj.data[0][1] * inv_det,
                adj.data[0][2] * inv_det,
            ],
            [
                adj.data[1][0] * inv_det,
                adj.data[1][1] * inv_det,
                adj.data[1][2] * inv_det,
            ],
            [
                adj.data[2][0] * inv_det,
                adj.data[2][1] * inv_det,
                adj.data[2][2] * inv_det,
            ],
        ]))
    }
}

/// Matriz 4x4 genérica
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Matrix4x4<T> {
    data: [[T; 4]; 4],
}

impl<T: Num + Copy> Matrix4x4<T> {
    /// Cria matriz de linhas
    pub fn from_rows(rows: [[T; 4]; 4]) -> Self {
        Self { data: rows }
    }

    /// Matriz identidade
    pub fn identity() -> Self
    where
        T: Zero + One,
    {
        let mut data = [[T::zero(); 4]; 4];
        data[0][0] = T::one();
        data[1][1] = T::one();
        data[2][2] = T::one();
        data[3][3] = T::one();
        Self { data }
    }

    /// Matriz zero
    pub fn zeros() -> Self
    where
        T: Zero,
    {
        Self {
            data: [[T::zero(); 4]; 4],
        }
    }

    /// Acesso aos dados internos
    pub fn data(&self) -> &[[T; 4]; 4] {
        &self.data
    }

    /// Transposta
    pub fn transpose(&self) -> Self {
        let mut result = [[T::zero(); 4]; 4];
        for i in 0..4 {
            for j in 0..4 {
                result[j][i] = self.data[i][j];
            }
        }
        Self { data: result }
    }

    /// Traço
    pub fn trace(&self) -> T {
        self.data[0][0] + self.data[1][1] + self.data[2][2] + self.data[3][3]
    }
}

/// Matriz MxN (tamanho dinâmico)
#[derive(Debug, Clone, PartialEq)]
pub struct MatrixMxN<T> {
    rows: usize,
    cols: usize,
    data: Vec<T>,
}

impl<T: Num + Copy> MatrixMxN<T> {
    /// Cria matriz MxN a partir de vetor (row-major)
    pub fn from_vec(rows: usize, cols: usize, data: Vec<T>) -> Self {
        assert_eq!(data.len(), rows * cols, "Tamanho inválido");
        Self { rows, cols, data }
    }

    /// Matriz zero MxN
    pub fn zeros(rows: usize, cols: usize) -> Self
    where
        T: Zero,
    {
        Self {
            rows,
            cols,
            data: vec![T::zero(); rows * cols],
        }
    }

    /// Matriz identidade NxN
    pub fn identity(n: usize) -> Self
    where
        T: Zero + One,
    {
        let mut data = vec![T::zero(); n * n];
        for i in 0..n {
            data[i * n + i] = T::one();
        }
        Self {
            rows: n,
            cols: n,
            data,
        }
    }

    /// Número de linhas
    pub fn rows(&self) -> usize {
        self.rows
    }

    /// Número de colunas
    pub fn cols(&self) -> usize {
        self.cols
    }

    /// Acessa elemento (i, j)
    pub fn get(&self, i: usize, j: usize) -> T {
        self.data[i * self.cols + j]
    }

    /// Define elemento (i, j)
    pub fn set(&mut self, i: usize, j: usize, value: T) {
        self.data[i * self.cols + j] = value;
    }

    /// Transposta
    pub fn transpose(&self) -> Self {
        let mut result = Self::zeros(self.cols, self.rows);
        for i in 0..self.rows {
            for j in 0..self.cols {
                result.set(j, i, self.get(i, j));
            }
        }
        result
    }
}

// Operações: Matriz * Vetor
impl<T: Num + Copy> Mul<Vector3<T>> for Matrix3x3<T> {
    type Output = Vector3<T>;

    fn mul(self, v: Vector3<T>) -> Vector3<T> {
        Vector3::new(
            self.data[0][0] * v.x() + self.data[0][1] * v.y() + self.data[0][2] * v.z(),
            self.data[1][0] * v.x() + self.data[1][1] * v.y() + self.data[1][2] * v.z(),
            self.data[2][0] * v.x() + self.data[2][1] * v.y() + self.data[2][2] * v.z(),
        )
    }
}

// Operações: Matriz * Matriz
impl<T: Num + Copy> Mul for Matrix3x3<T> {
    type Output = Self;

    fn mul(self, other: Self) -> Self {
        let mut result = Self::zeros();
        for i in 0..3 {
            for j in 0..3 {
                let mut sum = T::zero();
                for k in 0..3 {
                    sum = sum + self.data[i][k] * other.data[k][j];
                }
                result.data[i][j] = sum;
            }
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matrix3x3_identity() {
        let m: Matrix3x3<f64> = Matrix3x3::identity();
        assert_eq!(m.data[0][0], 1.0);
        assert_eq!(m.data[1][1], 1.0);
        assert_eq!(m.data[2][2], 1.0);
    }

    #[test]
    fn test_matrix3x3_det() {
        let m = Matrix3x3::from_rows([[1.0, 2.0, 3.0], [0.0, 1.0, 4.0], [5.0, 6.0, 0.0]]);
        let det = m.det();
        assert_eq!(det, 1.0);
    }

    #[test]
    fn test_matrix_vector_mul() {
        let m = Matrix3x3::from_rows([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]);
        let v = Vector3::new(1.0, 2.0, 3.0);
        let result = m * v;
        assert_eq!(result, v);
    }
}

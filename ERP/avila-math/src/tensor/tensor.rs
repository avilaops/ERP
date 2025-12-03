#![allow(clippy::needless_range_loop)]

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

/// Tensor de ordem N com dados armazenados linearmente
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct Tensor<const N: usize> {
    pub data: Vec<f64>,
    pub shape: [usize; N],
    pub strides: [usize; N],
}

impl<const N: usize> Tensor<N> {
    /// Cria um novo tensor com a forma especificada, inicializado com zeros
    pub fn zeros(shape: [usize; N]) -> Self {
        let size = shape.iter().product();
        let strides = Self::compute_strides(&shape);
        Self {
            data: vec![0.0; size],
            shape,
            strides,
        }
    }

    /// Cria um tensor inicializado com um valor específico
    pub fn filled(shape: [usize; N], value: f64) -> Self {
        let size = shape.iter().product();
        let strides = Self::compute_strides(&shape);
        Self {
            data: vec![value; size],
            shape,
            strides,
        }
    }

    /// Cria um tensor a partir de dados brutos
    pub fn from_data(shape: [usize; N], data: Vec<f64>) -> Result<Self, String> {
        let expected_size: usize = shape.iter().product();
        if data.len() != expected_size {
            return Err(format!(
                "Data length {} doesn't match shape size {}",
                data.len(),
                expected_size
            ));
        }
        let strides = Self::compute_strides(&shape);
        Ok(Self {
            data,
            shape,
            strides,
        })
    }

    /// Calcula os strides para acesso eficiente aos dados
    fn compute_strides(shape: &[usize; N]) -> [usize; N] {
        let mut strides = [1; N];
        for i in (0..N - 1).rev() {
            strides[i] = strides[i + 1] * shape[i + 1];
        }
        strides
    }

    /// Converte índices multidimensionais em índice linear
    pub fn linear_index(&self, indices: &[usize; N]) -> usize {
        indices
            .iter()
            .zip(self.strides.iter())
            .map(|(i, s)| i * s)
            .sum()
    }

    /// Obtém valor em índices específicos
    pub fn get(&self, indices: [usize; N]) -> Option<f64> {
        for (i, &idx) in indices.iter().enumerate().take(N) {
            if idx >= self.shape[i] {
                return None;
            }
        }
        let idx = self.linear_index(&indices);
        Some(self.data[idx])
    }

    /// Define valor em índices específicos
    pub fn set(&mut self, indices: [usize; N], value: f64) -> Result<(), String> {
        for (i, &idx) in indices.iter().enumerate().take(N) {
            if idx >= self.shape[i] {
                return Err(format!("Índice {} fora dos limites", i));
            }
        }
        let idx = self.linear_index(&indices);
        self.data[idx] = value;
        Ok(())
    }

    /// Retorna a forma do tensor
    pub fn shape(&self) -> &[usize; N] {
        &self.shape
    }

    /// Retorna o número total de elementos
    pub fn size(&self) -> usize {
        self.data.len()
    }

    /// Retorna a ordem (rank) do tensor
    pub fn rank(&self) -> usize {
        N
    }

    /// Aplica uma função a cada elemento do tensor
    pub fn map<F>(&self, f: F) -> Self
    where
        F: Fn(f64) -> f64,
    {
        Self {
            data: self.data.iter().map(|&x| f(x)).collect(),
            shape: self.shape,
            strides: self.strides,
        }
    }

    /// Soma elemento por elemento (Hadamard/element-wise)
    pub fn add_elementwise(&self, other: &Self) -> Result<Self, String> {
        if self.shape != other.shape {
            return Err("Shapes must match for element-wise addition".to_string());
        }
        Ok(Self {
            data: self
                .data
                .iter()
                .zip(other.data.iter())
                .map(|(a, b)| a + b)
                .collect(),
            shape: self.shape,
            strides: self.strides,
        })
    }

    /// Subtração elemento por elemento
    pub fn sub_elementwise(&self, other: &Self) -> Result<Self, String> {
        if self.shape != other.shape {
            return Err("Shapes must match for element-wise subtraction".to_string());
        }
        Ok(Self {
            data: self
                .data
                .iter()
                .zip(other.data.iter())
                .map(|(a, b)| a - b)
                .collect(),
            shape: self.shape,
            strides: self.strides,
        })
    }

    /// Multiplicação por escalar
    pub fn scale(&self, scalar: f64) -> Self {
        self.map(|x| x * scalar)
    }

    /// Produto de Hadamard (elemento por elemento)
    pub fn hadamard(&self, other: &Self) -> Result<Self, String> {
        if self.shape != other.shape {
            return Err("Shapes must match for Hadamard product".to_string());
        }
        Ok(Self {
            data: self
                .data
                .iter()
                .zip(other.data.iter())
                .map(|(a, b)| a * b)
                .collect(),
            shape: self.shape,
            strides: self.strides,
        })
    }

    /// Norma de Frobenius (norma L2 para tensores)
    pub fn frobenius_norm(&self) -> f64 {
        self.data.iter().map(|x| x * x).sum::<f64>().sqrt()
    }

    /// Soma de todos os elementos
    pub fn sum(&self) -> f64 {
        self.data.iter().sum()
    }

    /// Média de todos os elementos
    pub fn mean(&self) -> f64 {
        self.sum() / (self.size() as f64)
    }

    /// Transpõe as duas primeiras dimensões (para N >= 2)
    pub fn transpose_first_two(&self) -> Self
    where
        [(); N]: Sized,
    {
        if N < 2 {
            return self.clone();
        }

        let mut new_shape = self.shape;
        new_shape.swap(0, 1);
        let mut result = Self::zeros(new_shape);

        // Itera sobre todos os índices possíveis
        let total_size = self.size();
        for linear_idx in 0..total_size {
            let mut indices = self.linear_to_multi_index(linear_idx);
            indices.swap(0, 1);
            let new_linear_idx = result.linear_index(&indices);
            result.data[new_linear_idx] = self.data[linear_idx];
        }

        result
    }

    /// Converte índice linear em índices multidimensionais
    fn linear_to_multi_index(&self, mut linear_idx: usize) -> [usize; N] {
        let mut indices = [0; N];
        for i in 0..N {
            indices[i] = linear_idx / self.strides[i];
            linear_idx %= self.strides[i];
        }
        indices
    }

    /// Reshape do tensor (mantém o número total de elementos)
    pub fn reshape<const M: usize>(&self, new_shape: [usize; M]) -> Result<Tensor<M>, String> {
        let new_size: usize = new_shape.iter().product();
        if new_size != self.size() {
            return Err(format!(
                "Cannot reshape: new size {} != old size {}",
                new_size,
                self.size()
            ));
        }
        Tensor::from_data(new_shape, self.data.clone())
    }
}

/// Especialização para escalares (ordem 0)
pub type Scalar = f64;

/// Especialização para vetores (ordem 1)
pub type Vector = Tensor<1>;

impl Vector {
    /// Cria um vetor de tamanho n
    pub fn new(size: usize) -> Self {
        Self::zeros([size])
    }

    /// Cria vetor a partir de slice
    pub fn from_slice(data: &[f64]) -> Self {
        Self::from_data([data.len()], data.to_vec()).unwrap()
    }

    /// Produto escalar (dot product)
    pub fn dot(&self, other: &Self) -> Result<f64, String> {
        if self.shape[0] != other.shape[0] {
            return Err("Vectors must have same length".to_string());
        }
        Ok(self
            .data
            .iter()
            .zip(other.data.iter())
            .map(|(a, b)| a * b)
            .sum())
    }

    /// Norma euclidiana
    pub fn norm(&self) -> f64 {
        self.dot(self).unwrap().sqrt()
    }

    /// Normaliza o vetor
    pub fn normalize(&self) -> Self {
        let n = self.norm();
        if n > 0.0 {
            self.scale(1.0 / n)
        } else {
            self.clone()
        }
    }

    /// Produto vetorial (apenas para vetores 3D)
    pub fn cross(&self, other: &Self) -> Result<Self, String> {
        if self.shape[0] != 3 || other.shape[0] != 3 {
            return Err("Cross product only defined for 3D vectors".to_string());
        }
        let data = vec![
            self.data[1] * other.data[2] - self.data[2] * other.data[1],
            self.data[2] * other.data[0] - self.data[0] * other.data[2],
            self.data[0] * other.data[1] - self.data[1] * other.data[0],
        ];
        Ok(Self::from_data([3], data).unwrap())
    }
}

/// Especialização para matrizes (ordem 2)
pub type Matrix = Tensor<2>;

impl Matrix {
    /// Cria matriz de dimensões m×n
    pub fn new(rows: usize, cols: usize) -> Self {
        Self::zeros([rows, cols])
    }

    /// Cria matriz identidade
    pub fn identity(size: usize) -> Self {
        let mut mat = Self::zeros([size, size]);
        for i in 0..size {
            mat.set([i, i], 1.0).unwrap();
        }
        mat
    }

    /// Cria matriz diagonal
    pub fn diagonal(values: &[f64]) -> Self {
        let size = values.len();
        let mut mat = Self::zeros([size, size]);
        for (i, &val) in values.iter().enumerate() {
            mat.set([i, i], val).unwrap();
        }
        mat
    }

    /// Multiplicação de matrizes
    pub fn matmul(&self, other: &Self) -> Result<Self, String> {
        if self.shape[1] != other.shape[0] {
            return Err(format!(
                "Cannot multiply {}×{} with {}×{}",
                self.shape[0], self.shape[1], other.shape[0], other.shape[1]
            ));
        }

        let rows = self.shape[0];
        let cols = other.shape[1];
        let inner = self.shape[1];
        let mut result = Self::zeros([rows, cols]);

        for i in 0..rows {
            for j in 0..cols {
                let mut sum = 0.0;
                for k in 0..inner {
                    sum += self.get([i, k]).unwrap() * other.get([k, j]).unwrap();
                }
                result.set([i, j], sum).unwrap();
            }
        }

        Ok(result)
    }

    /// Multiplica matriz por vetor
    pub fn matvec(&self, vec: &Vector) -> Result<Vector, String> {
        if self.shape[1] != vec.shape[0] {
            return Err("Matrix columns must match vector length".to_string());
        }

        let rows = self.shape[0];
        let cols = self.shape[1];
        let mut result = Vector::new(rows);

        for i in 0..rows {
            let mut sum = 0.0;
            for j in 0..cols {
                sum += self.get([i, j]).unwrap() * vec.get([j]).unwrap();
            }
            result.set([i], sum).unwrap();
        }

        Ok(result)
    }

    /// Transposta da matriz
    pub fn transpose(&self) -> Self {
        let mut result = Self::zeros([self.shape[1], self.shape[0]]);
        for i in 0..self.shape[0] {
            for j in 0..self.shape[1] {
                result.set([j, i], self.get([i, j]).unwrap()).unwrap();
            }
        }
        result
    }

    /// Traço da matriz (soma da diagonal)
    pub fn trace(&self) -> f64 {
        let size = self.shape[0].min(self.shape[1]);
        (0..size).map(|i| self.get([i, i]).unwrap()).sum()
    }

    /// Determinante (apenas para matrizes pequenas)
    pub fn determinant(&self) -> Result<f64, String> {
        if self.shape[0] != self.shape[1] {
            return Err("Matrix must be square".to_string());
        }

        match self.shape[0] {
            1 => Ok(self.get([0, 0]).unwrap()),
            2 => {
                let a = self.get([0, 0]).unwrap();
                let b = self.get([0, 1]).unwrap();
                let c = self.get([1, 0]).unwrap();
                let d = self.get([1, 1]).unwrap();
                Ok(a * d - b * c)
            }
            3 => {
                let a = self.get([0, 0]).unwrap();
                let b = self.get([0, 1]).unwrap();
                let c = self.get([0, 2]).unwrap();
                let d = self.get([1, 0]).unwrap();
                let e = self.get([1, 1]).unwrap();
                let f = self.get([1, 2]).unwrap();
                let g = self.get([2, 0]).unwrap();
                let h = self.get([2, 1]).unwrap();
                let i = self.get([2, 2]).unwrap();
                Ok(a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g))
            }
            _ => Err("Determinant only implemented for matrices up to 3×3".to_string()),
        }
    }

    /// Retorna uma linha específica como vetor
    pub fn row(&self, idx: usize) -> Result<Vector, String> {
        if idx >= self.shape[0] {
            return Err("Row index out of bounds".to_string());
        }
        let mut data = vec![0.0; self.shape[1]];
        for j in 0..self.shape[1] {
            data[j] = self.get([idx, j]).unwrap();
        }
        Ok(Vector::from_slice(&data))
    }

    /// Retorna uma coluna específica como vetor
    pub fn col(&self, idx: usize) -> Result<Vector, String> {
        if idx >= self.shape[1] {
            return Err("Column index out of bounds".to_string());
        }
        let mut data = vec![0.0; self.shape[0]];
        for i in 0..self.shape[0] {
            data[i] = self.get([i, idx]).unwrap();
        }
        Ok(Vector::from_slice(&data))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tensor_creation() {
        let t: Tensor<3> = Tensor::zeros([2, 3, 4]);
        assert_eq!(t.shape(), &[2, 3, 4]);
        assert_eq!(t.size(), 24);
        assert_eq!(t.rank(), 3);
    }

    #[test]
    fn test_vector_operations() {
        let v1 = Vector::from_slice(&[1.0, 2.0, 3.0]);
        let v2 = Vector::from_slice(&[4.0, 5.0, 6.0]);

        let dot = v1.dot(&v2).unwrap();
        assert_eq!(dot, 32.0);

        let norm = v1.norm();
        assert!((norm - 14.0_f64.sqrt()).abs() < 1e-10);
    }

    #[test]
    fn test_matrix_multiplication() {
        let m1 = Matrix::from_data([2, 2], vec![1.0, 2.0, 3.0, 4.0]).unwrap();
        let m2 = Matrix::from_data([2, 2], vec![5.0, 6.0, 7.0, 8.0]).unwrap();

        let result = m1.matmul(&m2).unwrap();
        assert_eq!(result.get([0, 0]).unwrap(), 19.0);
        assert_eq!(result.get([0, 1]).unwrap(), 22.0);
        assert_eq!(result.get([1, 0]).unwrap(), 43.0);
        assert_eq!(result.get([1, 1]).unwrap(), 50.0);
    }

    #[test]
    fn test_matrix_transpose() {
        let m = Matrix::from_data([2, 3], vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]).unwrap();
        let mt = m.transpose();

        assert_eq!(mt.shape(), &[3, 2]);
        assert_eq!(mt.get([0, 0]).unwrap(), 1.0);
        assert_eq!(mt.get([1, 0]).unwrap(), 2.0);
        assert_eq!(mt.get([2, 1]).unwrap(), 6.0);
    }

    #[test]
    fn test_determinant_2x2() {
        let m = Matrix::from_data([2, 2], vec![1.0, 2.0, 3.0, 4.0]).unwrap();
        let det = m.determinant().unwrap();
        assert_eq!(det, -2.0);
    }

    #[test]
    fn test_cross_product() {
        let v1 = Vector::from_slice(&[1.0, 0.0, 0.0]);
        let v2 = Vector::from_slice(&[0.0, 1.0, 0.0]);
        let v3 = v1.cross(&v2).unwrap();

        assert_eq!(v3.get([0]).unwrap(), 0.0);
        assert_eq!(v3.get([1]).unwrap(), 0.0);
        assert_eq!(v3.get([2]).unwrap(), 1.0);
    }
}

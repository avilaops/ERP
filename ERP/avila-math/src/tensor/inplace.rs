//! # InPlace Operations Trait
//!
//! Memory-efficient in-place operations for tensors and arrays.
//!
//! ## Benefits
//! - Zero allocations for mutable operations
//! - Reduced memory footprint for large tensors
//! - Better cache locality
//! - Ideal for training loops and iterative algorithms
//!
//! ## Usage
//! ```
//! use avila_math::tensor::{Tensor, InPlace};
//!
//! let mut tensor = Tensor::<2>::filled([3, 3], 2.0);
//! tensor.mul_scalar_inplace(0.5);
//! tensor.add_inplace(&Tensor::<2>::filled([3, 3], 1.0));
//! tensor.relu_inplace();
//! ```

use crate::tensor::Tensor;

/// Trait para operações in-place (sem alocação)
pub trait InPlace {
    /// Adiciona outro tensor in-place: self += other
    fn add_inplace(&mut self, other: &Self);

    /// Subtrai outro tensor in-place: self -= other
    fn sub_inplace(&mut self, other: &Self);

    /// Multiplicação elemento-wise in-place: self *= other
    fn mul_elementwise_inplace(&mut self, other: &Self);

    /// Multiplicação por escalar in-place: self *= scalar
    fn mul_scalar_inplace(&mut self, scalar: f64);

    /// Divisão por escalar in-place: self /= scalar
    fn div_scalar_inplace(&mut self, scalar: f64);

    /// Aplica ReLU in-place: self = max(0, self)
    fn relu_inplace(&mut self);

    /// Aplica Leaky ReLU in-place: self = max(alpha*self, self)
    fn leaky_relu_inplace(&mut self, alpha: f64);

    /// Aplica sigmoid in-place: self = 1 / (1 + exp(-self))
    fn sigmoid_inplace(&mut self);

    /// Aplica tanh in-place: self = tanh(self)
    fn tanh_inplace(&mut self);

    /// Clamp valores in-place: self = clamp(self, min, max)
    fn clamp_inplace(&mut self, min: f64, max: f64);

    /// Zera todos os elementos
    fn zero_inplace(&mut self);

    /// Preenche com valor constante
    fn fill_inplace(&mut self, value: f64);
}

impl<const N: usize> InPlace for Tensor<N> {
    fn add_inplace(&mut self, other: &Self) {
        assert_eq!(
            self.shape, other.shape,
            "Tensors must have same shape for in-place addition"
        );

        for i in 0..self.data.len() {
            self.data[i] += other.data[i];
        }
    }

    fn sub_inplace(&mut self, other: &Self) {
        assert_eq!(
            self.shape, other.shape,
            "Tensors must have same shape for in-place subtraction"
        );

        for i in 0..self.data.len() {
            self.data[i] -= other.data[i];
        }
    }

    fn mul_elementwise_inplace(&mut self, other: &Self) {
        assert_eq!(
            self.shape, other.shape,
            "Tensors must have same shape for in-place multiplication"
        );

        for i in 0..self.data.len() {
            self.data[i] *= other.data[i];
        }
    }

    fn mul_scalar_inplace(&mut self, scalar: f64) {
        for x in &mut self.data {
            *x *= scalar;
        }
    }

    fn div_scalar_inplace(&mut self, scalar: f64) {
        assert!(scalar != 0.0, "Cannot divide by zero");

        for x in &mut self.data {
            *x /= scalar;
        }
    }

    fn relu_inplace(&mut self) {
        for x in &mut self.data {
            if *x < 0.0 {
                *x = 0.0;
            }
        }
    }

    fn leaky_relu_inplace(&mut self, alpha: f64) {
        for x in &mut self.data {
            if *x < 0.0 {
                *x *= alpha;
            }
        }
    }

    fn sigmoid_inplace(&mut self) {
        for x in &mut self.data {
            *x = 1.0 / (1.0 + (-*x).exp());
        }
    }

    fn tanh_inplace(&mut self) {
        for x in &mut self.data {
            *x = x.tanh();
        }
    }

    fn clamp_inplace(&mut self, min: f64, max: f64) {
        assert!(min <= max, "min must be <= max");

        for x in &mut self.data {
            *x = x.clamp(min, max);
        }
    }

    fn zero_inplace(&mut self) {
        for x in &mut self.data {
            *x = 0.0;
        }
    }

    fn fill_inplace(&mut self, value: f64) {
        for x in &mut self.data {
            *x = value;
        }
    }
}

/// Extensão para operações in-place em Vec<f64>
pub trait VecInPlace {
    fn add_inplace(&mut self, other: &[f64]);
    fn mul_scalar_inplace(&mut self, scalar: f64);
    fn relu_inplace(&mut self);
    fn zero_inplace(&mut self);
}

impl VecInPlace for Vec<f64> {
    fn add_inplace(&mut self, other: &[f64]) {
        assert_eq!(self.len(), other.len());
        for (x, &y) in self.iter_mut().zip(other.iter()) {
            *x += y;
        }
    }

    fn mul_scalar_inplace(&mut self, scalar: f64) {
        for x in self.iter_mut() {
            *x *= scalar;
        }
    }

    fn relu_inplace(&mut self) {
        for x in self.iter_mut() {
            if *x < 0.0 {
                *x = 0.0;
            }
        }
    }

    fn zero_inplace(&mut self) {
        for x in self.iter_mut() {
            *x = 0.0;
        }
    }
}

/// Batch de operações in-place para otimização de loops de treinamento
pub struct InPlaceBatch<'a, const N: usize> {
    tensors: Vec<&'a mut Tensor<N>>,
}

impl<'a, const N: usize> InPlaceBatch<'a, N> {
    pub fn new() -> Self {
        Self {
            tensors: Vec::new(),
        }
    }

    pub fn add(&mut self, tensor: &'a mut Tensor<N>) {
        self.tensors.push(tensor);
    }

    /// Aplica operação a todos os tensores do batch
    pub fn mul_scalar_all(&mut self, scalar: f64) {
        for tensor in &mut self.tensors {
            tensor.mul_scalar_inplace(scalar);
        }
    }

    pub fn relu_all(&mut self) {
        for tensor in &mut self.tensors {
            tensor.relu_inplace();
        }
    }

    pub fn zero_all(&mut self) {
        for tensor in &mut self.tensors {
            tensor.zero_inplace();
        }
    }
}

impl<'a, const N: usize> Default for InPlaceBatch<'a, N> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_inplace() {
        let mut a = Tensor::<2>::filled([2, 2], 1.0);
        let b = Tensor::<2>::filled([2, 2], 2.0);

        a.add_inplace(&b);

        assert_eq!(a.data, vec![3.0, 3.0, 3.0, 3.0]);
    }

    #[test]
    fn test_sub_inplace() {
        let mut a = Tensor::<2>::filled([2, 2], 5.0);
        let b = Tensor::<2>::filled([2, 2], 2.0);

        a.sub_inplace(&b);

        assert_eq!(a.data, vec![3.0, 3.0, 3.0, 3.0]);
    }

    #[test]
    fn test_mul_elementwise_inplace() {
        let mut a = Tensor::<2>::filled([2, 2], 3.0);
        let b = Tensor::<2>::filled([2, 2], 2.0);

        a.mul_elementwise_inplace(&b);

        assert_eq!(a.data, vec![6.0, 6.0, 6.0, 6.0]);
    }

    #[test]
    fn test_mul_scalar_inplace() {
        let mut tensor = Tensor::<2>::filled([2, 2], 2.0);

        tensor.mul_scalar_inplace(3.0);

        assert_eq!(tensor.data, vec![6.0, 6.0, 6.0, 6.0]);
    }

    #[test]
    fn test_div_scalar_inplace() {
        let mut tensor = Tensor::<2>::filled([2, 2], 10.0);

        tensor.div_scalar_inplace(2.0);

        assert_eq!(tensor.data, vec![5.0, 5.0, 5.0, 5.0]);
    }

    #[test]
    fn test_relu_inplace() {
        let mut tensor = Tensor::<2>::from_data([2, 2], vec![-1.0, 2.0, -3.0, 4.0]).unwrap();

        tensor.relu_inplace();

        assert_eq!(tensor.data, vec![0.0, 2.0, 0.0, 4.0]);
    }

    #[test]
    fn test_leaky_relu_inplace() {
        let mut tensor = Tensor::<2>::from_data([2, 2], vec![-2.0, 2.0, -4.0, 4.0]).unwrap();

        tensor.leaky_relu_inplace(0.1);

        assert_eq!(tensor.data, vec![-0.2, 2.0, -0.4, 4.0]);
    }

    #[test]
    fn test_sigmoid_inplace() {
        let mut tensor = Tensor::<2>::from_data([1, 2], vec![0.0, 1.0]).unwrap();

        tensor.sigmoid_inplace();

        assert!((tensor.data[0] - 0.5).abs() < 1e-6);
        assert!((tensor.data[1] - 0.7310585786).abs() < 1e-6);
    }

    #[test]
    fn test_tanh_inplace() {
        let mut tensor = Tensor::<2>::from_data([1, 2], vec![0.0, 1.0]).unwrap();

        tensor.tanh_inplace();

        assert_eq!(tensor.data[0], 0.0);
        assert!((tensor.data[1] - 0.7615941559).abs() < 1e-6);
    }

    #[test]
    fn test_clamp_inplace() {
        let mut tensor = Tensor::<2>::from_data([2, 2], vec![-5.0, 0.0, 5.0, 10.0]).unwrap();

        tensor.clamp_inplace(-2.0, 7.0);

        assert_eq!(tensor.data, vec![-2.0, 0.0, 5.0, 7.0]);
    }

    #[test]
    fn test_zero_inplace() {
        let mut tensor = Tensor::<2>::filled([2, 2], 42.0);

        tensor.zero_inplace();

        assert_eq!(tensor.data, vec![0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn test_fill_inplace() {
        let mut tensor = Tensor::<2>::zeros([2, 2]);

        tensor.fill_inplace(7.5);

        assert_eq!(tensor.data, vec![7.5, 7.5, 7.5, 7.5]);
    }

    #[test]
    fn test_vec_inplace() {
        let mut vec = vec![1.0, -2.0, 3.0, -4.0];

        vec.mul_scalar_inplace(2.0);
        assert_eq!(vec, vec![2.0, -4.0, 6.0, -8.0]);

        vec.relu_inplace();
        assert_eq!(vec, vec![2.0, 0.0, 6.0, 0.0]);

        vec.add_inplace(&[1.0, 2.0, 3.0, 4.0]);
        assert_eq!(vec, vec![3.0, 2.0, 9.0, 4.0]);

        vec.zero_inplace();
        assert_eq!(vec, vec![0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn test_inplace_batch() {
        let mut t1 = Tensor::<2>::filled([2, 2], 2.0);
        let mut t2 = Tensor::<2>::filled([2, 2], 3.0);

        let mut batch = InPlaceBatch::new();
        batch.add(&mut t1);
        batch.add(&mut t2);

        batch.mul_scalar_all(0.5);

        assert_eq!(t1.data, vec![1.0, 1.0, 1.0, 1.0]);
        assert_eq!(t2.data, vec![1.5, 1.5, 1.5, 1.5]);
    }

    #[test]
    fn test_chained_inplace_ops() {
        let mut tensor = Tensor::<2>::filled([2, 2], 10.0);

        tensor.mul_scalar_inplace(2.0); // 20.0
        tensor.add_inplace(&Tensor::<2>::filled([2, 2], -5.0)); // 15.0
        tensor.div_scalar_inplace(3.0); // 5.0
        tensor.clamp_inplace(0.0, 4.0); // 4.0

        assert_eq!(tensor.data, vec![4.0, 4.0, 4.0, 4.0]);
    }
}

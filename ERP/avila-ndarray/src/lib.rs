//! Avila NDArray - N-dimensional arrays
//! Substitui ndarray crate

use avila_parallel::prelude::*;
use rayon::prelude::*;

pub struct Array1<T> {
    data: Vec<T>,
    len: usize,
}

impl<T: Clone> Array1<T> {
    pub fn zeros(len: usize) -> Self
    where
        T: Default,
    {
        Self {
            data: vec![T::default(); len],
            len,
        }
    }

    pub fn from_vec(data: Vec<T>) -> Self {
        let len = data.len();
        Self { data, len }
    }

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn iter(&self) -> impl Iterator<Item = &T> {
        self.data.iter()
    }

    pub fn map<F, U>(&self, f: F) -> Array1<U>
    where
        F: Fn(&T) -> U + Send + Sync,
        U: Send + Clone,
        T: Sync,
    {
        use rayon::iter::{IntoParallelRefIterator, ParallelIterator};
        let data: Vec<U> = IntoParallelRefIterator::par_iter(&self.data).map(f).collect();
        Array1::from_vec(data)
    }
}

pub struct Array2<T> {
    data: Vec<T>,
    shape: (usize, usize),
}

impl<T: Clone> Array2<T> {
    pub fn zeros(shape: (usize, usize)) -> Self
    where
        T: Default,
    {
        Self {
            data: vec![T::default(); shape.0 * shape.1],
            shape,
        }
    }

    pub fn from_shape_vec(shape: (usize, usize), data: Vec<T>) -> Result<Self, &'static str> {
        if data.len() != shape.0 * shape.1 {
            return Err("Shape mismatch");
        }
        Ok(Self { data, shape })
    }

    pub fn shape(&self) -> (usize, usize) {
        self.shape
    }

    pub fn get(&self, i: usize, j: usize) -> Option<&T> {
        if i < self.shape.0 && j < self.shape.1 {
            Some(&self.data[i * self.shape.1 + j])
        } else {
            None
        }
    }

    pub fn rows(&self) -> usize {
        self.shape.0
    }

    pub fn cols(&self) -> usize {
        self.shape.1
    }

    pub fn dot(&self, other: &Array2<T>) -> Result<Array2<T>, &'static str>
    where
        T: std::ops::Add<Output = T> + std::ops::Mul<Output = T> + Default + Send + Sync,
    {
        if self.shape.1 != other.shape.0 {
            return Err("Shape mismatch for dot product");
        }

        let m = self.shape.0;
        let n = other.shape.1;
        let k = self.shape.1;

        let mut result = vec![T::default(); m * n];

        for i in 0..m {
            for j in 0..n {
                let mut sum = T::default();
                for p in 0..k {
                    let a = self.data[i * k + p].clone();
                    let b = other.data[p * n + j].clone();
                    sum = sum + a * b;
                }
                result[i * n + j] = sum;
            }
        }

        Ok(Array2 {
            data: result,
            shape: (m, n),
        })
    }
}

pub struct Array3<T> {
    data: Vec<T>,
    shape: (usize, usize, usize),
}

impl<T: Clone + Default> Array3<T> {
    pub fn zeros(shape: (usize, usize, usize)) -> Self {
        Self {
            data: vec![T::default(); shape.0 * shape.1 * shape.2],
            shape,
        }
    }

    pub fn shape(&self) -> (usize, usize, usize) {
        self.shape
    }
}

// Re-exports comuns
pub type ArrayView1<'a, T> = &'a [T];
pub type ArrayView2<'a, T> = &'a Array2<T>;

pub mod prelude {
    pub use super::{Array1, Array2, Array3};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_array1() {
        let a = Array1::from_vec(vec![1, 2, 3]);
        assert_eq!(a.len(), 3);
    }

    #[test]
    fn test_array2_dot() {
        let a = Array2::from_shape_vec((2, 2), vec![1, 2, 3, 4]).unwrap();
        let b = Array2::from_shape_vec((2, 2), vec![5, 6, 7, 8]).unwrap();
        let c = a.dot(&b).unwrap();
        assert_eq!(c.shape(), (2, 2));
    }
}

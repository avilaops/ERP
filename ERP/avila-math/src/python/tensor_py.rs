//! Python bindings for Tensor

#![cfg(feature = "python")]

use crate::tensor::Tensor;
use numpy::{PyArray, PyArrayMethods, ToPyArray};
use pyo3::prelude::*;

/// Python wrapper for Tensor
#[pyclass(name = "Tensor")]
pub struct PyTensor {
    inner: Tensor<f64>,
}

#[pymethods]
impl PyTensor {
    /// Create a new tensor with given shape
    #[new]
    fn new(shape: Vec<usize>, fill_value: f64) -> Self {
        let inner = Tensor::new(shape, fill_value);
        Self { inner }
    }

    /// Create tensor from numpy array
    #[staticmethod]
    fn from_numpy(py: Python, arr: &Bound<'_, PyArray<f64, numpy::IxDyn>>) -> PyResult<Self> {
        let shape = arr.shape().to_vec();
        let data = unsafe { arr.as_slice()? }.to_vec();

        let mut tensor = Tensor::new(shape, 0.0);
        for (i, &val) in data.iter().enumerate() {
            tensor.data_mut()[i] = val;
        }

        Ok(Self { inner: tensor })
    }

    /// Convert to numpy array
    fn to_numpy<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyArray<f64, numpy::IxDyn>>> {
        let shape = self.inner.shape().to_vec();
        let data = self.inner.data().to_vec();
        Ok(PyArray::from_vec_bound(py, data).reshape(shape)?)
    }

    /// Get tensor shape
    fn shape(&self) -> Vec<usize> {
        self.inner.shape().to_vec()
    }

    /// Get number of dimensions
    fn ndim(&self) -> usize {
        self.inner.ndim()
    }

    /// Get total number of elements
    fn size(&self) -> usize {
        self.inner.size()
    }

    /// Fill tensor with value
    fn fill(&mut self, value: f64) {
        self.inner.fill(value);
    }

    /// Get element at index
    fn get(&self, index: Vec<usize>) -> PyResult<f64> {
        Ok(self.inner.get(&index))
    }

    /// Set element at index
    fn set(&mut self, index: Vec<usize>, value: f64) {
        self.inner.set(&index, value);
    }

    /// Reshape tensor
    fn reshape(&mut self, new_shape: Vec<usize>) -> PyResult<()> {
        self.inner.reshape(&new_shape);
        Ok(())
    }

    /// Sum all elements
    fn sum(&self) -> f64 {
        self.inner.sum()
    }

    /// Mean of all elements
    fn mean(&self) -> f64 {
        self.inner.mean()
    }

    /// Add two tensors
    fn add(&self, other: &PyTensor) -> PyResult<PyTensor> {
        let result = self.inner.add(&other.inner);
        Ok(PyTensor { inner: result })
    }

    /// Multiply by scalar
    fn scale(&self, scalar: f64) -> PyTensor {
        let result = self.inner.scale(scalar);
        PyTensor { inner: result }
    }

    /// String representation
    fn __repr__(&self) -> String {
        format!(
            "Tensor(shape={:?}, size={})",
            self.inner.shape(),
            self.inner.size()
        )
    }
}

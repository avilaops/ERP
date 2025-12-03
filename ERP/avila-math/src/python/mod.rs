//! Python bindings for avila-math
//!
//! This module provides Python bindings using PyO3.
//!
//! # Installation
//! ```bash
//! pip install maturin
//! maturin develop --features python
//! ```
//!
//! # Usage in Python
//! ```python
//! import avila_math
//!
//! # Quaternions
//! q1 = avila_math.Quaternion(1.0, 0.0, 0.0, 0.0)
//! q2 = avila_math.Quaternion.from_axis_angle([0, 1, 0], 3.14159/2)
//! q3 = q1.multiply(q2)
//!
//! # Tensors
//! tensor = avila_math.Tensor([2, 3, 4], 0.0)
//! tensor.fill(1.0)
//! ```

#![cfg(feature = "python")]

use pyo3::prelude::*;

mod autograd_py;
mod quaternion_py;
mod tensor_py;

pub use autograd_py::*;
pub use quaternion_py::*;
pub use tensor_py::*;

/// Python module for avila-math
#[pymodule]
fn avila_math(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PyTensor>()?;
    m.add_class::<PyQuaternion>()?;
    m.add_class::<PyVariable>()?;
    m.add_class::<PyTape>()?;
    Ok(())
}

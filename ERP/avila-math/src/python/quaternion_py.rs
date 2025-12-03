//! Python bindings for Quaternion

#![cfg(feature = "python")]

use crate::geometry::quaternion3d::Quaternion3D;
use pyo3::prelude::*;

/// Python wrapper for Quaternion3D
#[pyclass(name = "Quaternion")]
pub struct PyQuaternion {
    inner: Quaternion3D,
}

#[pymethods]
impl PyQuaternion {
    /// Create a new quaternion
    #[new]
    fn new(w: f64, x: f64, y: f64, z: f64) -> Self {
        Self {
            inner: Quaternion3D::new(w, x, y, z),
        }
    }

    /// Create identity quaternion
    #[staticmethod]
    fn identity() -> Self {
        Self {
            inner: Quaternion3D::identity(),
        }
    }

    /// Create from axis and angle
    #[staticmethod]
    fn from_axis_angle(axis: [f64; 3], angle: f64) -> Self {
        Self {
            inner: Quaternion3D::from_axis_angle(axis, angle),
        }
    }

    /// Create from Euler angles
    #[staticmethod]
    fn from_euler(roll: f64, pitch: f64, yaw: f64) -> Self {
        Self {
            inner: Quaternion3D::from_euler(roll, pitch, yaw),
        }
    }

    /// Get components
    #[getter]
    fn w(&self) -> f64 {
        self.inner.w
    }

    #[getter]
    fn x(&self) -> f64 {
        self.inner.x
    }

    #[getter]
    fn y(&self) -> f64 {
        self.inner.y
    }

    #[getter]
    fn z(&self) -> f64 {
        self.inner.z
    }

    /// Multiply quaternions
    fn multiply(&self, other: &PyQuaternion) -> PyQuaternion {
        PyQuaternion {
            inner: self.inner * other.inner,
        }
    }

    /// Conjugate
    fn conjugate(&self) -> PyQuaternion {
        PyQuaternion {
            inner: self.inner.conjugate(),
        }
    }

    /// Normalize
    fn normalize(&mut self) {
        self.inner = self.inner.normalize();
    }

    /// Get normalized copy
    fn normalized(&self) -> PyQuaternion {
        PyQuaternion {
            inner: self.inner.normalize(),
        }
    }

    /// Magnitude
    fn magnitude(&self) -> f64 {
        self.inner.magnitude()
    }

    /// Inverse
    fn inverse(&self) -> PyQuaternion {
        PyQuaternion {
            inner: self.inner.inverse(),
        }
    }

    /// Rotate a vector
    fn rotate_vector(&self, v: [f64; 3]) -> [f64; 3] {
        self.inner.rotate_vector(v)
    }

    /// SLERP interpolation
    fn slerp(&self, other: &PyQuaternion, t: f64) -> PyQuaternion {
        PyQuaternion {
            inner: self.inner.slerp(&other.inner, t),
        }
    }

    /// Convert to rotation matrix (3x3)
    fn to_matrix(&self) -> [[f64; 3]; 3] {
        self.inner.to_matrix()
    }

    /// Dot product
    fn dot(&self, other: &PyQuaternion) -> f64 {
        self.inner.dot(&other.inner)
    }

    /// String representation
    fn __repr__(&self) -> String {
        format!(
            "Quaternion(w={:.4}, x={:.4}, y={:.4}, z={:.4})",
            self.inner.w, self.inner.x, self.inner.y, self.inner.z
        )
    }

    /// Multiply operator
    fn __mul__(&self, other: &PyQuaternion) -> PyQuaternion {
        self.multiply(other)
    }
}

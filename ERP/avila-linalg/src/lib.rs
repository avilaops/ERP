//! # Avila Linear Algebra
//!
//! Biblioteca de álgebra linear genuína em Rust para o ecossistema Avila.
//!
//! ## Filosofia
//!
//! - **100% Avila** - Sem dependências pesadas
//! - **Eficiente** - Performance sem sacrificar clareza
//! - **Educacional** - Código claro e bem documentado
//! - **Flexível** - Suporte para tipos genéricos
//!
//! ## Uso Rápido
//!
//! ```rust
//! use avila_linalg::{Vector3, Matrix3x3};
//!
//! let v1 = Vector3::new(1.0, 2.0, 3.0);
//! let v2 = Vector3::new(4.0, 5.0, 6.0);
//!
//! let dot = v1.dot(&v2);
//! let cross = v1.cross(&v2);
//! ```

#![deny(missing_docs)]
#![warn(clippy::all)]

pub mod decomposition;
pub mod interop;
pub mod matrix;
pub mod ops;
// TODO: Implement SIMD optimizations
// pub mod simd;
/// Stack-allocated matrices com const generics
// TODO: Implement static matrices with const generics
// pub mod static_matrix;
pub mod transform;
pub mod vector;

/// Strassen's algorithm for fast matrix multiplication
// TODO: Implement Strassen algorithm
// pub mod strassen;

/// Parallel operations using rayon
// TODO: Implement parallel operations
// pub mod parallel;

/// Sparse matrix formats (CSR/CSC)
// TODO: Implement sparse matrices
// pub mod sparse;

// Re-exports principais
// pub use decomposition::{Cholesky, EigenDecomposition, LU, QR, SVD};
pub use matrix::{Matrix2x2, Matrix3x3, Matrix4x4, MatrixMxN};
// pub use static_matrix::{Mat2, Mat3, Mat4, StaticMatrix};
pub use vector::{Vector2, Vector3, Vector4, VectorN};
// pub use sparse::{SparseMatrixCSR, SparseMatrixCSC};

/// Módulo prelude para imports convenientes
pub mod prelude {
    // pub use crate::decomposition::*;
    pub use crate::matrix::*;
    pub use crate::ops::*;
    pub use crate::transform::*;
    pub use crate::vector::*;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {
        let v = Vector3::new(1.0, 2.0, 3.0);
        assert_eq!(v.x(), 1.0);
        assert_eq!(v.y(), 2.0);
        assert_eq!(v.z(), 3.0);
    }
}

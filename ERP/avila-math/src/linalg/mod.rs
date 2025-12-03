//! # Linear Algebra Module
//!
//! Advanced linear algebra operations including:
//! - SVD (Singular Value Decomposition)
//! - Eigenvalue decomposition
//! - QR decomposition
//! - LU decomposition
//! - Matrix inversions

pub mod decomposition;
pub mod eigen;
pub mod solve;

pub use decomposition::{lu_decomposition, qr_decomposition, svd};
pub use eigen::{
    eigenvalues, eigenvectors, is_positive_definite, power_iteration, spectral_radius,
};
pub use solve::{solve_least_squares, solve_linear_system, solve_triangular};

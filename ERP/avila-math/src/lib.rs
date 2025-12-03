/// Avila Math - Mathematical Kernel for Avila Ecosystem
///
/// This library provides core mathematical primitives used across the Avila platform:
/// - Vectors (2D, 3D, 4D)
/// - Matrices (3×3, 4×4)
/// - Quaternions (3D and dual quaternions)
/// - Tensors (generalized N-dimensional arrays)
/// - 4D geometry (tesseracts, 24-cell, rotations)
///
/// # Features
///
/// - **Pure Rust** implementation
/// - **Zero-copy** operations where possible
/// - **Type-safe** APIs
/// - **SIMD-friendly** data layouts
/// - **Game engine** and **scientific computing** ready
///
/// # Examples
///
/// ```rust
/// use avila_math::geometry::Quat3D;
///
/// // Create a quaternion from components
/// let q = Quat3D::new(1.0, 0.0, 0.0, 0.0);
///
/// // Normalize it
/// let normalized = q.normalize();
/// assert!((normalized.norm() - 1.0).abs() < 1e-10);
/// ```
pub mod geometry;

/// Módulo de Tensores - Estruturas tensoriais generalizadas e operações
///
/// Este módulo implementa tensores de ordem arbitrária (0-4) com operações
/// para álgebra linear, machine learning e processamento de dados multidimensionais.
pub mod tensor;

/// Módulo de Processamento de Sinais
///
/// FFT (1D-4D), análise espectral, janelas e filtros.
pub mod signal;

/// Módulo de Álgebra Linear Avançada
///
/// SVD, eigenvalues, QR, LU decompositions e resolução de sistemas lineares.
pub mod linalg;

/// Módulo de Cálculo Diferencial 4D
///
/// Operadores diferenciais (gradiente, divergência, Laplaciano) e campos vetoriais.
pub mod calculus;

/// Módulo de Interpolação 4D
///
/// Curvas de Bézier, splines cúbicas, interpolação linear/bilinear/trilinear.
pub mod interpolation;

/// Módulo de Diferenciação Automática
///
/// Sistema tape-based para backpropagation e treino de redes neurais.
pub mod autograd;

/// Módulo de Filtros Adaptativos
///
/// Filtro de Kalman, Wiener e Transformada Z para sistemas discretos.
pub mod filters;

/// Bindings Python (PyO3)
#[cfg(feature = "python")]
pub mod python;

// Re-export commonly used types
pub use autograd::{Tape, Variable};
pub use filters::{KalmanFilter, WienerFilter};
pub use geometry::{DualQuat, Matrix4, Quat3D, SO4Rotation, Vector2, Vector3, Vector4, AABB};
pub use tensor::{Tensor, Tensor4D};

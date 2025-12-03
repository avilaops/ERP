//! # Calculus Module - Differential Operators
//!
//! Operadores diferenciais para campos escalares e vetoriais em 4D:
//! - Gradiente (∇f)
//! - Divergência (∇·F)
//! - Rotacional/Curl generalizado
//! - Laplaciano (∇²f)
//! - Derivadas direcionais

pub mod differential;
pub mod fields;
pub mod operators;

pub use differential::{derivative, gradient_4d, hessian, jacobian, partial_derivative};
pub use fields::{curl_4d, divergence_4d, scalar_field_4d, vector_field_4d, VectorField4D};
pub use operators::{directional_derivative, grad_div_4d, laplacian_4d};

pub mod conv4d;
pub mod inplace;
pub mod simd;
/// Módulo de Tensores - Estruturas tensoriais generalizadas e operações
///
/// Este módulo implementa tensores de ordem arbitrária (0-4) com operações
/// para álgebra linear, machine learning e processamento de dados multidimensionais.
#[allow(clippy::module_inception)]
pub mod tensor;
pub mod tensor4d;

pub use conv4d::{avg_pool4d, conv4d, max_pool4d, Conv4DConfig, Conv4DLayer, Tensor5D, Tensor6D};
pub use inplace::{InPlace, InPlaceBatch, VecInPlace};
pub use simd::{
    add_elementwise_simd, dot_product_simd, mul_elementwise_simd, mul_scalar_simd, relu_simd,
    sum_simd,
};
pub use tensor::{Matrix, Scalar, Tensor, Vector};
pub use tensor4d::{Tensor3D, Tensor4D};

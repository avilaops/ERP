//! # Arxis - Biblioteca de Matemática Avançada
//!
//! Biblioteca Rust completa para computação matemática avançada, incluindo:
//! - Quaternions para rotações 3D e 4D com suporte para grupo SO(4)
//! - Tensores generalizados (ordem 0-4) para relatividade, ML e processamento de imagens
//! - Geometria 4D com politopos regulares e projeções
//! - Física teórica: Relatividade Geral, transformações de Lorentz
//!
//! ## Estrutura dos Módulos
//!
//! - [`geometry`] - Quaternions, geometria 4D, transformações espaciais
//! - [`physics`] - Relatividade geral, transformações de Lorentz, tensores físicos
//! - [`tensor`] - Tensores generalizados, operações tensoriais, ML
//!
//! ## Exemplos
//!
//! ```rust,ignore
//! use arxis_quaternions::prelude::*;
//!
//! // Rotação 3D com quaternions
//! let q = Quat3D::from_axis_angle([0.0, 0.0, 1.0], std::f64::consts::PI / 2.0);
//! let v = q.rotate_vector([1.0, 0.0, 0.0]);
//!
//! // Geometria 4D
//! let tesseract = Tesseract::new();
//! println!("Vértices: {}", tesseract.vertices.len());
//!
//! // Tensores
//! let matrix = Matrix::zeros([3, 3]);
//! ```

pub mod geometry;
pub mod physics;
pub mod tensor;

/// Prelude com imports mais comuns
pub mod prelude {
    pub use crate::geometry::{
        Cell24, Matrix4x4, Point4D, Projection4Dto3D, RigidBody4D, Tesseract,
    };
    pub use crate::geometry::{DualQuat, Quat3D, SO4Rotation};
    pub use crate::physics::{
        BlackHoleProperties, ChristoffelSymbols, CompactBinary, CosmicStructure,
        CosmologicalObservables, CosmologicalParameters, Detector, EinsteinTensor, FLRWUniverse,
        GeodesicIntegrator, GravitationalEffects, GravitationalLens, GravitationalWave, LensType,
        LensingStatistics, LorentzTransform, MetricTensor, MicrolensingEvent, MinkowskiMetric,
        OrbitCalculator, OrbitType, ParticleState, Polarization, WaveformAnalysis, WeakLensing,
    };
    pub use crate::tensor::{Matrix, Scalar, Tensor, Tensor3D, Tensor4D, Vector};
}

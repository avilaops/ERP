//! Conversões entre avila-linalg e avila-math
//!
//! Fornece traits e implementações para conversão zero-cost entre os tipos
//! de ambas as bibliotecas, permitindo interoperabilidade perfeita.
//!
//! ## Filosofia
//!
//! - **avila-linalg**: Álgebra linear pura, genérica, educacional, otimizada
//! - **avila-math**: Matemática aplicada, geometria, quaternions, 4D, CV/gráficos
//!
//! ## Conversões Disponíveis
//!
//! - `avila_linalg::Vector3<f64>` ↔ `avila_math::geometry::Vector3`
//! - `avila_linalg::Vector4<f64>` ↔ `avila_math::geometry::Vector4`
//! - `avila_linalg::Matrix3x3<f64>` ↔ `avila_math::geometry::Matrix3`
//! - `avila_linalg::Matrix4x4<f64>` ↔ `avila_math::geometry::Matrix4`

#[cfg(feature = "avila-math")]
use avila_math::geometry::{Vector3 as MathVec3, Vector4 as MathVec4};

#[cfg(feature = "avila-math")]
use crate::vector::{Vector3, Vector4};

#[cfg(feature = "avila-math")]
impl From<Vector3<f64>> for MathVec3 {
    #[inline]
    fn from(v: Vector3<f64>) -> Self {
        MathVec3 {
            x: v.x(),
            y: v.y(),
            z: v.z(),
        }
    }
}

#[cfg(feature = "avila-math")]
impl From<MathVec3> for Vector3<f64> {
    #[inline]
    fn from(v: MathVec3) -> Self {
        Vector3::new(v.x, v.y, v.z)
    }
}

#[cfg(feature = "avila-math")]
impl From<Vector4<f64>> for MathVec4 {
    #[inline]
    fn from(v: Vector4<f64>) -> Self {
        MathVec4 {
            x: v.x(),
            y: v.y(),
            z: v.z(),
            w: v.w(),
        }
    }
}

#[cfg(feature = "avila-math")]
impl From<MathVec4> for Vector4<f64> {
    #[inline]
    fn from(v: MathVec4) -> Self {
        Vector4::new(v.x, v.y, v.z, v.w)
    }
}

#[cfg(test)]
#[cfg(feature = "avila-math")]
mod tests {
    use super::*;

    #[test]
    fn test_vector3_conversion() {
        let linalg_vec = Vector3::new(1.0, 2.0, 3.0);
        let math_vec: MathVec3 = linalg_vec.into();

        assert_eq!(math_vec.x, 1.0);
        assert_eq!(math_vec.y, 2.0);
        assert_eq!(math_vec.z, 3.0);

        let back: Vector3<f64> = math_vec.into();
        assert_eq!(back, linalg_vec);
    }

    #[test]
    fn test_vector4_conversion() {
        let linalg_vec = Vector4::new(1.0, 2.0, 3.0, 4.0);
        let math_vec: MathVec4 = linalg_vec.into();

        assert_eq!(math_vec.x, 1.0);
        assert_eq!(math_vec.y, 2.0);
        assert_eq!(math_vec.z, 3.0);
        assert_eq!(math_vec.w, 4.0);

        let back: Vector4<f64> = math_vec.into();
        assert_eq!(back, linalg_vec);
    }
}

//! Módulo de transformações 3D/4D para engines gráficas
//!
//! Implementa transformações essenciais para engines AAA:
//! - Rotações (Euler, Quaternions, Axis-Angle)
//! - Translação
//! - Escala
//! - Matrizes de projeção
//! - Matrizes de view/camera
//! - Interpolação (lerp, slerp)

use crate::matrix::{Matrix3x3, Matrix4x4};
use crate::vector::{Vector3, Vector4};
use num_traits::Float;
use std::ops::Mul;

/// Quaternion para rotações (evita gimbal lock)
///
/// q = w + xi + yj + zk
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Quaternion<T> {
    /// Parte real (escalar)
    pub w: T,
    /// Componente i (imaginário x)
    pub x: T,
    /// Componente j (imaginário y)
    pub y: T,
    /// Componente k (imaginário z)
    pub z: T,
}

impl<T: Float> Quaternion<T> {
    /// Cria quaternion identidade (sem rotação)
    pub fn identity() -> Self {
        Self {
            w: T::one(),
            x: T::zero(),
            y: T::zero(),
            z: T::zero(),
        }
    }

    /// Cria quaternion de eixo-ângulo (axis-angle)
    ///
    /// axis: vetor unitário do eixo de rotação
    /// angle: ângulo em radianos
    pub fn from_axis_angle(axis: Vector3<T>, angle: T) -> Self {
        let half_angle = angle / (T::one() + T::one());
        let sin_half = half_angle.sin();
        Self {
            w: half_angle.cos(),
            x: axis.x() * sin_half,
            y: axis.y() * sin_half,
            z: axis.z() * sin_half,
        }
    }

    /// Cria quaternion de ângulos de Euler (roll, pitch, yaw)
    ///
    /// roll: rotação em X (em radianos)
    /// pitch: rotação em Y (em radianos)
    /// yaw: rotação em Z (em radianos)
    pub fn from_euler(roll: T, pitch: T, yaw: T) -> Self {
        let two = T::one() + T::one();
        let half_roll = roll / two;
        let half_pitch = pitch / two;
        let half_yaw = yaw / two;

        let cr = half_roll.cos();
        let sr = half_roll.sin();
        let cp = half_pitch.cos();
        let sp = half_pitch.sin();
        let cy = half_yaw.cos();
        let sy = half_yaw.sin();

        Self {
            w: cr * cp * cy + sr * sp * sy,
            x: sr * cp * cy - cr * sp * sy,
            y: cr * sp * cy + sr * cp * sy,
            z: cr * cp * sy - sr * sp * cy,
        }
    }

    /// Converte para matriz de rotação 3×3
    pub fn to_matrix3(&self) -> Matrix3x3<T> {
        let two = T::one() + T::one();
        let xx = self.x * self.x;
        let yy = self.y * self.y;
        let zz = self.z * self.z;
        let xy = self.x * self.y;
        let xz = self.x * self.z;
        let yz = self.y * self.z;
        let wx = self.w * self.x;
        let wy = self.w * self.y;
        let wz = self.w * self.z;

        Matrix3x3::from_rows([
            [T::one() - two * (yy + zz), two * (xy - wz), two * (xz + wy)],
            [two * (xy + wz), T::one() - two * (xx + zz), two * (yz - wx)],
            [two * (xz - wy), two * (yz + wx), T::one() - two * (xx + yy)],
        ])
    }

    /// Converte para matriz de rotação 4×4 (coordenadas homogêneas)
    pub fn to_matrix4(&self) -> Matrix4x4<T> {
        let two = T::one() + T::one();
        let xx = self.x * self.x;
        let yy = self.y * self.y;
        let zz = self.z * self.z;
        let xy = self.x * self.y;
        let xz = self.x * self.z;
        let yz = self.y * self.z;
        let wx = self.w * self.x;
        let wy = self.w * self.y;
        let wz = self.w * self.z;

        Matrix4x4::from_rows([
            [
                T::one() - two * (yy + zz),
                two * (xy - wz),
                two * (xz + wy),
                T::zero(),
            ],
            [
                two * (xy + wz),
                T::one() - two * (xx + zz),
                two * (yz - wx),
                T::zero(),
            ],
            [
                two * (xz - wy),
                two * (yz + wx),
                T::one() - two * (xx + yy),
                T::zero(),
            ],
            [T::zero(), T::zero(), T::zero(), T::one()],
        ])
    }

    /// Norma do quaternion
    pub fn norm(&self) -> T {
        (self.w * self.w + self.x * self.x + self.y * self.y + self.z * self.z).sqrt()
    }

    /// Normaliza o quaternion (torna unitário)
    pub fn normalize(&self) -> Self {
        let n = self.norm();
        Self {
            w: self.w / n,
            x: self.x / n,
            y: self.y / n,
            z: self.z / n,
        }
    }

    /// Conjugado do quaternion (inverte rotação)
    pub fn conjugate(&self) -> Self {
        Self {
            w: self.w,
            x: -self.x,
            y: -self.y,
            z: -self.z,
        }
    }

    /// Rotaciona um vetor 3D usando este quaternion
    pub fn rotate_vector(&self, v: Vector3<T>) -> Vector3<T> {
        // v' = q * v * q*
        let qv = Quaternion {
            w: T::zero(),
            x: v.x(),
            y: v.y(),
            z: v.z(),
        };

        let result = *self * qv * self.conjugate();
        Vector3::new(result.x, result.y, result.z)
    }

    /// Interpolação esférica linear (SLERP) - essencial para animações suaves
    ///
    /// t ∈ [0, 1]
    pub fn slerp(&self, other: &Self, t: T) -> Self {
        let dot = self.w * other.w + self.x * other.x + self.y * other.y + self.z * other.z;

        // Se quaternions são muito próximos, usar lerp
        let threshold = T::from(0.9995).unwrap();
        if dot.abs() > threshold {
            return self.lerp(other, t).normalize();
        }

        // Garantir caminho mais curto
        let (other, dot) = if dot < T::zero() {
            (
                Quaternion {
                    w: -other.w,
                    x: -other.x,
                    y: -other.y,
                    z: -other.z,
                },
                -dot,
            )
        } else {
            (*other, dot)
        };

        let theta = dot.acos();
        let sin_theta = theta.sin();

        let a = ((T::one() - t) * theta).sin() / sin_theta;
        let b = (t * theta).sin() / sin_theta;

        Self {
            w: a * self.w + b * other.w,
            x: a * self.x + b * other.x,
            y: a * self.y + b * other.y,
            z: a * self.z + b * other.z,
        }
    }

    /// Interpolação linear (LERP) - mais rápida mas não geodésica
    pub fn lerp(&self, other: &Self, t: T) -> Self {
        Self {
            w: self.w + (other.w - self.w) * t,
            x: self.x + (other.x - self.x) * t,
            y: self.y + (other.y - self.y) * t,
            z: self.z + (other.z - self.z) * t,
        }
    }
}

// Multiplicação de quaternions (composição de rotações)
impl<T: Float> Mul for Quaternion<T> {
    type Output = Self;

    fn mul(self, other: Self) -> Self {
        Self {
            w: self.w * other.w - self.x * other.x - self.y * other.y - self.z * other.z,
            x: self.w * other.x + self.x * other.w + self.y * other.z - self.z * other.y,
            y: self.w * other.y - self.x * other.z + self.y * other.w + self.z * other.x,
            z: self.w * other.z + self.x * other.y - self.y * other.x + self.z * other.w,
        }
    }
}

/// Extensões para Matrix4x4 com operações de engine
impl<T: Float> Matrix4x4<T> {
    /// Matriz de translação
    pub fn translation(x: T, y: T, z: T) -> Self {
        Self::from_rows([
            [T::one(), T::zero(), T::zero(), x],
            [T::zero(), T::one(), T::zero(), y],
            [T::zero(), T::zero(), T::one(), z],
            [T::zero(), T::zero(), T::zero(), T::one()],
        ])
    }

    /// Matriz de escala uniforme
    pub fn scale(s: T) -> Self {
        Self::from_rows([
            [s, T::zero(), T::zero(), T::zero()],
            [T::zero(), s, T::zero(), T::zero()],
            [T::zero(), T::zero(), s, T::zero()],
            [T::zero(), T::zero(), T::zero(), T::one()],
        ])
    }

    /// Matriz de escala não-uniforme
    pub fn scale_xyz(x: T, y: T, z: T) -> Self {
        Self::from_rows([
            [x, T::zero(), T::zero(), T::zero()],
            [T::zero(), y, T::zero(), T::zero()],
            [T::zero(), T::zero(), z, T::zero()],
            [T::zero(), T::zero(), T::zero(), T::one()],
        ])
    }

    /// Matriz de rotação em X (roll)
    pub fn rotation_x(angle: T) -> Self {
        let c = angle.cos();
        let s = angle.sin();
        Self::from_rows([
            [T::one(), T::zero(), T::zero(), T::zero()],
            [T::zero(), c, -s, T::zero()],
            [T::zero(), s, c, T::zero()],
            [T::zero(), T::zero(), T::zero(), T::one()],
        ])
    }

    /// Matriz de rotação em Y (pitch)
    pub fn rotation_y(angle: T) -> Self {
        let c = angle.cos();
        let s = angle.sin();
        Self::from_rows([
            [c, T::zero(), s, T::zero()],
            [T::zero(), T::one(), T::zero(), T::zero()],
            [-s, T::zero(), c, T::zero()],
            [T::zero(), T::zero(), T::zero(), T::one()],
        ])
    }

    /// Matriz de rotação em Z (yaw)
    pub fn rotation_z(angle: T) -> Self {
        let c = angle.cos();
        let s = angle.sin();
        Self::from_rows([
            [c, -s, T::zero(), T::zero()],
            [s, c, T::zero(), T::zero()],
            [T::zero(), T::zero(), T::one(), T::zero()],
            [T::zero(), T::zero(), T::zero(), T::one()],
        ])
    }

    /// Matriz look-at (câmera olhando para um ponto)
    ///
    /// eye: posição da câmera
    /// target: ponto que a câmera está olhando
    /// up: vetor "para cima" (geralmente (0,1,0))
    pub fn look_at(eye: Vector3<T>, target: Vector3<T>, up: Vector3<T>) -> Self {
        let f = (target - eye).normalize(); // forward
        let r = f.cross(&up).normalize(); // right
        let u = r.cross(&f); // up recalculado

        Self::from_rows([
            [r.x(), r.y(), r.z(), -r.dot(&eye)],
            [u.x(), u.y(), u.z(), -u.dot(&eye)],
            [-f.x(), -f.y(), -f.z(), f.dot(&eye)],
            [T::zero(), T::zero(), T::zero(), T::one()],
        ])
    }

    /// Matriz de projeção perspectiva (FOV-based)
    ///
    /// fovy: campo de visão vertical (em radianos)
    /// aspect: aspect ratio (largura/altura)
    /// near: plano near
    /// far: plano far
    pub fn perspective(fovy: T, aspect: T, near: T, far: T) -> Self {
        let two = T::one() + T::one();
        let tan_half_fovy = (fovy / two).tan();

        let f = T::one() / tan_half_fovy;
        let range = far - near;

        Self::from_rows([
            [f / aspect, T::zero(), T::zero(), T::zero()],
            [T::zero(), f, T::zero(), T::zero()],
            [
                T::zero(),
                T::zero(),
                -(far + near) / range,
                -(two * far * near) / range,
            ],
            [T::zero(), T::zero(), -T::one(), T::zero()],
        ])
    }

    /// Matriz de projeção ortográfica
    ///
    /// left, right, bottom, top, near, far: bounds do volume
    pub fn orthographic(left: T, right: T, bottom: T, top: T, near: T, far: T) -> Self {
        let two = T::one() + T::one();
        let width = right - left;
        let height = top - bottom;
        let depth = far - near;

        Self::from_rows([
            [two / width, T::zero(), T::zero(), -(right + left) / width],
            [T::zero(), two / height, T::zero(), -(top + bottom) / height],
            [T::zero(), T::zero(), -two / depth, -(far + near) / depth],
            [T::zero(), T::zero(), T::zero(), T::one()],
        ])
    }

    /// Determinante de matriz 4×4 (via expansão de Laplace)
    pub fn det(&self) -> T {
        // Expande pela primeira linha
        // det(A) = a₀₀C₀₀ - a₀₁C₀₁ + a₀₂C₀₂ - a₀₃C₀₃

        // Seria muito código expandir tudo aqui...
        // Implementação simplificada via blocos 3×3
        unimplemented!("Determinante 4×4 será implementado em v0.2.0 com LU decomposition")
    }

    /// Inversa de matriz 4×4 (importante para transformações inversas)
    pub fn inverse(&self) -> Option<Self> {
        // Implementação completa requer decomposição LU ou Gauss-Jordan
        // Por enquanto, versão placeholder
        unimplemented!("Inversa 4×4 será implementada em v0.2.0 via Gauss-Jordan")
    }
}

/// Operações com Vector4 (coordenadas homogêneas)
impl<T: Float> Vector4<T> {
    /// Converte de Vector3 para coordenadas homogêneas (ponto)
    pub fn from_point(v: Vector3<T>) -> Self {
        Self::new(v.x(), v.y(), v.z(), T::one())
    }

    /// Converte de Vector3 para coordenadas homogêneas (direção)
    pub fn from_direction(v: Vector3<T>) -> Self {
        Self::new(v.x(), v.y(), v.z(), T::zero())
    }

    /// Converte de volta para Vector3 (divisão por w)
    pub fn to_vector3(&self) -> Vector3<T> {
        if self.w() == T::zero() {
            Vector3::new(self.x(), self.y(), self.z())
        } else {
            Vector3::new(
                self.x() / self.w(),
                self.y() / self.w(),
                self.z() / self.w(),
            )
        }
    }
}

// Multiplicação Matrix4x4 × Vector4
impl<T: Float> Mul<Vector4<T>> for Matrix4x4<T> {
    type Output = Vector4<T>;

    fn mul(self, v: Vector4<T>) -> Vector4<T> {
        let data = self.data();
        Vector4::new(
            data[0][0] * v.x() + data[0][1] * v.y() + data[0][2] * v.z() + data[0][3] * v.w(),
            data[1][0] * v.x() + data[1][1] * v.y() + data[1][2] * v.z() + data[1][3] * v.w(),
            data[2][0] * v.x() + data[2][1] * v.y() + data[2][2] * v.z() + data[2][3] * v.w(),
            data[3][0] * v.x() + data[3][1] * v.y() + data[3][2] * v.z() + data[3][3] * v.w(),
        )
    }
}

// Multiplicação Matrix4x4 × Matrix4x4
impl<T: Float> Mul for Matrix4x4<T> {
    type Output = Self;

    fn mul(self, other: Self) -> Self {
        let a = self.data();
        let b = other.data();
        let mut result = [[T::zero(); 4]; 4];

        for i in 0..4 {
            for j in 0..4 {
                let mut sum = T::zero();
                for k in 0..4 {
                    sum = sum + a[i][k] * b[k][j];
                }
                result[i][j] = sum;
            }
        }

        Self::from_rows(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    #[test]
    fn test_quaternion_identity() {
        let q: Quaternion<f64> = Quaternion::identity();
        assert_eq!(q.w, 1.0);
        assert_eq!(q.x, 0.0);
    }

    #[test]
    fn test_quaternion_rotation() {
        // Rotação de 90° em Z
        let axis = Vector3::new(0.0, 0.0, 1.0);
        let q = Quaternion::from_axis_angle(axis, PI / 2.0);

        let v = Vector3::new(1.0, 0.0, 0.0);
        let rotated = q.rotate_vector(v);

        // Deve resultar em aproximadamente (0, 1, 0)
        assert!((rotated.x() - 0.0).abs() < 1e-10);
        assert!((rotated.y() - 1.0).abs() < 1e-10);
        assert!((rotated.z() - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_matrix4_translation() {
        let m = Matrix4x4::translation(1.0, 2.0, 3.0);
        let point = Vector4::from_point(Vector3::new(0.0, 0.0, 0.0));
        let translated = m * point;

        assert_eq!(translated.x(), 1.0);
        assert_eq!(translated.y(), 2.0);
        assert_eq!(translated.z(), 3.0);
    }
}

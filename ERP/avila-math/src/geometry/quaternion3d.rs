/// Quaternion 3D - Representa rotações em 3D usando a álgebra de quaternions
/// Um quaternion é da forma: q = w + xi + yj + zk
/// onde i² = j² = k² = ijk = -1
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Quat3D {
    pub w: f64, // parte escalar (real)
    pub x: f64, // componente i
    pub y: f64, // componente j
    pub z: f64, // componente k
}

impl Quat3D {
    /// Cria um novo quaternion
    pub fn new(w: f64, x: f64, y: f64, z: f64) -> Self {
        Self { w, x, y, z }
    }

    /// Cria um quaternion identidade (sem rotação)
    pub fn identity() -> Self {
        Self::new(1.0, 0.0, 0.0, 0.0)
    }

    /// Cria um quaternion a partir de um eixo e ângulo
    /// axis: vetor unitário do eixo de rotação
    /// angle: ângulo em radianos
    pub fn from_axis_angle(axis: [f64; 3], angle: f64) -> Self {
        let half_angle = angle / 2.0;
        let sin_half = half_angle.sin();

        Self::new(
            half_angle.cos(),
            axis[0] * sin_half,
            axis[1] * sin_half,
            axis[2] * sin_half,
        )
    }

    /// Cria um quaternion a partir de ângulos de Euler (roll, pitch, yaw)
    pub fn from_euler(roll: f64, pitch: f64, yaw: f64) -> Self {
        let cr = (roll * 0.5).cos();
        let sr = (roll * 0.5).sin();
        let cp = (pitch * 0.5).cos();
        let sp = (pitch * 0.5).sin();
        let cy = (yaw * 0.5).cos();
        let sy = (yaw * 0.5).sin();

        Self::new(
            cr * cp * cy + sr * sp * sy,
            sr * cp * cy - cr * sp * sy,
            cr * sp * cy + sr * cp * sy,
            cr * cp * sy - sr * sp * cy,
        )
    }

    /// Retorna a norma (magnitude) do quaternion
    pub fn norm(&self) -> f64 {
        (self.w * self.w + self.x * self.x + self.y * self.y + self.z * self.z).sqrt()
    }

    /// Retorna a norma quadrada (evita sqrt para performance)
    pub fn norm_squared(&self) -> f64 {
        self.w * self.w + self.x * self.x + self.y * self.y + self.z * self.z
    }

    /// Normaliza o quaternion (retorna quaternion unitário)
    pub fn normalize(&self) -> Self {
        let n = self.norm();
        if n > 0.0 {
            Self::new(self.w / n, self.x / n, self.y / n, self.z / n)
        } else {
            Self::identity()
        }
    }

    /// Retorna o conjugado do quaternion: q* = w - xi - yj - zk
    pub fn conjugate(&self) -> Self {
        Self::new(self.w, -self.x, -self.y, -self.z)
    }

    /// Retorna o inverso do quaternion: q⁻¹ = q* / |q|²
    pub fn inverse(&self) -> Self {
        let norm_sq = self.norm_squared();
        if norm_sq > 0.0 {
            let conj = self.conjugate();
            Self::new(
                conj.w / norm_sq,
                conj.x / norm_sq,
                conj.y / norm_sq,
                conj.z / norm_sq,
            )
        } else {
            Self::identity()
        }
    }

    /// Multiplicação de quaternions (não comutativa!)
    /// q1 * q2
    pub fn multiply(&self, other: &Self) -> Self {
        Self::new(
            self.w * other.w - self.x * other.x - self.y * other.y - self.z * other.z,
            self.w * other.x + self.x * other.w + self.y * other.z - self.z * other.y,
            self.w * other.y - self.x * other.z + self.y * other.w + self.z * other.x,
            self.w * other.z + self.x * other.y - self.y * other.x + self.z * other.w,
        )
    }

    /// Rotaciona um vetor 3D usando este quaternion
    /// v' = q * v * q*
    pub fn rotate_vector(&self, v: [f64; 3]) -> [f64; 3] {
        // Converte vetor para quaternion puro (w=0)
        let v_quat = Self::new(0.0, v[0], v[1], v[2]);

        // Aplica rotação: q * v * q*
        let result = self.multiply(&v_quat).multiply(&self.conjugate());

        [result.x, result.y, result.z]
    }

    /// Interpolação esférica linear (SLERP) entre dois quaternions
    /// t ∈ [0, 1]
    pub fn slerp(&self, other: &Self, t: f64) -> Self {
        let mut dot = self.w * other.w + self.x * other.x + self.y * other.y + self.z * other.z;

        // Se o produto escalar é negativo, inverte um quaternion
        let other = if dot < 0.0 {
            dot = -dot;
            Self::new(-other.w, -other.x, -other.y, -other.z)
        } else {
            *other
        };

        const DOT_THRESHOLD: f64 = 0.9995;

        if dot > DOT_THRESHOLD {
            // Interpolação linear para quaternions muito próximos
            let result = Self::new(
                self.w + t * (other.w - self.w),
                self.x + t * (other.x - self.x),
                self.y + t * (other.y - self.y),
                self.z + t * (other.z - self.z),
            );
            result.normalize()
        } else {
            let theta_0 = dot.acos();
            let theta = theta_0 * t;
            let sin_theta = theta.sin();
            let sin_theta_0 = theta_0.sin();

            let s0 = (theta_0 - theta).cos() - dot * sin_theta / sin_theta_0;
            let s1 = sin_theta / sin_theta_0;

            Self::new(
                s0 * self.w + s1 * other.w,
                s0 * self.x + s1 * other.x,
                s0 * self.y + s1 * other.y,
                s0 * self.z + s1 * other.z,
            )
        }
    }

    /// Converte para matriz de rotação 3x3
    pub fn to_rotation_matrix(&self) -> [[f64; 3]; 3] {
        let w2 = self.w * self.w;
        let x2 = self.x * self.x;
        let y2 = self.y * self.y;
        let z2 = self.z * self.z;

        let wx = self.w * self.x;
        let wy = self.w * self.y;
        let wz = self.w * self.z;
        let xy = self.x * self.y;
        let xz = self.x * self.z;
        let yz = self.y * self.z;

        [
            [w2 + x2 - y2 - z2, 2.0 * (xy - wz), 2.0 * (xz + wy)],
            [2.0 * (xy + wz), w2 - x2 + y2 - z2, 2.0 * (yz - wx)],
            [2.0 * (xz - wy), 2.0 * (yz + wx), w2 - x2 - y2 + z2],
        ]
    }
}

// Implementa operador * para quaternions
impl std::ops::Mul for Quat3D {
    type Output = Self;

    fn mul(self, rhs: Self) -> Self::Output {
        self.multiply(&rhs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    #[test]
    fn test_identity() {
        let q = Quat3D::identity();
        assert_eq!(q.w, 1.0);
        assert_eq!(q.x, 0.0);
        assert_eq!(q.y, 0.0);
        assert_eq!(q.z, 0.0);
    }

    #[test]
    fn test_norm() {
        let q = Quat3D::new(1.0, 2.0, 3.0, 4.0);
        let norm = q.norm();
        assert!((norm - (1.0 + 4.0 + 9.0 + 16.0_f64).sqrt()).abs() < 1e-10);
    }

    #[test]
    fn test_normalize() {
        let q = Quat3D::new(1.0, 2.0, 3.0, 4.0).normalize();
        assert!((q.norm() - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_rotation_90_degrees_z_axis() {
        let axis = [0.0, 0.0, 1.0]; // eixo Z
        let angle = PI / 2.0; // 90 graus
        let q = Quat3D::from_axis_angle(axis, angle);

        let v = [1.0, 0.0, 0.0]; // vetor apontando em X
        let rotated = q.rotate_vector(v);

        // Após rotação de 90° em Z, X -> Y
        assert!((rotated[0] - 0.0).abs() < 1e-10);
        assert!((rotated[1] - 1.0).abs() < 1e-10);
        assert!((rotated[2] - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_conjugate_inverse() {
        let q = Quat3D::from_axis_angle([1.0, 0.0, 0.0], PI / 4.0);
        let q_normalized = q.normalize();

        // Para quaternions unitários, conjugado = inverso
        let conj = q_normalized.conjugate();
        let inv = q_normalized.inverse();

        assert!((conj.w - inv.w).abs() < 1e-10);
        assert!((conj.x - inv.x).abs() < 1e-10);
        assert!((conj.y - inv.y).abs() < 1e-10);
        assert!((conj.z - inv.z).abs() < 1e-10);
    }
}

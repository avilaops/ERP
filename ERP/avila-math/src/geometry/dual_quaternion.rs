use crate::geometry::quaternion3d::Quat3D;

/// Dual Quaternion (Quaternion Duplo) - Representa rotações e translações em 4D
/// Um dual quaternion é da forma: q̂ = q_real + ε * q_dual
/// onde ε² = 0 (número dual)
///
/// Pode ser usado para representar o grupo SO(4) como S³ × S³
/// que permite rotações left e right: q1 * v * q2
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DualQuat {
    pub real: Quat3D, // parte real (quaternion q_real)
    pub dual: Quat3D, // parte dual (quaternion q_dual)
}

impl DualQuat {
    /// Cria um novo dual quaternion
    pub fn new(real: Quat3D, dual: Quat3D) -> Self {
        Self { real, dual }
    }

    /// Cria um dual quaternion identidade
    pub fn identity() -> Self {
        Self::new(Quat3D::identity(), Quat3D::new(0.0, 0.0, 0.0, 0.0))
    }

    /// Cria um dual quaternion para rotação pura (sem translação)
    pub fn from_rotation(rotation: Quat3D) -> Self {
        Self::new(rotation, Quat3D::new(0.0, 0.0, 0.0, 0.0))
    }

    /// Cria um dual quaternion para translação pura (sem rotação)
    pub fn from_translation(translation: [f64; 3]) -> Self {
        let real = Quat3D::identity();
        let dual = Quat3D::new(
            0.0,
            translation[0] * 0.5,
            translation[1] * 0.5,
            translation[2] * 0.5,
        );
        Self::new(real, dual)
    }

    /// Cria um dual quaternion a partir de rotação e translação
    pub fn from_rotation_translation(rotation: Quat3D, translation: [f64; 3]) -> Self {
        let t_quat = Quat3D::new(0.0, translation[0], translation[1], translation[2]);
        let dual = rotation.multiply(&t_quat);
        let dual = Quat3D::new(dual.w * 0.5, dual.x * 0.5, dual.y * 0.5, dual.z * 0.5);

        Self::new(rotation, dual)
    }

    /// Retorna a norma do dual quaternion
    pub fn norm(&self) -> f64 {
        self.real.norm()
    }

    /// Normaliza o dual quaternion
    pub fn normalize(&self) -> Self {
        let real_norm = self.real.norm();
        if real_norm > 0.0 {
            let real_normalized = self.real.normalize();

            // dual normalizado: (dual - real * dot(real, dual) / |real|²) / |real|
            let dot = self.real.w * self.dual.w
                + self.real.x * self.dual.x
                + self.real.y * self.dual.y
                + self.real.z * self.dual.z;

            let dual_normalized = Quat3D::new(
                (self.dual.w - self.real.w * dot / (real_norm * real_norm)) / real_norm,
                (self.dual.x - self.real.x * dot / (real_norm * real_norm)) / real_norm,
                (self.dual.y - self.real.y * dot / (real_norm * real_norm)) / real_norm,
                (self.dual.z - self.real.z * dot / (real_norm * real_norm)) / real_norm,
            );

            Self::new(real_normalized, dual_normalized)
        } else {
            Self::identity()
        }
    }

    /// Retorna o conjugado do dual quaternion: q̂* = q_real* + ε * q_dual*
    pub fn conjugate(&self) -> Self {
        Self::new(self.real.conjugate(), self.dual.conjugate())
    }

    /// Multiplicação de dual quaternions
    /// (r1 + ε*d1) * (r2 + ε*d2) = (r1*r2) + ε*(r1*d2 + d1*r2)
    pub fn multiply(&self, other: &Self) -> Self {
        let real = self.real.multiply(&other.real);

        let dual_part1 = self.real.multiply(&other.dual);
        let dual_part2 = self.dual.multiply(&other.real);
        let dual = Quat3D::new(
            dual_part1.w + dual_part2.w,
            dual_part1.x + dual_part2.x,
            dual_part1.y + dual_part2.y,
            dual_part1.z + dual_part2.z,
        );

        Self::new(real, dual)
    }

    /// Extrai a rotação do dual quaternion
    pub fn get_rotation(&self) -> Quat3D {
        self.real.normalize()
    }

    /// Extrai a translação do dual quaternion
    pub fn get_translation(&self) -> [f64; 3] {
        // t = 2 * dual * real*
        let t_quat = self.dual.multiply(&self.real.conjugate());
        [t_quat.x * 2.0, t_quat.y * 2.0, t_quat.z * 2.0]
    }

    /// Transforma um ponto 3D usando este dual quaternion
    pub fn transform_point(&self, point: [f64; 3]) -> [f64; 3] {
        let rotation = self.get_rotation();
        let translation = self.get_translation();

        let rotated = rotation.rotate_vector(point);
        [
            rotated[0] + translation[0],
            rotated[1] + translation[1],
            rotated[2] + translation[2],
        ]
    }

    /// Interpolação linear dual quaternion (DLB - Dual quaternion Linear Blending)
    pub fn lerp(&self, other: &Self, t: f64) -> Self {
        // Verifica se precisamos inverter para escolher o caminho mais curto
        let dot = self.real.w * other.real.w
            + self.real.x * other.real.x
            + self.real.y * other.real.y
            + self.real.z * other.real.z;

        let sign = if dot < 0.0 { -1.0 } else { 1.0 };

        let real = Quat3D::new(
            self.real.w + t * (sign * other.real.w - self.real.w),
            self.real.x + t * (sign * other.real.x - self.real.x),
            self.real.y + t * (sign * other.real.y - self.real.y),
            self.real.z + t * (sign * other.real.z - self.real.z),
        );

        let dual = Quat3D::new(
            self.dual.w + t * (sign * other.dual.w - self.dual.w),
            self.dual.x + t * (sign * other.dual.x - self.dual.x),
            self.dual.y + t * (sign * other.dual.y - self.dual.y),
            self.dual.z + t * (sign * other.dual.z - self.dual.z),
        );

        Self::new(real, dual).normalize()
    }
}

// Implementa operador * para dual quaternions
impl std::ops::Mul for DualQuat {
    type Output = Self;

    fn mul(self, rhs: Self) -> Self::Output {
        self.multiply(&rhs)
    }
}

/// Representa rotações em 4D usando dois quaternions (S³ × S³)
/// Isomórfico ao grupo SO(4)
/// Permite rotações "left" e "right" independentes
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SO4Rotation {
    pub left: Quat3D,  // quaternion left (q1)
    pub right: Quat3D, // quaternion right (q2)
}

impl SO4Rotation {
    /// Cria uma nova rotação SO(4)
    pub fn new(left: Quat3D, right: Quat3D) -> Self {
        Self {
            left: left.normalize(),
            right: right.normalize(),
        }
    }

    /// Cria uma rotação SO(4) identidade
    pub fn identity() -> Self {
        Self::new(Quat3D::identity(), Quat3D::identity())
    }

    /// Cria rotação SO(4) apenas com componente left
    pub fn from_left(left: Quat3D) -> Self {
        Self::new(left, Quat3D::identity())
    }

    /// Cria rotação SO(4) apenas com componente right
    pub fn from_right(right: Quat3D) -> Self {
        Self::new(Quat3D::identity(), right)
    }

    /// Aplica a rotação SO(4) a um vetor 4D
    /// Usa a representação: q1 * v * q2*
    /// onde v é tratado como quaternion puro
    pub fn rotate_vector_4d(&self, v: [f64; 4]) -> [f64; 4] {
        // Converte vetor 4D para quaternion
        let v_quat = Quat3D::new(v[0], v[1], v[2], v[3]);

        // Aplica: q1 * v * q2*
        let result = self
            .left
            .multiply(&v_quat)
            .multiply(&self.right.conjugate());

        [result.w, result.x, result.y, result.z]
    }

    /// Composição de rotações SO(4)
    /// (q1_a, q2_a) ∘ (q1_b, q2_b) = (q1_a * q1_b, q2_a * q2_b)
    pub fn compose(&self, other: &Self) -> Self {
        Self::new(
            self.left.multiply(&other.left),
            self.right.multiply(&other.right),
        )
    }

    /// Inverso da rotação SO(4)
    pub fn inverse(&self) -> Self {
        Self::new(self.left.inverse(), self.right.inverse())
    }

    /// Converte para matriz de rotação 4x4
    pub fn to_rotation_matrix_4x4(&self) -> [[f64; 4]; 4] {
        let l = &self.left;
        let r = &self.right;

        // Elementos da matriz usando a fórmula de SO(4)
        [
            [
                l.w * r.w - l.x * r.x - l.y * r.y - l.z * r.z,
                l.w * r.x + l.x * r.w + l.y * r.z - l.z * r.y,
                l.w * r.y - l.x * r.z + l.y * r.w + l.z * r.x,
                l.w * r.z + l.x * r.y - l.y * r.x + l.z * r.w,
            ],
            [
                l.x * r.w + l.w * r.x - l.z * r.y + l.y * r.z,
                l.x * r.x + l.w * r.w - l.y * r.y - l.z * r.z,
                l.x * r.y + l.y * r.x + l.w * r.z + l.z * r.w,
                l.x * r.z - l.y * r.w + l.z * r.x + l.w * r.y,
            ],
            [
                l.y * r.w + l.z * r.x + l.w * r.y - l.x * r.z,
                l.y * r.x - l.z * r.w + l.x * r.y + l.w * r.z,
                l.y * r.y + l.w * r.w - l.x * r.x - l.z * r.z,
                l.y * r.z + l.x * r.w + l.w * r.x - l.z * r.y,
            ],
            [
                l.z * r.w - l.y * r.x + l.x * r.y + l.w * r.z,
                l.z * r.x + l.y * r.w + l.w * r.y - l.x * r.z,
                l.z * r.y - l.x * r.w + l.w * r.x + l.y * r.z,
                l.z * r.z + l.w * r.w - l.x * r.x - l.y * r.y,
            ],
        ]
    }

    /// Decomposição isoclínica: separa rotações simples e duplas
    /// SO(4) = SO(3) × SO(3) / {±I}
    pub fn decompose_isoclinic(&self) -> (Quat3D, Quat3D) {
        (self.left, self.right)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    #[test]
    fn test_dual_quat_identity() {
        let dq = DualQuat::identity();
        let point = [1.0, 2.0, 3.0];
        let transformed = dq.transform_point(point);

        assert!((transformed[0] - point[0]).abs() < 1e-10);
        assert!((transformed[1] - point[1]).abs() < 1e-10);
        assert!((transformed[2] - point[2]).abs() < 1e-10);
    }

    #[test]
    fn test_so4_identity() {
        let so4 = SO4Rotation::identity();
        let v = [1.0, 0.0, 0.0, 0.0];
        let rotated = so4.rotate_vector_4d(v);

        assert!((rotated[0] - v[0]).abs() < 1e-10);
        assert!((rotated[1] - v[1]).abs() < 1e-10);
        assert!((rotated[2] - v[2]).abs() < 1e-10);
        assert!((rotated[3] - v[3]).abs() < 1e-10);
    }

    #[test]
    fn test_so4_left_right_rotation() {
        let q1 = Quat3D::from_axis_angle([1.0, 0.0, 0.0], PI / 4.0);
        let q2 = Quat3D::from_axis_angle([0.0, 1.0, 0.0], PI / 6.0);

        let so4 = SO4Rotation::new(q1, q2);
        let v = [1.0, 0.0, 0.0, 0.0];
        let rotated = so4.rotate_vector_4d(v);

        // Verifica que a norma é preservada
        let norm_original = v[0] * v[0] + v[1] * v[1] + v[2] * v[2] + v[3] * v[3];
        let norm_rotated = rotated[0] * rotated[0]
            + rotated[1] * rotated[1]
            + rotated[2] * rotated[2]
            + rotated[3] * rotated[3];

        assert!((norm_original - norm_rotated).abs() < 1e-10);
    }

    #[test]
    fn test_dual_quat_translation() {
        let translation = [1.0, 2.0, 3.0];
        let dq = DualQuat::from_translation(translation);
        let point = [0.0, 0.0, 0.0];
        let transformed = dq.transform_point(point);

        assert!((transformed[0] - translation[0]).abs() < 1e-10);
        assert!((transformed[1] - translation[1]).abs() < 1e-10);
        assert!((transformed[2] - translation[2]).abs() < 1e-10);
    }

    #[test]
    fn test_so4_composition() {
        let so4_a = SO4Rotation::from_left(Quat3D::from_axis_angle([1.0, 0.0, 0.0], PI / 4.0));
        let so4_b = SO4Rotation::from_right(Quat3D::from_axis_angle([0.0, 1.0, 0.0], PI / 6.0));

        let composed = so4_a.compose(&so4_b);
        let v = [1.0, 0.0, 0.0, 0.0];

        // Aplica composição
        let result1 = composed.rotate_vector_4d(v);

        // Aplica sequencialmente
        let temp = so4_b.rotate_vector_4d(v);
        let result2 = so4_a.rotate_vector_4d(temp);

        assert!((result1[0] - result2[0]).abs() < 1e-10);
        assert!((result1[1] - result2[1]).abs() < 1e-10);
        assert!((result1[2] - result2[2]).abs() < 1e-10);
        assert!((result1[3] - result2[3]).abs() < 1e-10);
    }
}

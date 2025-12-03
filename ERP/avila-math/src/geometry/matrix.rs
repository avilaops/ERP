/// 4x4 Matrix for 3D transformations
///
/// Column-major matrix representation for compatibility with OpenGL/Vulkan
use super::vector::{Vector3, Vector4};
use std::ops::Mul;

/// 4x4 Matrix (column-major)
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Matrix4 {
    /// Column-major data: columns[col][row]
    pub data: [[f64; 4]; 4],
}

impl Matrix4 {
    /// Create identity matrix
    #[inline]
    pub fn identity() -> Self {
        Self {
            data: [
                [1.0, 0.0, 0.0, 0.0],
                [0.0, 1.0, 0.0, 0.0],
                [0.0, 0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0, 1.0],
            ],
        }
    }

    /// Create zero matrix
    #[inline]
    pub fn zero() -> Self {
        Self {
            data: [[0.0; 4]; 4],
        }
    }

    /// Create translation matrix
    #[inline]
    pub fn translate(translation: Vector3) -> Self {
        let mut m = Self::identity();
        m.data[3][0] = translation.x;
        m.data[3][1] = translation.y;
        m.data[3][2] = translation.z;
        m
    }

    /// Create uniform scale matrix
    #[inline]
    pub fn scale_uniform(scale: f64) -> Self {
        Self::scale(Vector3::new(scale, scale, scale))
    }

    /// Create non-uniform scale matrix
    #[inline]
    pub fn scale(scale: Vector3) -> Self {
        let mut m = Self::identity();
        m.data[0][0] = scale.x;
        m.data[1][1] = scale.y;
        m.data[2][2] = scale.z;
        m
    }

    /// Create rotation matrix around X axis
    pub fn rotate_x(angle_rad: f64) -> Self {
        let c = angle_rad.cos();
        let s = angle_rad.sin();
        let mut m = Self::identity();
        m.data[1][1] = c;
        m.data[1][2] = s;
        m.data[2][1] = -s;
        m.data[2][2] = c;
        m
    }

    /// Create rotation matrix around Y axis
    pub fn rotate_y(angle_rad: f64) -> Self {
        let c = angle_rad.cos();
        let s = angle_rad.sin();
        let mut m = Self::identity();
        m.data[0][0] = c;
        m.data[0][2] = -s;
        m.data[2][0] = s;
        m.data[2][2] = c;
        m
    }

    /// Create rotation matrix around Z axis
    pub fn rotate_z(angle_rad: f64) -> Self {
        let c = angle_rad.cos();
        let s = angle_rad.sin();
        let mut m = Self::identity();
        m.data[0][0] = c;
        m.data[0][1] = s;
        m.data[1][0] = -s;
        m.data[1][1] = c;
        m
    }

    /// Create look-at view matrix
    pub fn look_at(eye: Vector3, target: Vector3, up: Vector3) -> Self {
        let f = (target - eye).normalize();
        let r = f.cross(up).normalize();
        let u = r.cross(f);

        let mut m = Self::identity();
        m.data[0][0] = r.x;
        m.data[1][0] = r.y;
        m.data[2][0] = r.z;
        m.data[0][1] = u.x;
        m.data[1][1] = u.y;
        m.data[2][1] = u.z;
        m.data[0][2] = -f.x;
        m.data[1][2] = -f.y;
        m.data[2][2] = -f.z;
        m.data[3][0] = -r.dot(eye);
        m.data[3][1] = -u.dot(eye);
        m.data[3][2] = f.dot(eye);
        m
    }

    /// Create perspective projection matrix
    pub fn perspective(fov_y_rad: f64, aspect: f64, near: f64, far: f64) -> Self {
        let tan_half_fovy = (fov_y_rad / 2.0).tan();
        let mut m = Self::zero();
        m.data[0][0] = 1.0 / (aspect * tan_half_fovy);
        m.data[1][1] = 1.0 / tan_half_fovy;
        m.data[2][2] = -(far + near) / (far - near);
        m.data[2][3] = -1.0;
        m.data[3][2] = -(2.0 * far * near) / (far - near);
        m
    }

    /// Create orthographic projection matrix
    pub fn orthographic(left: f64, right: f64, bottom: f64, top: f64, near: f64, far: f64) -> Self {
        let mut m = Self::identity();
        m.data[0][0] = 2.0 / (right - left);
        m.data[1][1] = 2.0 / (top - bottom);
        m.data[2][2] = -2.0 / (far - near);
        m.data[3][0] = -(right + left) / (right - left);
        m.data[3][1] = -(top + bottom) / (top - bottom);
        m.data[3][2] = -(far + near) / (far - near);
        m
    }

    /// Transform a point (w=1)
    pub fn transform_point(&self, point: Vector3) -> Vector3 {
        let v = Vector4::new(point.x, point.y, point.z, 1.0);
        let transformed = self.transform_vector4(v);

        // Perspective division
        if transformed.w != 0.0 {
            Vector3::new(
                transformed.x / transformed.w,
                transformed.y / transformed.w,
                transformed.z / transformed.w,
            )
        } else {
            transformed.to_vector3()
        }
    }

    /// Transform a direction (w=0)
    pub fn transform_direction(&self, dir: Vector3) -> Vector3 {
        let v = Vector4::new(dir.x, dir.y, dir.z, 0.0);
        self.transform_vector4(v).to_vector3()
    }

    /// Transform a Vector4
    pub fn transform_vector4(&self, v: Vector4) -> Vector4 {
        Vector4::new(
            self.data[0][0] * v.x
                + self.data[1][0] * v.y
                + self.data[2][0] * v.z
                + self.data[3][0] * v.w,
            self.data[0][1] * v.x
                + self.data[1][1] * v.y
                + self.data[2][1] * v.z
                + self.data[3][1] * v.w,
            self.data[0][2] * v.x
                + self.data[1][2] * v.y
                + self.data[2][2] * v.z
                + self.data[3][2] * v.w,
            self.data[0][3] * v.x
                + self.data[1][3] * v.y
                + self.data[2][3] * v.z
                + self.data[3][3] * v.w,
        )
    }

    /// Transpose matrix
    pub fn transpose(&self) -> Self {
        let mut result = Self::zero();
        for i in 0..4 {
            for j in 0..4 {
                result.data[i][j] = self.data[j][i];
            }
        }
        result
    }

    /// Determinant of matrix
    pub fn determinant(&self) -> f64 {
        let m = &self.data;

        let a = m[0][0]
            * (m[1][1] * (m[2][2] * m[3][3] - m[2][3] * m[3][2])
                - m[1][2] * (m[2][1] * m[3][3] - m[2][3] * m[3][1])
                + m[1][3] * (m[2][1] * m[3][2] - m[2][2] * m[3][1]));

        let b = m[0][1]
            * (m[1][0] * (m[2][2] * m[3][3] - m[2][3] * m[3][2])
                - m[1][2] * (m[2][0] * m[3][3] - m[2][3] * m[3][0])
                + m[1][3] * (m[2][0] * m[3][2] - m[2][2] * m[3][0]));

        let c = m[0][2]
            * (m[1][0] * (m[2][1] * m[3][3] - m[2][3] * m[3][1])
                - m[1][1] * (m[2][0] * m[3][3] - m[2][3] * m[3][0])
                + m[1][3] * (m[2][0] * m[3][1] - m[2][1] * m[3][0]));

        let d = m[0][3]
            * (m[1][0] * (m[2][1] * m[3][2] - m[2][2] * m[3][1])
                - m[1][1] * (m[2][0] * m[3][2] - m[2][2] * m[3][0])
                + m[1][2] * (m[2][0] * m[3][1] - m[2][1] * m[3][0]));

        a - b + c - d
    }
}

/// Matrix multiplication
impl Mul for Matrix4 {
    type Output = Self;

    fn mul(self, rhs: Self) -> Self {
        let mut result = Self::zero();
        for i in 0..4 {
            for j in 0..4 {
                for k in 0..4 {
                    result.data[i][j] += self.data[k][j] * rhs.data[i][k];
                }
            }
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identity() {
        let m = Matrix4::identity();
        let v = Vector3::new(1.0, 2.0, 3.0);
        let transformed = m.transform_point(v);
        assert!((transformed.x - v.x).abs() < 1e-10);
        assert!((transformed.y - v.y).abs() < 1e-10);
        assert!((transformed.z - v.z).abs() < 1e-10);
    }

    #[test]
    fn test_translation() {
        let m = Matrix4::translate(Vector3::new(10.0, 5.0, -3.0));
        let v = Vector3::new(1.0, 2.0, 3.0);
        let transformed = m.transform_point(v);
        assert!((transformed.x - 11.0).abs() < 1e-10);
        assert!((transformed.y - 7.0).abs() < 1e-10);
        assert!((transformed.z - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_scale() {
        let m = Matrix4::scale_uniform(2.0);
        let v = Vector3::new(1.0, 2.0, 3.0);
        let transformed = m.transform_point(v);
        assert!((transformed.x - 2.0).abs() < 1e-10);
        assert!((transformed.y - 4.0).abs() < 1e-10);
        assert!((transformed.z - 6.0).abs() < 1e-10);
    }

    #[test]
    fn test_matrix_multiplication() {
        let t = Matrix4::translate(Vector3::new(1.0, 0.0, 0.0));
        let s = Matrix4::scale_uniform(2.0);
        let combined = t * s;

        let v = Vector3::new(1.0, 1.0, 1.0);
        let result = combined.transform_point(v);
        assert!((result.x - 3.0).abs() < 1e-10);
        assert!((result.y - 2.0).abs() < 1e-10);
    }
}

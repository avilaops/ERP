//! Scientific types for physics and astrophysics

use std::ops::{Add, Mul, Sub};

/// Quaternion for 4D rotations
///
/// Used in physics simulations, spacecraft orientation, and 3D graphics.
/// Components: w (scalar), x, y, z (vector)
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Quaternion {
    /// Scalar component (real part)
    pub w: f64,
    /// X component (i)
    pub x: f64,
    /// Y component (j)
    pub y: f64,
    /// Z component (k)
    pub z: f64,
}

impl Quaternion {
    /// Create a new quaternion
    pub fn new(w: f64, x: f64, y: f64, z: f64) -> Self {
        Self { w, x, y, z }
    }

    /// Create identity quaternion (no rotation)
    pub fn identity() -> Self {
        Self::new(1.0, 0.0, 0.0, 0.0)
    }

    /// Create quaternion from axis and angle
    pub fn from_axis_angle(axis: [f64; 3], angle: f64) -> Self {
        let half_angle = angle / 2.0;
        let sin_half = half_angle.sin();
        let cos_half = half_angle.cos();

        // Normalize axis
        let len = (axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]).sqrt();
        let norm_axis = [axis[0] / len, axis[1] / len, axis[2] / len];

        Self {
            w: cos_half,
            x: norm_axis[0] * sin_half,
            y: norm_axis[1] * sin_half,
            z: norm_axis[2] * sin_half,
        }
    }

    /// Get the magnitude (norm) of the quaternion
    pub fn magnitude(&self) -> f64 {
        (self.w * self.w + self.x * self.x + self.y * self.y + self.z * self.z).sqrt()
    }

    /// Normalize the quaternion (magnitude = 1)
    pub fn normalize(&self) -> Self {
        let mag = self.magnitude();
        if mag > 0.0 {
            Self {
                w: self.w / mag,
                x: self.x / mag,
                y: self.y / mag,
                z: self.z / mag,
            }
        } else {
            Self::identity()
        }
    }

    /// Get the conjugate (inverse rotation)
    pub fn conjugate(&self) -> Self {
        Self {
            w: self.w,
            x: -self.x,
            y: -self.y,
            z: -self.z,
        }
    }

    /// Get the inverse
    pub fn inverse(&self) -> Self {
        let mag_sq = self.w * self.w + self.x * self.x + self.y * self.y + self.z * self.z;
        if mag_sq > 0.0 {
            let conj = self.conjugate();
            Self {
                w: conj.w / mag_sq,
                x: conj.x / mag_sq,
                y: conj.y / mag_sq,
                z: conj.z / mag_sq,
            }
        } else {
            Self::identity()
        }
    }

    /// Rotate a 3D vector by this quaternion
    pub fn rotate_vector(&self, v: [f64; 3]) -> [f64; 3] {
        let q = self.normalize();
        let v_quat = Quaternion::new(0.0, v[0], v[1], v[2]);
        let result = q * v_quat * q.conjugate();
        [result.x, result.y, result.z]
    }
}

impl Mul for Quaternion {
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

impl Add for Quaternion {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        Self {
            w: self.w + other.w,
            x: self.x + other.x,
            y: self.y + other.y,
            z: self.z + other.z,
        }
    }
}

impl Sub for Quaternion {
    type Output = Self;

    fn sub(self, other: Self) -> Self {
        Self {
            w: self.w - other.w,
            x: self.x - other.x,
            y: self.y - other.y,
            z: self.z - other.z,
        }
    }
}

/// Complex number (for FFT, quantum mechanics)
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Complex64 {
    /// Real part
    pub re: f64,
    /// Imaginary part
    pub im: f64,
}

impl Complex64 {
    /// Create a new complex number
    pub fn new(re: f64, im: f64) -> Self {
        Self { re, im }
    }

    /// Create from polar coordinates (magnitude, phase)
    pub fn from_polar(r: f64, theta: f64) -> Self {
        Self {
            re: r * theta.cos(),
            im: r * theta.sin(),
        }
    }

    /// Get magnitude
    pub fn magnitude(&self) -> f64 {
        (self.re * self.re + self.im * self.im).sqrt()
    }

    /// Get phase (angle)
    pub fn phase(&self) -> f64 {
        self.im.atan2(self.re)
    }

    /// Get complex conjugate
    pub fn conjugate(&self) -> Self {
        Self {
            re: self.re,
            im: -self.im,
        }
    }
}

impl Mul for Complex64 {
    type Output = Self;

    fn mul(self, other: Self) -> Self {
        Self {
            re: self.re * other.re - self.im * other.im,
            im: self.re * other.im + self.im * other.re,
        }
    }
}

impl Add for Complex64 {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        Self {
            re: self.re + other.re,
            im: self.im + other.im,
        }
    }
}

/// Tensor4D for General Relativity (4x4 spacetime tensor)
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Tensor4D {
    /// 4x4 matrix components [row][col]
    pub components: [[f64; 4]; 4],
}

impl Tensor4D {
    /// Create a new tensor with all zeros
    pub fn zeros() -> Self {
        Self {
            components: [[0.0; 4]; 4],
        }
    }

    /// Create identity tensor
    pub fn identity() -> Self {
        let mut tensor = Self::zeros();
        for i in 0..4 {
            tensor.components[i][i] = 1.0;
        }
        tensor
    }

    /// Create Minkowski metric (flat spacetime)
    pub fn minkowski() -> Self {
        let mut tensor = Self::zeros();
        tensor.components[0][0] = -1.0; // Time component (signature -+++)
        tensor.components[1][1] = 1.0;
        tensor.components[2][2] = 1.0;
        tensor.components[3][3] = 1.0;
        tensor
    }

    /// Create Schwarzschild metric (black hole)
    pub fn schwarzschild_metric(mass: f64, r: f64) -> Self {
        let rs = 2.0 * mass; // Schwarzschild radius (G=c=1)
        let mut tensor = Self::zeros();

        if r > rs {
            tensor.components[0][0] = -(1.0 - rs / r); // g_tt
            tensor.components[1][1] = 1.0 / (1.0 - rs / r); // g_rr
            tensor.components[2][2] = r * r; // g_θθ
            tensor.components[3][3] = r * r * r.sin().powi(2); // g_φφ (assuming θ=π/2)
        }

        tensor
    }

    /// Get component at (row, col)
    pub fn get(&self, row: usize, col: usize) -> f64 {
        self.components[row][col]
    }

    /// Set component at (row, col)
    pub fn set(&mut self, row: usize, col: usize, value: f64) {
        self.components[row][col] = value;
    }

    /// Calculate determinant (for volume elements)
    pub fn determinant(&self) -> f64 {
        // Simplified 4x4 determinant calculation
        // Full implementation would use cofactor expansion
        let m = &self.components;

        // Using first row expansion
        let mut det = 0.0;
        for j in 0..4 {
            let sign = if j % 2 == 0 { 1.0 } else { -1.0 };
            det += sign * m[0][j] * self.minor_3x3(0, j);
        }
        det
    }

    fn minor_3x3(&self, skip_row: usize, skip_col: usize) -> f64 {
        let mut m3x3 = [[0.0; 3]; 3];
        let mut i3 = 0;
        for i in 0..4 {
            if i == skip_row {
                continue;
            }
            let mut j3 = 0;
            for j in 0..4 {
                if j == skip_col {
                    continue;
                }
                m3x3[i3][j3] = self.components[i][j];
                j3 += 1;
            }
            i3 += 1;
        }

        // 3x3 determinant
        m3x3[0][0] * (m3x3[1][1] * m3x3[2][2] - m3x3[1][2] * m3x3[2][1])
            - m3x3[0][1] * (m3x3[1][0] * m3x3[2][2] - m3x3[1][2] * m3x3[2][0])
            + m3x3[0][2] * (m3x3[1][0] * m3x3[2][1] - m3x3[1][1] * m3x3[2][0])
    }
}

/// Spinor for particle physics (Dirac spinor)
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Spinor {
    /// Upper component (spin up)
    pub up: Complex64,
    /// Lower component (spin down)
    pub down: Complex64,
}

impl Spinor {
    /// Create a new spinor
    pub fn new(up: Complex64, down: Complex64) -> Self {
        Self { up, down }
    }

    /// Create spin-up state
    pub fn spin_up() -> Self {
        Self {
            up: Complex64::new(1.0, 0.0),
            down: Complex64::new(0.0, 0.0),
        }
    }

    /// Create spin-down state
    pub fn spin_down() -> Self {
        Self {
            up: Complex64::new(0.0, 0.0),
            down: Complex64::new(1.0, 0.0),
        }
    }

    /// Get norm (probability amplitude)
    pub fn norm(&self) -> f64 {
        (self.up.magnitude().powi(2) + self.down.magnitude().powi(2)).sqrt()
    }

    /// Normalize spinor
    pub fn normalize(&self) -> Self {
        let n = self.norm();
        if n > 0.0 {
            Self {
                up: Complex64::new(self.up.re / n, self.up.im / n),
                down: Complex64::new(self.down.re / n, self.down.im / n),
            }
        } else {
            Self::spin_up()
        }
    }
}

// ==================== SCIENTIFIC ARRAYS ====================

/// Quaternion array for columnar storage
#[derive(Debug, Clone)]
pub struct QuaternionArray {
    data: Vec<Quaternion>,
}

impl QuaternionArray {
    /// Create new QuaternionArray
    pub fn new(data: Vec<Quaternion>) -> Self {
        Self { data }
    }

    /// Create from iterator
    pub fn from_iter<I: IntoIterator<Item = Quaternion>>(iter: I) -> Self {
        Self {
            data: iter.into_iter().collect(),
        }
    }

    /// Get value at index
    pub fn value(&self, index: usize) -> Option<Quaternion> {
        self.data.get(index).copied()
    }

    /// Get all values
    pub fn values(&self) -> &[Quaternion] {
        &self.data
    }

    /// Get length
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    /// Element-wise multiplication
    pub fn multiply(&self, other: &Self) -> Option<Self> {
        if self.len() != other.len() {
            return None;
        }

        let result: Vec<Quaternion> = self
            .data
            .iter()
            .zip(other.data.iter())
            .map(|(a, b)| *a * *b)
            .collect();

        Some(Self::new(result))
    }

    /// Normalize all quaternions
    pub fn normalize(&self) -> Self {
        let result: Vec<Quaternion> = self.data.iter().map(|q| q.normalize()).collect();
        Self::new(result)
    }

    /// Conjugate all quaternions
    pub fn conjugate(&self) -> Self {
        let result: Vec<Quaternion> = self.data.iter().map(|q| q.conjugate()).collect();
        Self::new(result)
    }

    /// SLERP (Spherical Linear Interpolation) between two quaternion arrays
    pub fn slerp(&self, other: &Self, t: f64) -> Option<Self> {
        if self.len() != other.len() {
            return None;
        }

        let result: Vec<Quaternion> = self
            .data
            .iter()
            .zip(other.data.iter())
            .map(|(a, b)| {
                // Simple SLERP implementation
                let dot = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
                let theta = dot.acos();
                let sin_theta = theta.sin();

                if sin_theta.abs() < 1e-10 {
                    *a // Quaternions are very close
                } else {
                    let w1 = ((1.0 - t) * theta).sin() / sin_theta;
                    let w2 = (t * theta).sin() / sin_theta;

                    Quaternion::new(
                        a.w * w1 + b.w * w2,
                        a.x * w1 + b.x * w2,
                        a.y * w1 + b.y * w2,
                        a.z * w1 + b.z * w2,
                    )
                }
            })
            .collect();

        Some(Self::new(result))
    }
}

/// Complex number array for columnar storage
#[derive(Debug, Clone)]
pub struct ComplexArray {
    data: Vec<Complex64>,
}

impl ComplexArray {
    /// Create new ComplexArray
    pub fn new(data: Vec<Complex64>) -> Self {
        Self { data }
    }

    /// Create from iterator
    pub fn from_iter<I: IntoIterator<Item = Complex64>>(iter: I) -> Self {
        Self {
            data: iter.into_iter().collect(),
        }
    }

    /// Get value at index
    pub fn value(&self, index: usize) -> Option<Complex64> {
        self.data.get(index).copied()
    }

    /// Get all values
    pub fn values(&self) -> &[Complex64] {
        &self.data
    }

    /// Get length
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    /// Element-wise multiplication
    pub fn multiply(&self, other: &Self) -> Option<Self> {
        if self.len() != other.len() {
            return None;
        }

        let result: Vec<Complex64> = self
            .data
            .iter()
            .zip(other.data.iter())
            .map(|(a, b)| *a * *b)
            .collect();

        Some(Self::new(result))
    }

    /// Element-wise addition
    pub fn add(&self, other: &Self) -> Option<Self> {
        if self.len() != other.len() {
            return None;
        }

        let result: Vec<Complex64> = self
            .data
            .iter()
            .zip(other.data.iter())
            .map(|(a, b)| *a + *b)
            .collect();

        Some(Self::new(result))
    }

    /// Get magnitude of all elements
    pub fn magnitude(&self) -> Vec<f64> {
        self.data.iter().map(|c| c.magnitude()).collect()
    }

    /// Get phase of all elements
    pub fn phase(&self) -> Vec<f64> {
        self.data.iter().map(|c| c.phase()).collect()
    }

    /// Conjugate all elements
    pub fn conjugate(&self) -> Self {
        let result: Vec<Complex64> = self.data.iter().map(|c| c.conjugate()).collect();
        Self::new(result)
    }
}

/// Tensor4D array for columnar storage
#[derive(Debug, Clone)]
pub struct Tensor4DArray {
    data: Vec<Tensor4D>,
}

impl Tensor4DArray {
    /// Create new Tensor4DArray
    pub fn new(data: Vec<Tensor4D>) -> Self {
        Self { data }
    }

    /// Create from iterator
    pub fn from_iter<I: IntoIterator<Item = Tensor4D>>(iter: I) -> Self {
        Self {
            data: iter.into_iter().collect(),
        }
    }

    /// Get value at index
    pub fn value(&self, index: usize) -> Option<Tensor4D> {
        self.data.get(index).copied()
    }

    /// Get all values
    pub fn values(&self) -> &[Tensor4D] {
        &self.data
    }

    /// Get length
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }
}

/// Spinor array for columnar storage
#[derive(Debug, Clone)]
pub struct SpinorArray {
    data: Vec<Spinor>,
}

impl SpinorArray {
    /// Create new SpinorArray
    pub fn new(data: Vec<Spinor>) -> Self {
        Self { data }
    }

    /// Create from iterator
    pub fn from_iter<I: IntoIterator<Item = Spinor>>(iter: I) -> Self {
        Self {
            data: iter.into_iter().collect(),
        }
    }

    /// Get value at index
    pub fn value(&self, index: usize) -> Option<Spinor> {
        self.data.get(index).copied()
    }

    /// Get all values
    pub fn values(&self) -> &[Spinor] {
        &self.data
    }

    /// Get length
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    /// Normalize all spinors
    pub fn normalize(&self) -> Self {
        let result: Vec<Spinor> = self.data.iter().map(|s| s.normalize()).collect();
        Self::new(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quaternion_identity() {
        let q = Quaternion::identity();
        assert_eq!(q.w, 1.0);
        assert_eq!(q.x, 0.0);
        assert_eq!(q.magnitude(), 1.0);
    }

    #[test]
    fn test_quaternion_multiplication() {
        let q1 = Quaternion::new(1.0, 0.0, 0.0, 0.0);
        let q2 = Quaternion::new(0.0, 1.0, 0.0, 0.0);
        let result = q1 * q2;
        assert_eq!(result.x, 1.0);
    }

    #[test]
    fn test_quaternion_normalize() {
        let q = Quaternion::new(2.0, 0.0, 0.0, 0.0);
        let normalized = q.normalize();
        assert!((normalized.magnitude() - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_complex_magnitude() {
        let c = Complex64::new(3.0, 4.0);
        assert_eq!(c.magnitude(), 5.0);
    }

    #[test]
    fn test_complex_multiplication() {
        let c1 = Complex64::new(1.0, 2.0);
        let c2 = Complex64::new(3.0, 4.0);
        let result = c1 * c2;
        assert_eq!(result.re, -5.0);
        assert_eq!(result.im, 10.0);
    }

    #[test]
    fn test_tensor4d_minkowski() {
        let metric = Tensor4D::minkowski();
        assert_eq!(metric.get(0, 0), -1.0);
        assert_eq!(metric.get(1, 1), 1.0);
        assert_eq!(metric.get(2, 2), 1.0);
        assert_eq!(metric.get(3, 3), 1.0);
    }

    #[test]
    fn test_tensor4d_schwarzschild() {
        let metric = Tensor4D::schwarzschild_metric(1.0, 10.0);
        assert!(metric.get(0, 0) < 0.0); // Time component negative
        assert!(metric.get(1, 1) > 0.0); // Spatial component positive
    }

    #[test]
    fn test_spinor_creation() {
        let spinor = Spinor::spin_up();
        assert_eq!(spinor.up.re, 1.0);
        assert_eq!(spinor.down.re, 0.0);
        assert!((spinor.norm() - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_spinor_normalize() {
        let spinor = Spinor::new(
            Complex64::new(2.0, 0.0),
            Complex64::new(2.0, 0.0),
        );
        let normalized = spinor.normalize();
        assert!((normalized.norm() - 1.0).abs() < 1e-10);
    }

    // ==================== ARRAY TESTS ====================

    #[test]
    fn test_quaternion_array_creation() {
        let q1 = Quaternion::identity();
        let q2 = Quaternion::new(0.707, 0.707, 0.0, 0.0);
        let array = QuaternionArray::new(vec![q1, q2]);

        assert_eq!(array.len(), 2);
        assert_eq!(array.value(0), Some(q1));
        assert_eq!(array.value(1), Some(q2));
    }

    #[test]
    fn test_quaternion_array_multiply() {
        let q1 = Quaternion::identity();
        let q2 = Quaternion::new(0.0, 1.0, 0.0, 0.0);
        let array1 = QuaternionArray::new(vec![q1, q1]);
        let array2 = QuaternionArray::new(vec![q2, q2]);

        let result = array1.multiply(&array2).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result.value(0).unwrap().x, 1.0);
    }

    #[test]
    fn test_quaternion_array_normalize() {
        let q1 = Quaternion::new(2.0, 0.0, 0.0, 0.0);
        let q2 = Quaternion::new(0.0, 3.0, 0.0, 0.0);
        let array = QuaternionArray::new(vec![q1, q2]);

        let normalized = array.normalize();
        assert!((normalized.value(0).unwrap().magnitude() - 1.0).abs() < 1e-10);
        assert!((normalized.value(1).unwrap().magnitude() - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_quaternion_array_slerp() {
        let q1 = Quaternion::identity();
        let q2 = Quaternion::from_axis_angle([0.0, 0.0, 1.0], std::f64::consts::PI);
        let array1 = QuaternionArray::new(vec![q1, q1]);
        let array2 = QuaternionArray::new(vec![q2, q2]);

        let result = array1.slerp(&array2, 0.5).unwrap();
        assert_eq!(result.len(), 2);
        assert!((result.value(0).unwrap().magnitude() - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_complex_array_creation() {
        let c1 = Complex64::new(1.0, 2.0);
        let c2 = Complex64::new(3.0, 4.0);
        let array = ComplexArray::new(vec![c1, c2]);

        assert_eq!(array.len(), 2);
        assert_eq!(array.value(0), Some(c1));
        assert_eq!(array.value(1), Some(c2));
    }

    #[test]
    fn test_complex_array_multiply() {
        let c1 = Complex64::new(1.0, 2.0);
        let c2 = Complex64::new(3.0, 4.0);
        let array1 = ComplexArray::new(vec![c1, c1]);
        let array2 = ComplexArray::new(vec![c2, c2]);

        let result = array1.multiply(&array2).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result.value(0).unwrap().re, -5.0);
        assert_eq!(result.value(0).unwrap().im, 10.0);
    }

    #[test]
    fn test_complex_array_add() {
        let c1 = Complex64::new(1.0, 2.0);
        let c2 = Complex64::new(3.0, 4.0);
        let array1 = ComplexArray::new(vec![c1, c1]);
        let array2 = ComplexArray::new(vec![c2, c2]);

        let result = array1.add(&array2).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result.value(0).unwrap().re, 4.0);
        assert_eq!(result.value(0).unwrap().im, 6.0);
    }

    #[test]
    fn test_complex_array_magnitude() {
        let c1 = Complex64::new(3.0, 4.0);
        let c2 = Complex64::new(5.0, 12.0);
        let array = ComplexArray::new(vec![c1, c2]);

        let magnitudes = array.magnitude();
        assert_eq!(magnitudes[0], 5.0);
        assert_eq!(magnitudes[1], 13.0);
    }

    #[test]
    fn test_complex_array_phase() {
        let c1 = Complex64::new(1.0, 1.0);
        let array = ComplexArray::new(vec![c1]);

        let phases = array.phase();
        assert!((phases[0] - std::f64::consts::PI / 4.0).abs() < 1e-10);
    }

    #[test]
    fn test_complex_array_conjugate() {
        let c1 = Complex64::new(1.0, 2.0);
        let c2 = Complex64::new(3.0, 4.0);
        let array = ComplexArray::new(vec![c1, c2]);

        let conj = array.conjugate();
        assert_eq!(conj.value(0).unwrap().re, 1.0);
        assert_eq!(conj.value(0).unwrap().im, -2.0);
        assert_eq!(conj.value(1).unwrap().re, 3.0);
        assert_eq!(conj.value(1).unwrap().im, -4.0);
    }

    #[test]
    fn test_tensor4d_array_creation() {
        let t1 = Tensor4D::minkowski();
        let t2 = Tensor4D::zeros();
        let array = Tensor4DArray::new(vec![t1, t2]);

        assert_eq!(array.len(), 2);
        assert_eq!(array.value(0), Some(t1));
        assert_eq!(array.value(1), Some(t2));
    }

    #[test]
    fn test_spinor_array_creation() {
        let s1 = Spinor::spin_up();
        let s2 = Spinor::spin_down();
        let array = SpinorArray::new(vec![s1, s2]);

        assert_eq!(array.len(), 2);
        assert_eq!(array.value(0), Some(s1));
        assert_eq!(array.value(1), Some(s2));
    }

    #[test]
    fn test_spinor_array_normalize() {
        let s1 = Spinor::new(Complex64::new(2.0, 0.0), Complex64::new(0.0, 0.0));
        let s2 = Spinor::new(Complex64::new(0.0, 0.0), Complex64::new(3.0, 0.0));
        let array = SpinorArray::new(vec![s1, s2]);

        let normalized = array.normalize();
        assert!((normalized.value(0).unwrap().norm() - 1.0).abs() < 1e-10);
        assert!((normalized.value(1).unwrap().norm() - 1.0).abs() < 1e-10);
    }
}

//! Kalman Filter for state estimation
//!
//! Implements the discrete Kalman filter for linear systems.
//!
//! # Example
//! ```
//! use avila_math::filters::KalmanFilter;
//!
//! // 1D constant velocity model: x = [position, velocity]
//! let dt = 0.1;
//! let f = vec![vec![1.0, dt], vec![0.0, 1.0]];  // State transition
//! let h = vec![vec![1.0, 0.0]];  // Measurement (observe position only)
//! let q = vec![vec![0.01, 0.0], vec![0.0, 0.01]];  // Process noise
//! let r = vec![vec![1.0]];  // Measurement noise
//!
//! let mut kf = KalmanFilter::new(f, h, q, r);
//! kf.predict();
//! kf.update(&[5.0]);  // Measurement
//! let state = kf.state();
//! ```

/// Kalman Filter for linear state estimation
#[derive(Debug, Clone)]
pub struct KalmanFilter {
    /// State vector (n × 1)
    x: Vec<f64>,
    /// State covariance matrix (n × n)
    p: Vec<Vec<f64>>,
    /// State transition matrix (n × n)
    f: Vec<Vec<f64>>,
    /// Measurement matrix (m × n)
    h: Vec<Vec<f64>>,
    /// Process noise covariance (n × n)
    q: Vec<Vec<f64>>,
    /// Measurement noise covariance (m × m)
    r: Vec<Vec<f64>>,
    /// State dimension
    n: usize,
    /// Measurement dimension
    m: usize,
}

impl KalmanFilter {
    /// Create a new Kalman filter
    ///
    /// # Arguments
    /// * `f` - State transition matrix (n × n)
    /// * `h` - Measurement matrix (m × n)
    /// * `q` - Process noise covariance (n × n)
    /// * `r` - Measurement noise covariance (m × m)
    pub fn new(f: Vec<Vec<f64>>, h: Vec<Vec<f64>>, q: Vec<Vec<f64>>, r: Vec<Vec<f64>>) -> Self {
        let n = f.len();
        let m = h.len();

        // Initialize state to zero
        let x = vec![0.0; n];
        // Initialize covariance to identity
        let p = (0..n)
            .map(|i| (0..n).map(|j| if i == j { 1.0 } else { 0.0 }).collect())
            .collect();

        Self {
            x,
            p,
            f,
            h,
            q,
            r,
            n,
            m,
        }
    }

    /// Set initial state
    pub fn set_state(&mut self, x: Vec<f64>) {
        assert_eq!(x.len(), self.n, "State dimension mismatch");
        self.x = x;
    }

    /// Set initial covariance
    pub fn set_covariance(&mut self, p: Vec<Vec<f64>>) {
        assert_eq!(p.len(), self.n, "Covariance dimension mismatch");
        self.p = p;
    }

    /// Get current state estimate
    pub fn state(&self) -> &[f64] {
        &self.x
    }

    /// Get current covariance estimate
    pub fn covariance(&self) -> &[Vec<f64>] {
        &self.p
    }

    /// Prediction step (time update)
    pub fn predict(&mut self) {
        // x = F * x
        self.x = mat_vec_mul(&self.f, &self.x);

        // P = F * P * F^T + Q
        let fp = mat_mul(&self.f, &self.p);
        let fpf = mat_mul(&fp, &transpose(&self.f));
        self.p = mat_add(&fpf, &self.q);
    }

    /// Update step (measurement update)
    pub fn update(&mut self, z: &[f64]) {
        assert_eq!(z.len(), self.m, "Measurement dimension mismatch");

        // Innovation: y = z - H * x
        let hx = mat_vec_mul(&self.h, &self.x);
        let y: Vec<f64> = z.iter().zip(hx.iter()).map(|(a, b)| a - b).collect();

        // Innovation covariance: S = H * P * H^T + R
        let hp = mat_mul(&self.h, &self.p);
        let hph = mat_mul(&hp, &transpose(&self.h));
        let s = mat_add(&hph, &self.r);

        // Kalman gain: K = P * H^T * S^-1
        let ht = transpose(&self.h);
        let pht = mat_mul(&self.p, &ht);
        let s_inv = mat_inv(&s);
        let k = mat_mul(&pht, &s_inv);

        // Update state: x = x + K * y
        let ky = mat_vec_mul(&k, &y);
        self.x = vec_add(&self.x, &ky);

        // Update covariance: P = (I - K * H) * P
        let kh = mat_mul(&k, &self.h);
        let i_kh = mat_sub(&identity(self.n), &kh);
        self.p = mat_mul(&i_kh, &self.p);
    }
}

// Matrix operations helpers

fn mat_vec_mul(a: &[Vec<f64>], x: &[f64]) -> Vec<f64> {
    a.iter()
        .map(|row| row.iter().zip(x.iter()).map(|(a, b)| a * b).sum())
        .collect()
}

fn mat_mul(a: &[Vec<f64>], b: &[Vec<f64>]) -> Vec<Vec<f64>> {
    let bt = transpose(b);
    a.iter()
        .map(|row| {
            bt.iter()
                .map(|col| row.iter().zip(col.iter()).map(|(a, b)| a * b).sum())
                .collect()
        })
        .collect()
}

fn mat_add(a: &[Vec<f64>], b: &[Vec<f64>]) -> Vec<Vec<f64>> {
    a.iter()
        .zip(b.iter())
        .map(|(row_a, row_b)| row_a.iter().zip(row_b.iter()).map(|(a, b)| a + b).collect())
        .collect()
}

fn mat_sub(a: &[Vec<f64>], b: &[Vec<f64>]) -> Vec<Vec<f64>> {
    a.iter()
        .zip(b.iter())
        .map(|(row_a, row_b)| row_a.iter().zip(row_b.iter()).map(|(a, b)| a - b).collect())
        .collect()
}

fn vec_add(a: &[f64], b: &[f64]) -> Vec<f64> {
    a.iter().zip(b.iter()).map(|(x, y)| x + y).collect()
}

fn transpose(m: &[Vec<f64>]) -> Vec<Vec<f64>> {
    let rows = m.len();
    let cols = m[0].len();
    (0..cols)
        .map(|j| (0..rows).map(|i| m[i][j]).collect())
        .collect()
}

fn identity(n: usize) -> Vec<Vec<f64>> {
    (0..n)
        .map(|i| (0..n).map(|j| if i == j { 1.0 } else { 0.0 }).collect())
        .collect()
}

fn mat_inv(m: &[Vec<f64>]) -> Vec<Vec<f64>> {
    let n = m.len();
    assert_eq!(n, m[0].len(), "Matrix must be square");

    // Gauss-Jordan elimination
    let mut aug = m
        .iter()
        .enumerate()
        .map(|(i, row)| {
            let mut r = row.clone();
            r.extend((0..n).map(|j| if i == j { 1.0 } else { 0.0 }));
            r
        })
        .collect::<Vec<_>>();

    // Forward elimination
    for i in 0..n {
        // Find pivot
        let mut max_row = i;
        for k in i + 1..n {
            if aug[k][i].abs() > aug[max_row][i].abs() {
                max_row = k;
            }
        }
        aug.swap(i, max_row);

        let pivot = aug[i][i];
        for aug_val in aug[i].iter_mut().take(2 * n) {
            *aug_val /= pivot;
        }

        for k in 0..n {
            if k != i {
                let factor = aug[k][i];
                let aug_i_row = aug[i].clone();
                for (j, aug_kj) in aug[k].iter_mut().enumerate().take(2 * n) {
                    *aug_kj -= factor * aug_i_row[j];
                }
            }
        }
    }

    // Extract inverse
    aug.iter().map(|row| row[n..].to_vec()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_kalman_1d() {
        let f = vec![vec![1.0]];
        let h = vec![vec![1.0]];
        let q = vec![vec![0.01]];
        let r = vec![vec![1.0]];

        let mut kf = KalmanFilter::new(f, h, q, r);
        kf.set_state(vec![0.0]);

        kf.predict();
        kf.update(&[1.0]);

        assert!(kf.state()[0] > 0.0 && kf.state()[0] < 1.0);
    }

    #[test]
    fn test_kalman_2d_velocity() {
        let dt = 0.1;
        let f = vec![vec![1.0, dt], vec![0.0, 1.0]];
        let h = vec![vec![1.0, 0.0]];
        let q = vec![vec![0.01, 0.0], vec![0.0, 0.01]];
        let r = vec![vec![1.0]];

        let mut kf = KalmanFilter::new(f, h, q, r);
        kf.set_state(vec![0.0, 0.0]);

        for i in 0..10 {
            kf.predict();
            let measurement = i as f64 * 0.5;
            kf.update(&[measurement]);
        }

        // After 10 steps, position should be close to 4.5 with some velocity
        assert!(kf.state()[0] > 3.0 && kf.state()[0] < 6.0);
    }
}

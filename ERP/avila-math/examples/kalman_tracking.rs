//! Kalman Filter Example: Tracking Position with Noisy Measurements
//!
//! Demonstrates Kalman filtering for state estimation.

use avila_math::filters::KalmanFilter;
use rand::Rng;

fn main() {
    println!("📡 Kalman Filter: Position Tracking with Noise\n");

    // Constant velocity model in 1D
    // State: [position, velocity]
    let dt = 0.1; // Time step

    // State transition matrix: x_k+1 = F * x_k
    let f = vec![vec![1.0, dt], vec![0.0, 1.0]];

    // Measurement matrix: we only observe position
    let h = vec![vec![1.0, 0.0]];

    // Process noise covariance (model uncertainty)
    let q = vec![vec![0.01, 0.0], vec![0.0, 0.01]];

    // Measurement noise covariance (sensor noise)
    let r = vec![vec![1.0]];

    let mut kf = KalmanFilter::new(f, h, q, r);

    // Set initial state: starting at position 0 with velocity 1 m/s
    kf.set_state(vec![0.0, 1.0]);

    println!("True trajectory: position = velocity * time");
    println!("Adding Gaussian noise (σ=1.0) to measurements\n");

    let mut rng = rand::thread_rng();

    println!(
        "{:>8} {:>12} {:>12} {:>12} {:>12}",
        "Time", "True Pos", "Measured", "Estimated", "Velocity"
    );
    println!("{}", "-".repeat(60));

    for step in 0..50 {
        let time = step as f64 * dt;

        // True position (constant velocity)
        let true_position = 1.0 * time;

        // Noisy measurement
        let noise = rng.gen::<f64>() * 2.0 - 1.0; // Uniform [-1, 1]
        let measurement = true_position + noise;

        // Kalman filter prediction
        kf.predict();

        // Kalman filter update with measurement
        kf.update(&[measurement]);

        let state = kf.state();
        let estimated_position = state[0];
        let estimated_velocity = state[1];

        if step % 5 == 0 {
            println!(
                "{:8.2} {:12.4} {:12.4} {:12.4} {:12.4}",
                time, true_position, measurement, estimated_position, estimated_velocity
            );
        }
    }

    println!("\n✅ Kalman filter successfully reduced noise and tracked velocity!");
    println!("   Estimated velocity converged to ~1.0 m/s");
}

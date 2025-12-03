//! Scientific types example - Quaternions and Complex numbers

use avila_arrow::scientific::{Quaternion, Complex64, Tensor4D, Spinor};

fn main() {
    println!("🔬 avila-arrow - Scientific Types Example\n");

    // Quaternions for 3D rotations
    println!("=== Quaternions ===");
    let identity = Quaternion::identity();
    println!("Identity: ({}, {}, {}, {})", identity.w, identity.x, identity.y, identity.z);

    // 90° rotation around X axis
    let q_x = Quaternion::from_axis_angle([1.0, 0.0, 0.0], std::f64::consts::PI / 2.0);
    println!("90° around X: ({:.3}, {:.3}, {:.3}, {:.3})", q_x.w, q_x.x, q_x.y, q_x.z);

    // Rotate a vector
    let vector = [0.0, 1.0, 0.0]; // Y axis
    let rotated = q_x.rotate_vector(vector);
    println!("Vector (0, 1, 0) rotated: ({:.3}, {:.3}, {:.3})", rotated[0], rotated[1], rotated[2]);
    println!();

    // Complex numbers for FFT
    println!("=== Complex Numbers ===");
    let c1 = Complex64::new(3.0, 4.0);
    println!("c1 = {} + {}i", c1.re, c1.im);
    println!("Magnitude: {}", c1.magnitude());
    println!("Phase: {:.3} rad", c1.phase());

    let c2 = Complex64::from_polar(5.0, std::f64::consts::PI / 4.0);
    println!("c2 (polar r=5, θ=π/4): {:.3} + {:.3}i", c2.re, c2.im);

    let product = c1 * c2;
    println!("c1 * c2 = {:.3} + {:.3}i", product.re, product.im);
    println!();

    // Tensor4D for General Relativity
    println!("=== Tensor4D (Spacetime) ===");
    let minkowski = Tensor4D::minkowski();
    println!("Minkowski metric (flat spacetime):");
    println!("  g_00 = {}", minkowski.get(0, 0));
    println!("  g_11 = {}", minkowski.get(1, 1));

    let schwarzschild = Tensor4D::schwarzschild_metric(1.0, 10.0);
    println!("\nSchwarzschild metric (black hole, r=10):");
    println!("  g_tt = {:.6}", schwarzschild.get(0, 0));
    println!("  g_rr = {:.6}", schwarzschild.get(1, 1));
    println!();

    // Spinors for particle physics
    println!("=== Spinors (Quantum States) ===");
    let spin_up = Spinor::spin_up();
    println!("Spin up: |↑⟩ = ({} + {}i, {} + {}i)",
        spin_up.up.re, spin_up.up.im,
        spin_up.down.re, spin_up.down.im
    );
    println!("Norm: {}", spin_up.norm());

    let superposition = Spinor::new(
        Complex64::new(0.707, 0.0),  // 1/√2
        Complex64::new(0.707, 0.0),  // 1/√2
    );
    println!("\nSuperposition (|↑⟩ + |↓⟩)/√2:");
    println!("  Norm: {:.3}", superposition.norm());

    println!("\n✅ Scientific types example completed!");
}

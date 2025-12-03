//! # Quaternion Animation Example
//!
//! Demonstrates smooth quaternion interpolation (SLERP) for 3D rotations.

use avila_math::geometry::Quat3D;
use std::f64::consts::PI;

fn main() {
    println!("🎬 Quaternion Animation with SLERP\n");

    // Define start and end rotations
    let start = Quat3D::identity(); // No rotation
    let end = Quat3D::from_axis_angle([0.0, 1.0, 0.0], PI); // 180° around Y-axis

    println!("Start rotation: Identity (no rotation)");
    println!("End rotation: 180° around Y-axis");
    println!("\nInterpolating between rotations:");
    println!("{:-<60}", "");

    // Animate with 10 frames
    let frames = 10;
    let test_vector = [1.0, 0.0, 0.0]; // Point along X-axis

    for i in 0..=frames {
        let t = i as f64 / frames as f64;
        let interpolated = start.slerp(&end, t);

        let rotated = interpolated.rotate_vector(test_vector);

        println!(
            "Frame {:2} (t={:.2}): [{:6.3}, {:6.3}, {:6.3}]",
            i, t, rotated[0], rotated[1], rotated[2]
        );
    }

    println!("{:-<60}", "");
    println!("\n✨ Smooth rotation from X+ to X- axis!");

    // Demonstrate multiple axis rotations
    println!("\n🔄 Combining rotations:");
    let rot_x = Quat3D::from_axis_angle([1.0, 0.0, 0.0], PI / 4.0); // 45° around X
    let rot_y = Quat3D::from_axis_angle([0.0, 1.0, 0.0], PI / 4.0); // 45° around Y
    let combined = rot_y.multiply(&rot_x); // Y then X

    let result = combined.rotate_vector([1.0, 0.0, 0.0]);
    println!("Rotating [1, 0, 0] by 45° around X, then 45° around Y:");
    println!(
        "Result: [{:.3}, {:.3}, {:.3}]",
        result[0], result[1], result[2]
    );

    // Convert to rotation matrix
    println!("\n📐 Rotation matrix representation:");
    let matrix = combined.to_rotation_matrix();
    for row in &matrix {
        println!("  [{:6.3}, {:6.3}, {:6.3}]", row[0], row[1], row[2]);
    }

    println!("\n✅ Quaternion animation complete!");
}

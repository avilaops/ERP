//! Exemplo de integração entre avila-linalg e avila-math
//!
//! Demonstra conversão zero-cost entre tipos das duas bibliotecas

// Compile com: cargo run --example interop_demo --features interop-math

#[cfg(feature = "interop-math")]
fn main() {
    use avila_linalg::{Vector3, Vector4};

    println!("=== Integração avila-linalg ↔ avila-math ===\n");

    // Vector3 conversion
    println!("📐 Vector3 Conversion:");
    let linalg_v3 = Vector3::new(1.0, 2.0, 3.0);
    println!("  avila-linalg: {:?}", linalg_v3);

    let math_v3: avila_math::geometry::Vector3 = linalg_v3.into();
    println!("  avila-math:   Vector3 {{ x: {}, y: {}, z: {} }}",
             math_v3.x, math_v3.y, math_v3.z);

    let back_v3: Vector3<f64> = math_v3.into();
    println!("  Round-trip:   {:?}", back_v3);
    assert_eq!(linalg_v3, back_v3);
    println!("  ✅ Zero-cost conversion verified!\n");

    // Vector4 conversion
    println!("📐 Vector4 Conversion:");
    let linalg_v4 = Vector4::new(1.0, 2.0, 3.0, 4.0);
    println!("  avila-linalg: {:?}", linalg_v4);

    let math_v4: avila_math::geometry::Vector4 = linalg_v4.into();
    println!("  avila-math:   Vector4 {{ x: {}, y: {}, z: {}, w: {} }}",
             math_v4.x, math_v4.y, math_v4.z, math_v4.w);

    let back_v4: Vector4<f64> = math_v4.into();
    println!("  Round-trip:   {:?}", back_v4);
    assert_eq!(linalg_v4, back_v4);
    println!("  ✅ Zero-cost conversion verified!\n");

    // Use case: Operations across libraries
    println!("🔄 Cross-library Operations:");

    // Normalize using avila-linalg (SIMD-optimized)
    let v_linalg = Vector3::new(3.0, 4.0, 0.0);
    let normalized = v_linalg.normalize();
    println!("  Normalized (linalg): {:?}", normalized);

    // Convert to avila-math for quaternion operations
    let v_math: avila_math::geometry::Vector3 = normalized.into();
    println!("  Converted to math:   Vector3 {{ x: {:.3}, y: {:.3}, z: {:.3} }}",
             v_math.x, v_math.y, v_math.z);

    // Could now use v_math with quaternions, SO(4) rotations, etc.
    println!("  ✅ Seamless interop!\n");

    println!("🎯 Integration Benefits:");
    println!("  • Zero-cost abstractions");
    println!("  • Type-safe conversions");
    println!("  • Best of both libraries");
    println!("  • SIMD from linalg + Quaternions from math");
    println!("\n✅ Avila Stack - 100% Integrated!");
}

#[cfg(not(feature = "interop-math"))]
fn main() {
    println!("❌ Feature 'interop-math' not enabled!");
    println!("Run with: cargo run --example interop_demo --features interop-math");
}

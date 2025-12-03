//! Z-Transform Example: Digital Filter Analysis
//!
//! Demonstrates frequency response analysis using Z-transform.

use avila_math::filters::ztransform::{design_lowpass, frequency_response};
use std::f64::consts::PI;

fn main() {
    println!("⚡ Z-Transform: Digital Filter Frequency Response\n");

    // Design a simple low-pass FIR filter
    let cutoff = 0.25 * PI; // Normalized cutoff frequency (π/4)
    let order = 20;

    println!("Designing low-pass FIR filter:");
    println!("  Order: {}", order);
    println!(
        "  Cutoff: {:.2} rad/sample ({:.1} Hz at fs=1000 Hz)",
        cutoff,
        cutoff / (2.0 * PI) * 1000.0
    );

    let (b, a) = design_lowpass(cutoff, order);

    println!("\nFilter coefficients (first 5):");
    for (i, &coef) in b.iter().take(5).enumerate() {
        println!("  b[{}] = {:.6}", i, coef);
    }
    println!("  ...");

    // Compute frequency response
    println!("\nComputing frequency response...");
    let n_points = 256;
    let response = frequency_response(&b, &a, n_points);

    println!("\nFrequency Response:");
    println!(
        "{:>10} {:>15} {:>15} {:>15}",
        "Freq (Hz)", "Magnitude", "Magnitude (dB)", "Phase (deg)"
    );
    println!("{}", "-".repeat(60));

    let sample_rate = 1000.0; // Hz
    for i in (0..n_points).step_by(16) {
        let freq_hz = response.frequencies[i] / (2.0 * PI) * sample_rate;
        let mag = response.response[i].norm();
        let mag_db = 20.0 * mag.log10();
        let phase_deg = response.response[i].arg() * 180.0 / PI;

        println!(
            "{:10.1} {:15.4} {:15.2} {:15.2}",
            freq_hz, mag, mag_db, phase_deg
        );
    }

    // Find -3dB point (cutoff frequency)
    let mut cutoff_idx = 0;
    for (i, h) in response.response.iter().enumerate() {
        let mag_db = 20.0 * h.norm().log10();
        if mag_db < -3.0 {
            cutoff_idx = i;
            break;
        }
    }

    if cutoff_idx > 0 {
        let actual_cutoff = response.frequencies[cutoff_idx] / (2.0 * PI) * sample_rate;
        println!("\n✅ Filter characteristics:");
        println!("   -3dB cutoff: {:.1} Hz", actual_cutoff);
        println!(
            "   Stopband attenuation: {:.1} dB",
            20.0 * response.response[n_points - 1].norm().log10()
        );
    }

    // Check passband flatness
    let passband_ripple = response
        .response
        .iter()
        .take(cutoff_idx)
        .map(|h| 20.0 * h.norm().log10())
        .fold(0.0, |max, db| if db.abs() > max { db.abs() } else { max });

    println!("   Passband ripple: ±{:.2} dB", passband_ripple);

    println!("\n🎯 Z-transform analysis complete!");
}

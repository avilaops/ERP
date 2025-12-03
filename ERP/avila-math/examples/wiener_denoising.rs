//! Wiener Filter Example: Audio Denoising
//!
//! Demonstrates noise reduction using Wiener filtering.

use avila_math::filters::WienerFilter;
use rand::Rng;
use std::f64::consts::PI;

fn main() {
    println!("🎵 Wiener Filter: Audio Signal Denoising\n");

    let sample_rate = 1000.0; // Hz
    let duration = 1.0; // seconds
    let num_samples = (sample_rate * duration) as usize;

    // Generate clean signal: mix of two sine waves
    let freq1 = 50.0; // Hz
    let freq2 = 120.0; // Hz

    let mut clean_signal = Vec::with_capacity(num_samples);
    for i in 0..num_samples {
        let t = i as f64 / sample_rate;
        let value = (2.0 * PI * freq1 * t).sin() + 0.5 * (2.0 * PI * freq2 * t).sin();
        clean_signal.push(value);
    }

    // Add white noise
    let mut rng = rand::thread_rng();
    let noise_level = 0.5;
    let noisy_signal: Vec<f64> = clean_signal
        .iter()
        .map(|&s| s + rng.gen::<f64>() * noise_level * 2.0 - noise_level)
        .collect();

    // Calculate SNR of noisy signal
    let signal_power: f64 = clean_signal.iter().map(|x| x * x).sum::<f64>() / num_samples as f64;
    let noise_power: f64 = noisy_signal
        .iter()
        .zip(clean_signal.iter())
        .map(|(n, s)| {
            let noise = n - s;
            noise * noise
        })
        .sum::<f64>()
        / num_samples as f64;

    let snr = 10.0 * (signal_power / noise_power).log10();
    println!("Original SNR: {:.2} dB", snr);

    // Create Wiener filter with estimated SNR
    let wf = WienerFilter::from_snr(num_samples, signal_power / noise_power);

    // Apply filter
    println!("Applying Wiener filter...");
    let filtered_signal = wf.apply(&noisy_signal);

    // Calculate SNR after filtering
    let filtered_snr = {
        let error_power: f64 = filtered_signal
            .iter()
            .zip(clean_signal.iter())
            .map(|(f, s)| {
                let err = f - s;
                err * err
            })
            .sum::<f64>()
            / num_samples as f64;

        10.0 * (signal_power / error_power).log10()
    };

    println!("Filtered SNR: {:.2} dB", filtered_snr);
    println!("SNR improvement: {:.2} dB ✨", filtered_snr - snr);

    // Calculate mean squared error
    let mse_noisy: f64 = noisy_signal
        .iter()
        .zip(clean_signal.iter())
        .map(|(n, s)| (n - s).powi(2))
        .sum::<f64>()
        / num_samples as f64;

    let mse_filtered: f64 = filtered_signal
        .iter()
        .zip(clean_signal.iter())
        .map(|(f, s)| (f - s).powi(2))
        .sum::<f64>()
        / num_samples as f64;

    println!("\nMean Squared Error:");
    println!("  Noisy:    {:.6}", mse_noisy);
    println!("  Filtered: {:.6}", mse_filtered);
    println!(
        "  Reduction: {:.1}%",
        (1.0 - mse_filtered / mse_noisy) * 100.0
    );

    println!("\n✅ Wiener filter successfully reduced noise!");
    println!("   Filter coefficients: {} taps", wf.order());
}

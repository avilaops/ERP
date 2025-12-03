/// LISA Data Processing Layer - Complete Example
///
/// Demonstrates signal processing and conditioning for LISA data:
/// 1. FFT and spectral analysis
/// 2. Power Spectral Density (PSD) estimation
/// 3. Whitening and filtering
/// 4. TDI combinations
/// 5. Glitch detection and removal
///
/// This example builds on the input layer and shows how to prepare
/// raw LISA data for scientific analysis.
use arxis_quaternions::physics::*;

fn main() {
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║       ARXIS - LISA Data Processing Layer                  ║");
    println!("║     Signal Conditioning & Spectral Analysis                ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    // ==================== PART 1: GENERATE TEST DATA ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Part 1: Generate Test Signal                              ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("🔬 SCENARIO: SMBH binary inspiral with detector noise\n");

    // Generate synthetic signal
    let sampling_rate = 0.1; // Hz (10 sec cadence)
    let duration = 3600.0; // 1 hour
    let generator = SyntheticDataGenerator::new(sampling_rate, duration);

    // Create chirping binary signal (inspiral)
    let f_start = 0.002; // 2 mHz
    let f_end = 0.008; // 8 mHz
    let amplitude = 5e-21;

    println!("📊 Signal Parameters:");
    println!("   • Type: Chirping binary (inspiral)");
    println!("   • Start frequency: {} mHz", f_start * 1000.0);
    println!("   • End frequency: {} mHz", f_end * 1000.0);
    println!("   • Amplitude: {:.2e}", amplitude);
    println!("   • Duration: {:.1} minutes", duration / 60.0);
    println!("   • Sampling rate: {} Hz\n", sampling_rate);

    let clean_signal = generator.chirping_binary(f_start, f_end, amplitude);

    println!("✅ Generated clean signal:");
    println!("   • Samples: {}", clean_signal.len());
    println!("   • RMS strain: {:.2e}", clean_signal.rms_strain());
    println!("   • Peak strain: {:.2e}\n", clean_signal.peak_strain());

    // Add realistic noise
    let noise_level = 1e-21; // LISA noise at ~3 mHz
    let noisy_signal = generator.signal_plus_noise(&clean_signal, noise_level);

    println!("🔊 Added detector noise:");
    println!("   • Noise level: {:.2e}", noise_level);
    println!("   • SNR (estimate): {:.1}", amplitude / noise_level);
    println!("   • Noisy RMS: {:.2e}\n", noisy_signal.rms_strain());

    // ==================== PART 2: SPECTRAL ANALYSIS ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Part 2: Spectral Analysis (FFT)                           ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("📈 Computing Fourier transform...\n");

    // Create data processor
    let fft_size = 512; // Power of 2
    let processor = DataProcessor::new(fft_size);

    println!("⚙️  Processor Configuration:");
    println!("   • FFT size: {}", fft_size);
    println!("   • Window: {:?}", processor.window);
    println!(
        "   • Frequency resolution: {:.6} Hz\n",
        sampling_rate / fft_size as f64
    );

    // Compute FFT
    let spectrum = processor.compute_fft(&noisy_signal);

    println!("✅ FFT computed:");
    println!("   • Frequency bins: {}", spectrum.frequencies.len());
    println!(
        "   • Frequency range: {:.6} to {:.4} Hz",
        spectrum.frequencies[0],
        spectrum.frequencies[spectrum.frequencies.len() - 1]
    );
    println!(
        "   • In LISA band: {:.1} to {:.1} mHz\n",
        spectrum.frequencies[0] * 1000.0,
        spectrum.frequencies[spectrum.frequencies.len() - 1] * 1000.0
    );

    // Compute power spectrum
    let power = spectrum.power();
    let max_power_idx = power
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
        .map(|(i, _)| i)
        .unwrap();

    println!("🎯 Peak Detection:");
    println!(
        "   • Peak frequency: {:.4} mHz",
        spectrum.frequencies[max_power_idx] * 1000.0
    );
    println!("   • Peak power: {:.2e}", power[max_power_idx]);
    println!(
        "   • Expected range: {:.1} to {:.1} mHz\n",
        f_start * 1000.0,
        f_end * 1000.0
    );

    // ==================== PART 3: POWER SPECTRAL DENSITY ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Part 3: Power Spectral Density (PSD) Analysis             ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("📊 Computing PSD (Welch's method)...\n");

    let n_segments = 4;
    let estimated_psd = processor.estimate_psd(&noisy_signal, n_segments);

    println!("✅ PSD estimated:");
    println!("   • Method: Welch (averaged periodogram)");
    println!("   • Segments: {}", n_segments);
    println!("   • Frequency points: {}", estimated_psd.frequencies.len());
    println!(
        "   • RMS noise (integrated): {:.2e}\n",
        estimated_psd.rms_noise()
    );

    // Compare with LISA theoretical noise
    println!("🔬 LISA Theoretical Noise Model:\n");

    let lisa_psd = PowerSpectralDensity::lisa_noise_model(1e-4, 0.05, 500);

    println!(
        "   • Model frequencies: {} points",
        lisa_psd.frequencies.len()
    );
    println!(
        "   • Frequency range: {:.1} mHz to {:.1} mHz",
        lisa_psd.frequencies[0] * 1000.0,
        lisa_psd.frequencies[lisa_psd.frequencies.len() - 1] * 1000.0
    );

    // Sample some noise values
    let test_freqs = [0.001, 0.003, 0.01, 0.03];
    println!("\n   📉 Noise Curve Samples:");
    for &f in &test_freqs {
        let noise = lisa_psd.interpolate(f);
        println!("      • {} mHz: {:.2e} strain²/Hz", f * 1000.0, noise);
    }
    println!();

    // ==================== PART 4: WHITENING ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Part 4: Whitening (Noise Normalization)                   ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("🎨 Whitening transforms colored noise → white noise");
    println!("   This improves matched filtering and parameter estimation\n");

    let whitened = processor.whiten(&noisy_signal);

    println!("✅ Data whitened:");
    println!("   • Input RMS: {:.2e}", noisy_signal.rms_strain());
    println!("   • Output RMS: {:.2e}", whitened.rms_strain());
    println!("   • Samples: {}\n", whitened.len());

    println!("💡 Effect: Noise is now approximately white (flat spectrum)");
    println!("   Signal amplitude is boosted in low-noise regions\n");

    // ==================== PART 5: BANDPASS FILTERING ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Part 5: Bandpass Filtering                                ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("🔊 Applying bandpass filter to isolate signal...\n");

    let f_low = 0.001; // 1 mHz
    let f_high = 0.01; // 10 mHz

    println!("⚙️  Filter Configuration:");
    println!("   • Type: Bandpass");
    println!("   • Low cutoff: {:.1} mHz", f_low * 1000.0);
    println!("   • High cutoff: {:.1} mHz", f_high * 1000.0);
    println!("   • Passband: {:.1} mHz wide\n", (f_high - f_low) * 1000.0);

    let filtered = processor.bandpass(&noisy_signal, f_low, f_high);

    println!("✅ Signal filtered:");
    println!("   • Input RMS: {:.2e}", noisy_signal.rms_strain());
    println!("   • Output RMS: {:.2e}", filtered.rms_strain());
    println!(
        "   • Reduction: {:.1}%\n",
        (1.0 - filtered.rms_strain() / noisy_signal.rms_strain()) * 100.0
    );

    println!("💡 Bandpass removes out-of-band noise");
    println!("   Improves SNR for signals in passband\n");

    // ==================== PART 6: WINDOW FUNCTIONS ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Part 6: Window Functions                                  ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("🪟 Demonstrating different window functions...\n");

    let windows = [
        ("Rectangular", WindowFunction::Rectangular),
        ("Hann", WindowFunction::Hann),
        ("Hamming", WindowFunction::Hamming),
        ("Blackman", WindowFunction::Blackman),
        ("Tukey (α=0.5)", WindowFunction::Tukey { alpha: 0.5 }),
    ];

    println!("📊 Window Function Comparison:\n");
    for (name, window) in &windows {
        let proc = DataProcessor::new(fft_size).with_window(*window);
        let spec = proc.compute_fft(&clean_signal);
        let power = spec.power();
        let peak = power.iter().fold(0.0_f64, |a, &b| a.max(b));

        println!("   {} Window:", name);
        println!("      • Peak power: {:.2e}", peak);
        println!("      • Normalization: {:.4}", window.normalization(100));
        println!();
    }

    println!("💡 Choice of window affects spectral leakage");
    println!("   Hann and Hamming are good general-purpose choices\n");

    // ==================== PART 7: TDI COMBINATIONS ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Part 7: TDI (Time-Delay Interferometry) Channels          ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("🛰️  LISA uses 3 spacecraft forming equilateral triangle");
    println!("   TDI combinations cancel laser frequency noise\n");

    // Generate 3 independent data streams (simplified)
    let data1 = generator.monochromatic_binary(0.003, 3e-21, 0.0);
    let data2 = generator.monochromatic_binary(0.003, 3e-21, 1.0);
    let data3 = generator.monochromatic_binary(0.003, 3e-21, 2.0);

    let tdi = TDIChannels::from_raw(&data1, &data2, &data3);

    println!("✅ TDI channels computed:");
    println!("   • Channel A (Michelson α):");
    println!("      - RMS: {:.2e}", tdi.channel_a.rms_strain());
    println!("      - Samples: {}", tdi.channel_a.len());
    println!("\n   • Channel E (Michelson ζ):");
    println!("      - RMS: {:.2e}", tdi.channel_e.rms_strain());
    println!("      - Samples: {}", tdi.channel_e.len());
    println!("\n   • Channel T (Sagnac):");
    println!("      - RMS: {:.2e}", tdi.channel_t.rms_strain());
    println!("      - Samples: {}\n", tdi.channel_t.len());

    println!("💡 Channels A and E are orthogonal");
    println!("   Channel T is null channel (laser noise only)\n");

    // Optimal combination
    let psd_a = processor.estimate_psd(&tdi.channel_a, 4);
    let psd_e = processor.estimate_psd(&tdi.channel_e, 4);
    let combined = tdi.optimal_combination(&psd_a, &psd_e);

    println!("🎯 Optimal Channel Combination:");
    println!("   • Combined RMS: {:.2e}", combined.rms_strain());
    println!("   • Maximizes SNR across sky\n");

    // ==================== PART 8: GLITCH DETECTION ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Part 8: Glitch Detection and Removal                      ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("🔍 Detecting transient artifacts (glitches)...\n");

    // Create signal with artificial glitch
    let mut glitchy_signal = noisy_signal.clone();
    let glitch_idx = glitchy_signal.len() / 2;
    glitchy_signal.h_plus[glitch_idx] = 1e-19; // Large spike
    glitchy_signal.h_plus[glitch_idx + 1] = 1e-19;
    glitchy_signal.h_plus[glitch_idx + 2] = 1e-19;

    println!("💥 Injected artificial glitch:");
    println!(
        "   • Position: t = {:.1} sec",
        glitchy_signal.time[glitch_idx]
    );
    println!("   • Amplitude: 1e-19 (100x normal signal)");
    println!("   • Duration: ~30 seconds\n");

    // Detect glitches
    let detector = GlitchDetector::new(5.0); // 5-sigma threshold

    println!("⚙️  Glitch Detector:");
    println!("   • Threshold: {} σ", detector.threshold);
    println!("   • Min duration: {:.1} sec\n", detector.min_duration);

    let glitches = detector.detect(&glitchy_signal);

    println!("✅ Glitches detected: {}\n", glitches.len());

    for (i, glitch) in glitches.iter().enumerate() {
        println!("   Glitch {}:", i + 1);
        println!("      • Start: {:.1} sec", glitch.time_start);
        println!("      • End: {:.1} sec", glitch.time_end);
        println!(
            "      • Duration: {:.1} sec",
            glitch.time_end - glitch.time_start
        );
        println!("      • Peak amplitude: {:.2e}", glitch.amplitude);
        println!("      • Type: {}", glitch.glitch_type);
        println!();
    }

    // Remove glitches
    let cleaned = detector.remove_glitches(&glitchy_signal, &glitches);

    println!("🧹 Glitches removed:");
    println!("   • Method: Linear interpolation");
    println!("   • Before RMS: {:.2e}", glitchy_signal.rms_strain());
    println!("   • After RMS: {:.2e}", cleaned.rms_strain());
    println!(
        "   • Reduction: {:.1}%\n",
        (1.0 - cleaned.rms_strain() / glitchy_signal.rms_strain()) * 100.0
    );

    // ==================== PART 9: COMPLETE PIPELINE ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Part 9: Complete Processing Pipeline                      ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("🔄 Demonstrating full processing chain...\n");

    println!("   Step 1: Raw data → Glitch removal");
    let step1 = detector.remove_glitches(&noisy_signal, &glitches);
    println!("      ✓ RMS: {:.2e}\n", step1.rms_strain());

    println!("   Step 2: Clean data → Bandpass filter");
    let step2 = processor.bandpass(&step1, 0.001, 0.01);
    println!("      ✓ RMS: {:.2e}\n", step2.rms_strain());

    println!("   Step 3: Filtered data → Whitening");
    let step3 = processor.whiten(&step2);
    println!("      ✓ RMS: {:.2e}\n", step3.rms_strain());

    println!("   Step 4: Whitened data → FFT");
    let final_spectrum = processor.compute_fft(&step3);
    println!(
        "      ✓ Frequency bins: {}\n",
        final_spectrum.frequencies.len()
    );

    println!("✅ Pipeline complete! Data ready for matched filtering\n");

    // ==================== SUMMARY ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Processing Summary                                         ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("📊 TECHNIQUES DEMONSTRATED:\n");
    println!("   ✅ FFT and spectral analysis");
    println!("   ✅ Power Spectral Density estimation");
    println!("   ✅ LISA noise model");
    println!("   ✅ Whitening (noise normalization)");
    println!("   ✅ Bandpass filtering");
    println!("   ✅ Window functions");
    println!("   ✅ TDI channel combinations");
    println!("   ✅ Glitch detection and removal");
    println!("   ✅ Complete processing pipeline\n");

    println!("🚀 NEXT STEPS (Analysis Layer):\n");
    println!("   • Template bank generation");
    println!("   • Matched filtering");
    println!("   • Parameter estimation (MLE)");
    println!("   • Bayesian inference (MCMC)");
    println!("   • Source characterization\n");

    println!("📚 KEY CONCEPTS:\n");
    println!("   • Whitening → Improves matched filter SNR");
    println!("   • TDI → Cancels laser frequency noise");
    println!("   • Glitch removal → Prevents false positives");
    println!("   • Bandpass → Removes out-of-band noise");
    println!("   • PSD estimation → Characterizes detector noise\n");

    println!("══════════════════════════════════════════════════════════════");
    println!("  ARXIS: Production-Ready LISA Processing Layer");
    println!("  Contact: nicolas@avila.inc | GitHub: @avilaops/arxis");
    println!("══════════════════════════════════════════════════════════════");
}

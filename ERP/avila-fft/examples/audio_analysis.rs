use avila_fft::timefreq::*;
use std::f64::consts::PI;

fn main() {
    print_header();

    // Multi-component signal demonstration
    let (signal, sample_rate, duration) = generate_complex_signal();

    // Analyze with multiple window types
    compare_window_types(&signal, sample_rate);

    // Detailed STFT analysis
    perform_detailed_analysis(&signal, sample_rate, duration);

    // Advanced harmonic analysis
    println!("");
    detect_harmonics(&signal, sample_rate);

    // Phase coherence analysis
    println!("");
    analyze_phase_coherence(&signal, sample_rate);

    // Temporal SNR estimation
    println!("");
    estimate_temporal_snr(&signal, sample_rate);

    print_footer();
}

/// Print fancy header
fn print_header() {
    println!("╔═══════════════════════════════════════════════════════════════╗");
    println!("║        AVILA-FFT: Advanced Audio Analysis with STFT          ║");
    println!("║              Pure Rust • Zero Dependencies                    ║");
    println!("╚═══════════════════════════════════════════════════════════════╝\n");
}

/// Generate complex multi-component test signal
fn generate_complex_signal() -> (Vec<f64>, f64, f64) {
    let sample_rate = 16384.0; // Higher sample rate for better quality
    let duration = 3.0; // Longer duration
    let n_samples = (sample_rate * duration) as usize;

    println!("📊 Signal Generation");
    println!("   ├─ Sample rate: {} Hz", sample_rate);
    println!("   ├─ Duration: {} s ({} samples)", duration, n_samples);
    println!("   └─ Components:");
    println!("      ├─ Linear chirp: 200 Hz → 1500 Hz");
    println!("      ├─ Pure tone: 440 Hz (A4)");
    println!("      ├─ Harmonic: 880 Hz (A5)");
    println!("      ├─ Transient burst at t=1.0s");
    println!("      └─ FM modulation: 600±100 Hz\n");

    let signal: Vec<f64> = (0..n_samples)
        .map(|i| {
            let t = i as f64 / sample_rate;

            // 1. Linear chirp
            let f0 = 200.0;
            let f1 = 1500.0;
            let chirp_rate = (f1 - f0) / duration;
            let freq_chirp = f0 + chirp_rate * t;
            let chirp = 0.6 * (2.0 * PI * freq_chirp * t).sin();

            // 2. Fundamental tone (A4 = 440 Hz)
            let tone = 0.4 * (2.0 * PI * 440.0 * t).sin();

            // 3. First harmonic (A5 = 880 Hz)
            let harmonic = 0.2 * (2.0 * PI * 880.0 * t).sin();

            // 4. Transient burst (short impact at 1s)
            let t_burst = 1.0;
            let burst_width = 0.01;
            let burst = if (t - t_burst).abs() < 0.05 {
                0.5 * (-((t - t_burst) / burst_width).powi(2)).exp()
                    * (2.0 * PI * 2000.0 * t).sin()
            } else {
                0.0
            };

            // 5. FM modulation (vibrato effect)
            let carrier = 600.0;
            let mod_freq = 5.0; // 5 Hz modulation
            let mod_depth = 100.0; // ±100 Hz deviation
            let fm = 0.3 * (2.0 * PI * (carrier + mod_depth * (2.0 * PI * mod_freq * t).sin()) * t).sin();

            // 6. Background noise (very low level)
            let noise = 0.02 * (((i * 48271) % 2147483647) as f64 / 2147483647.0 - 0.5);

            chirp + tone + harmonic + burst + fm + noise
        })
        .collect();

    // Signal statistics
    let energy: f64 = signal.iter().map(|&s| s * s).sum();
    let rms = (energy / (n_samples as f64)).sqrt();
    let peak = signal.iter().map(|&s| s.abs()).fold(0.0, f64::max);
    let crest_factor = peak / rms;

    println!("   Signal Statistics:");
    println!("   ├─ RMS level: {:.4}", rms);
    println!("   ├─ Peak level: {:.4}", peak);
    println!("   ├─ Crest factor: {:.2} dB", 20.0 * crest_factor.log10());
    println!("   └─ Total energy: {:.2} J\n", energy);

    (signal, sample_rate, duration)
}

/// Compare different window functions
fn compare_window_types(signal: &[f64], sample_rate: f64) {
    println!("🔬 Window Function Comparison");

    let config = OverlapConfig::overlap_75(512);
    let windows = [
        (WindowType::Hann, "Hann"),
        (WindowType::Hamming, "Hamming"),
        (WindowType::Blackman, "Blackman"),
        (WindowType::BlackmanHarris, "Blackman-Harris"),
    ];

    println!("   Window Type      │ Avg Centroid │ Avg Flatness │ Frames");
    println!("   ─────────────────┼──────────────┼──────────────┼────────");

    for (window_type, name) in windows.iter() {
        let processor = StftProcessor::new(config, *window_type).unwrap();
        let spec = processor.process(signal, sample_rate).unwrap();

        let centroids = spec.spectral_centroid();
        let flatness = spec.spectral_flatness();

        let avg_centroid = centroids.iter().sum::<f64>() / centroids.len() as f64;
        let avg_flatness = flatness.iter().sum::<f64>() / flatness.len() as f64;

        println!("   {:16} │ {:8.1} Hz │   {:8.5}   │  {}",
                 name, avg_centroid, avg_flatness, spec.num_frames);
    }
    println!();
}

/// Perform detailed STFT analysis
fn perform_detailed_analysis(signal: &[f64], sample_rate: f64, _duration: f64) {
    let n_samples = signal.len();

    // STFT configuration
    let window_size = 1024; // Larger window for better frequency resolution
    let config = OverlapConfig::overlap_75(window_size);

    println!("⚙️  STFT Configuration");
    println!("   ├─ Window: Hann (optimal for general use)");
    println!("   ├─ Window size: {} samples", config.window_size);
    println!("   ├─ Hop size: {} samples", config.hop_size);
    println!("   ├─ Overlap: {:.1}%", config.overlap_percent());
    println!("   ├─ Time resolution: {:.2} ms", (config.hop_size as f64 / sample_rate) * 1000.0);
    println!("   └─ Frequency resolution: {:.2} Hz\n", sample_rate / (config.window_size as f64));

    // Process STFT
    println!("🔄 Processing STFT...");
    let start = std::time::Instant::now();
    let processor = StftProcessor::new(config, WindowType::Hann).unwrap();
    let spec = processor.process(signal, sample_rate).unwrap();
    let elapsed = start.elapsed();

    println!("   ✓ Spectrogram computed in {:.2} ms", elapsed.as_secs_f64() * 1000.0);
    println!("   ├─ Time frames: {}", spec.num_frames);
    println!("   ├─ Frequency bins: {}", spec.num_freqs);
    println!("   ├─ Data points: {}", spec.num_frames * spec.num_freqs);
    println!("   └─ Coverage: {:.2} s\n", spec.times().last().unwrap());

    // Advanced spectral analysis
    println!("📈 Advanced Spectral Features");

    let centroids = spec.spectral_centroid();
    let bandwidths = spec.spectral_bandwidth();
    let flatness = spec.spectral_flatness();
    let rolloff_85 = spec.spectral_rolloff(85.0);
    let rolloff_95 = spec.spectral_rolloff(95.0);

    let avg_centroid = centroids.iter().sum::<f64>() / centroids.len() as f64;
    let avg_bandwidth = bandwidths.iter().sum::<f64>() / bandwidths.len() as f64;
    let avg_flatness = flatness.iter().sum::<f64>() / flatness.len() as f64;
    let avg_rolloff_85 = rolloff_85.iter().sum::<f64>() / rolloff_85.len() as f64;
    let avg_rolloff_95 = rolloff_95.iter().sum::<f64>() / rolloff_95.len() as f64;

    println!("   Spectral Centroid (brightness indicator):");
    println!("   ├─ Average: {:.1} Hz", avg_centroid);
    println!("   ├─ Min: {:.1} Hz", centroids.iter().cloned().fold(f64::INFINITY, f64::min));
    println!("   ├─ Max: {:.1} Hz", centroids.iter().cloned().fold(f64::NEG_INFINITY, f64::max));
    println!("   └─ Std dev: {:.1} Hz\n",
             ((centroids.iter().map(|&c| (c - avg_centroid).powi(2)).sum::<f64>()
               / centroids.len() as f64).sqrt()));

    println!("   Spectral Bandwidth (spread around centroid):");
    println!("   ├─ Average: {:.1} Hz", avg_bandwidth);
    println!("   └─ Range: {:.1} - {:.1} Hz\n",
             bandwidths.iter().cloned().fold(f64::INFINITY, f64::min),
             bandwidths.iter().cloned().fold(f64::NEG_INFINITY, f64::max));

    println!("   Spectral Flatness (tonality measure):");
    println!("   ├─ Average: {:.5} (0=pure tone, 1=white noise)", avg_flatness);
    println!("   └─ Interpretation: {} signal\n",
             if avg_flatness < 0.1 { "Highly tonal" }
             else if avg_flatness < 0.3 { "Tonal" }
             else if avg_flatness < 0.7 { "Mixed" }
             else { "Noisy" });

    println!("   Spectral Rolloff:");
    println!("   ├─ 85% energy below: {:.1} Hz", avg_rolloff_85);
    println!("   └─ 95% energy below: {:.1} Hz\n", avg_rolloff_95);

    // Enhanced spectrogram visualization
    println!("🎨 Enhanced Spectrogram (first 60 frames)");
    visualize_spectrogram_enhanced(&spec, 60);

    // Time-varying analysis
    println!("\n📊 Time-Varying Analysis (10 snapshots)");
    analyze_time_evolution(&spec, 10);

    // Transient detection
    println!("\n⚡ Transient Detection");
    detect_transients_enhanced(&spec);

    // Frequency tracking
    println!("\n🎵 Multi-Peak Frequency Tracking");
    track_multiple_peaks(&spec, 3, 15);

    // ISTFT validation
    println!("\n✅ Perfect Reconstruction Test (ISTFT)");
    test_reconstruction(&processor, &spec, signal, n_samples, window_size);
}

/// Enhanced spectrogram visualization with color mapping
fn visualize_spectrogram_enhanced(spec: &Spectrogram<f64>, max_frames: usize) {
    let mag_db = spec.magnitude_db();
    let freqs = spec.frequencies();

    let max_freq_idx = freqs.iter()
        .position(|&f| f > 3000.0)
        .unwrap_or(spec.num_freqs)
        .min(30);

    let num_frames = spec.num_frames.min(max_frames);

    println!("   Frequency │ Time → (dB scale: █ > -10, ▓ > -20, ▒ > -30, ░ > -40)");
    println!("   ──────────┼{}", "─".repeat(num_frames));

    for freq_idx in (0..max_freq_idx).rev().step_by(1) {
        print!("   {:6.0} Hz │ ", freqs[freq_idx]);

        for frame in 0..num_frames {
            let db = mag_db[freq_idx][frame];
            let symbol = match db {
                db if db > -10.0 => '█',
                db if db > -20.0 => '▓',
                db if db > -30.0 => '▒',
                db if db > -40.0 => '░',
                db if db > -50.0 => '·',
                _ => ' ',
            };
            print!("{}", symbol);
        }
        println!();
    }
    println!("   ──────────┴{}", "─".repeat(num_frames));
}

/// Analyze spectral evolution over time
fn analyze_time_evolution(spec: &Spectrogram<f64>, num_snapshots: usize) {
    let centroids = spec.spectral_centroid();
    let bandwidths = spec.spectral_bandwidth();
    let times = spec.times();

    let step = spec.num_frames / num_snapshots.min(spec.num_frames);

    println!("   Time (s) │ Centroid (Hz) │ Bandwidth (Hz) │ Dynamics");
    println!("   ─────────┼───────────────┼────────────────┼──────────");

    for frame in (0..spec.num_frames).step_by(step.max(1)) {
        let dynamics = if centroids[frame] > 800.0 { "High" }
                      else if centroids[frame] > 500.0 { "Mid" }
                      else { "Low" };

        println!("   {:8.2} │  {:10.1}  │   {:10.1}   │ {}",
                 times[frame], centroids[frame], bandwidths[frame], dynamics);
    }
}

/// Enhanced transient detection with onset strength
fn detect_transients_enhanced(spec: &Spectrogram<f64>) {
    let power = spec.power();
    let times = spec.times();

    let mut frame_energy: Vec<f64> = Vec::new();
    for frame in 0..spec.num_frames {
        let energy: f64 = power.iter()
            .map(|row| row[frame])
            .sum();
        frame_energy.push(energy);
    }

    // Calculate onset strength (energy difference)
    let mut onset_strength: Vec<f64> = vec![0.0];
    for i in 1..frame_energy.len() {
        let diff = (frame_energy[i] - frame_energy[i - 1]).max(0.0);
        onset_strength.push(diff);
    }

    let avg_onset: f64 = onset_strength.iter().sum::<f64>() / onset_strength.len() as f64;
    let threshold = avg_onset * 3.0;

    let mut transients = Vec::new();
    for i in 1..onset_strength.len() - 1 {
        if onset_strength[i] > threshold &&
           onset_strength[i] > onset_strength[i - 1] &&
           onset_strength[i] > onset_strength[i + 1] {
            transients.push((times[i], onset_strength[i], frame_energy[i]));
        }
    }

    println!("   Detected {} transient(s):", transients.len());
    if transients.is_empty() {
        println!("   └─ No significant transients found");
    } else {
        for (idx, (time, strength, energy)) in transients.iter().enumerate().take(5) {
            println!("   {}─ t={:.3}s │ strength={:.2} │ energy={:.1}",
                     if idx == transients.len() - 1 { "└" } else { "├" },
                     time, strength, energy);
        }
    }
}

/// Track multiple frequency peaks simultaneously
fn track_multiple_peaks(spec: &Spectrogram<f64>, num_peaks: usize, num_points: usize) {
    let mag = spec.magnitude();
    let freqs = spec.frequencies();
    let times = spec.times();

    let step = spec.num_frames / num_points.min(spec.num_frames);

    println!("   Time (s) │ Peak 1 (Hz) │ Peak 2 (Hz) │ Peak 3 (Hz)");
    println!("   ─────────┼─────────────┼─────────────┼────────────");

    for frame in (0..spec.num_frames).step_by(step.max(1)) {
        // Find top N peaks
        let mut peak_indices: Vec<(usize, f64)> = mag.iter()
            .enumerate()
            .map(|(idx, row)| (idx, row[frame]))
            .collect();

        peak_indices.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

        print!("   {:8.2} │", times[frame]);
        for i in 0..num_peaks {
            if i < peak_indices.len() {
                print!(" {:9.1}  │", freqs[peak_indices[i].0]);
            } else {
                print!("     -     │");
            }
        }
        println!();
    }
}

/// Test perfect reconstruction with ISTFT
fn test_reconstruction(
    processor: &StftProcessor<f64>,
    spec: &Spectrogram<f64>,
    original: &[f64],
    n_samples: usize,
    margin: usize,
) {
    let start = std::time::Instant::now();
    let reconstructed = processor.inverse(spec).unwrap();
    let elapsed = start.elapsed();

    let mut error_sum = 0.0;
    let mut max_error: f64 = 0.0;
    let mut count = 0;

    for i in margin..(n_samples - margin).min(reconstructed.len()) {
        let error = (original[i] - reconstructed[i]).abs();
        error_sum += error * error;
        max_error = max_error.max(error);
        count += 1;
    }

    let rms_error = (error_sum / count as f64).sqrt();
    let original_rms = (original.iter().map(|&s| s * s).sum::<f64>() / n_samples as f64).sqrt();
    let snr_db = 20.0 * (original_rms / rms_error).log10();

    println!("   ├─ Reconstruction time: {:.2} ms", elapsed.as_secs_f64() * 1000.0);
    println!("   ├─ RMS error: {:.3e}", rms_error);
    println!("   ├─ Max error: {:.3e}", max_error);
    println!("   ├─ SNR: {:.1} dB", snr_db);
    println!("   └─ Quality: {}",
             if snr_db > 100.0 { "⭐ Excellent (>100 dB)" }
             else if snr_db > 60.0 { "✓ Very Good (>60 dB)" }
             else if snr_db > 40.0 { "✓ Good (>40 dB)" }
             else { "⚠ Acceptable" });
}

/// Detect harmonics in the signal
fn detect_harmonics(signal: &[f64], sample_rate: f64) {
    println!("🎼 Harmonic Analysis");

    let config = OverlapConfig::overlap_75(2048); // Larger window for better frequency resolution
    let processor = StftProcessor::new(config, WindowType::BlackmanHarris).unwrap();
    let spec = processor.process(signal, sample_rate).unwrap();

    let mag = spec.magnitude();
    let freqs = spec.frequencies();

    // Average magnitude across all frames
    let mut avg_mag: Vec<f64> = vec![0.0; spec.num_freqs];
    for freq_idx in 0..spec.num_freqs {
        let sum: f64 = mag[freq_idx].iter().sum();
        avg_mag[freq_idx] = sum / spec.num_frames as f64;
    }

    // Find peaks in the spectrum
    let mut peaks = Vec::new();
    for i in 2..avg_mag.len() - 2 {
        if avg_mag[i] > avg_mag[i-1] && avg_mag[i] > avg_mag[i+1] &&
           avg_mag[i] > avg_mag[i-2] && avg_mag[i] > avg_mag[i+2] {
            let threshold = avg_mag.iter().cloned().fold(0.0, f64::max) * 0.05;
            if avg_mag[i] > threshold {
                peaks.push((freqs[i], avg_mag[i]));
            }
        }
    }

    peaks.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    println!("   Detected {} significant frequency peaks:", peaks.len().min(10));

    if peaks.is_empty() {
        println!("   └─ No significant peaks detected");
        return;
    }

    // Display top 10 peaks
    for (idx, (freq, mag)) in peaks.iter().take(10).enumerate() {
        let note = frequency_to_note(*freq);
        println!("   {}─ {:.1} Hz ({}) │ magnitude: {:.4}",
                 if idx == peaks.len().min(10) - 1 { "└" } else { "├" },
                 freq, note, mag);
    }

    // Detect harmonic relationships
    if peaks.len() >= 2 {
        println!("\n   Harmonic Relationships:");
        let fundamental = peaks[0].0;
        let mut found_harmonics = false;

        for (idx, (freq, _)) in peaks.iter().skip(1).take(5).enumerate() {
            let ratio = freq / fundamental;
            if (ratio - ratio.round()).abs() < 0.05 {
                println!("   {}─ {:.1} Hz ≈ {}x fundamental ({:.2}x)",
                         if idx == 4 { "└" } else { "├" },
                         freq, ratio.round() as i32, ratio);
                found_harmonics = true;
            }
        }

        if !found_harmonics {
            println!("   └─ No clear harmonic relationships detected");
        }
    }
}

/// Convert frequency to musical note
fn frequency_to_note(freq: f64) -> String {
    let a4 = 440.0;
    let notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    let half_steps = 12.0 * (freq / a4).log2();
    let note_index = ((half_steps.round() as i32 + 9) % 12 + 12) % 12;
    let octave = 4 + ((half_steps.round() as i32 + 9) / 12);
    let cents = ((half_steps - half_steps.round()) * 100.0) as i32;

    if cents.abs() > 10 {
        format!("{}{} {:+}¢", notes[note_index as usize], octave, cents)
    } else {
        format!("{}{}", notes[note_index as usize], octave)
    }
}

/// Analyze phase coherence across frequency bands
fn analyze_phase_coherence(signal: &[f64], sample_rate: f64) {
    println!("🌀 Phase Coherence Analysis");

    let config = OverlapConfig::overlap_75(1024);
    let processor = StftProcessor::new(config, WindowType::Hann).unwrap();
    let spec = processor.process(signal, sample_rate).unwrap();

    let phase = spec.phase();
    let freqs = spec.frequencies();

    // Analyze phase stability over time
    let mut phase_variance: Vec<f64> = Vec::new();

    for freq_idx in 0..spec.num_freqs.min(100) { // Limit to lower frequencies
        if spec.num_frames < 2 {
            continue;
        }

        // Calculate phase differences between consecutive frames
        let mut diffs = Vec::new();
        for frame in 1..spec.num_frames {
            let mut diff = phase[freq_idx][frame] - phase[freq_idx][frame - 1];

            // Unwrap phase (handle 2π discontinuities)
            while diff > PI { diff -= 2.0 * PI; }
            while diff < -PI { diff += 2.0 * PI; }

            diffs.push(diff);
        }

        if diffs.is_empty() {
            continue;
        }

        // Calculate variance
        let mean: f64 = diffs.iter().sum::<f64>() / diffs.len() as f64;
        let variance: f64 = diffs.iter()
            .map(|&d| (d - mean).powi(2))
            .sum::<f64>() / diffs.len() as f64;

        phase_variance.push(variance);
    }

    if phase_variance.is_empty() {
        println!("   └─ Insufficient data for phase analysis");
        return;
    }

    let avg_variance = phase_variance.iter().sum::<f64>() / phase_variance.len() as f64;
    let coherence_score = (-avg_variance).exp();

    println!("   Phase Statistics:");
    println!("   ├─ Average phase variance: {:.4} rad²", avg_variance);
    println!("   ├─ Phase coherence score: {:.4} (0-1)", coherence_score);
    println!("   └─ Interpretation: {} phase stability",
             if coherence_score > 0.9 { "Excellent" }
             else if coherence_score > 0.7 { "Good" }
             else if coherence_score > 0.5 { "Moderate" }
             else { "Low" });

    // Find frequency bands with highest phase stability
    let mut indexed_variance: Vec<(usize, f64)> = phase_variance.iter()
        .enumerate()
        .map(|(i, &v)| (i, v))
        .collect();
    indexed_variance.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());

    println!("\n   Most Stable Frequency Bands:");
    for (idx, (freq_idx, variance)) in indexed_variance.iter().take(5).enumerate() {
        let stability = (-variance).exp();
        println!("   {}─ {:.1} Hz │ stability: {:.4}",
                 if idx == 4 { "└" } else { "├" },
                 freqs[*freq_idx], stability);
    }
}

/// Estimate temporal SNR (Signal-to-Noise Ratio) over time
fn estimate_temporal_snr(signal: &[f64], sample_rate: f64) {
    println!("📡 Temporal SNR Estimation");

    let config = OverlapConfig::overlap_75(1024);
    let processor = StftProcessor::new(config, WindowType::Hann).unwrap();
    let spec = processor.process(signal, sample_rate).unwrap();

    let power = spec.power();
    let times = spec.times();

    // Calculate energy per frame
    let mut frame_energy: Vec<f64> = Vec::new();
    for frame in 0..spec.num_frames {
        let energy: f64 = power.iter().map(|row| row[frame]).sum();
        frame_energy.push(energy);
    }

    if frame_energy.is_empty() {
        println!("   └─ No data available");
        return;
    }

    // Estimate noise floor (minimum energy in quiet regions)
    let mut sorted_energy = frame_energy.clone();
    sorted_energy.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let noise_floor = sorted_energy[sorted_energy.len() / 10]; // 10th percentile

    // Calculate SNR for each frame
    let snr_db: Vec<f64> = frame_energy.iter()
        .map(|&e| {
            let signal_power = (e - noise_floor).max(noise_floor * 0.01);
            10.0 * (signal_power / noise_floor).log10()
        })
        .collect();

    let avg_snr = snr_db.iter().sum::<f64>() / snr_db.len() as f64;
    let max_snr = snr_db.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let min_snr = snr_db.iter().cloned().fold(f64::INFINITY, f64::min);

    println!("   SNR Statistics:");
    println!("   ├─ Average SNR: {:.1} dB", avg_snr);
    println!("   ├─ Peak SNR: {:.1} dB", max_snr);
    println!("   ├─ Minimum SNR: {:.1} dB", min_snr);
    println!("   ├─ Dynamic range: {:.1} dB", max_snr - min_snr);
    println!("   └─ Noise floor: {:.2e} (power units)", noise_floor);

    // Show SNR evolution over time
    println!("\n   SNR Evolution (10 snapshots):");
    println!("   Time (s) │ SNR (dB) │ Signal Quality");
    println!("   ─────────┼──────────┼────────────────");

    let step = spec.num_frames / 10.min(spec.num_frames);
    for frame in (0..spec.num_frames).step_by(step.max(1)) {
        let quality = if snr_db[frame] > 40.0 { "⭐ Excellent" }
                     else if snr_db[frame] > 30.0 { "✓ Very Good" }
                     else if snr_db[frame] > 20.0 { "✓ Good" }
                     else if snr_db[frame] > 10.0 { "○ Fair" }
                     else { "⚠ Poor" };

        println!("   {:8.2} │ {:8.1} │ {}", times[frame], snr_db[frame], quality);
    }

    // Identify high-quality segments
    let high_quality_threshold = 30.0;
    let high_quality_frames: Vec<usize> = snr_db.iter()
        .enumerate()
        .filter(|(_, &snr)| snr > high_quality_threshold)
        .map(|(i, _)| i)
        .collect();

    let coverage = (high_quality_frames.len() as f64 / spec.num_frames as f64) * 100.0;
    println!("\n   High-Quality Coverage:");
    println!("   ├─ Frames above {} dB: {}/{}", high_quality_threshold,
             high_quality_frames.len(), spec.num_frames);
    println!("   └─ Coverage: {:.1}%", coverage);
}

/// Print footer
fn print_footer() {
    println!("\n╔═══════════════════════════════════════════════════════════════╗");
    println!("║                   Analysis Complete ✓                         ║");
    println!("║         avila-fft v0.1.0 • https://crates.io/crates/avila-fft ║");
    println!("╚═══════════════════════════════════════════════════════════════╝");
}

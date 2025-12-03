/// LISA Analysis Layer - Matched Filtering Example
///
/// This example demonstrates the complete matched filtering pipeline for
/// LISA gravitational wave detection:
///
/// 1. Generate synthetic MBHB signal + noise
/// 2. Create template bank
/// 3. Perform matched filtering search
/// 4. Detect and cluster events
/// 5. Extract event parameters
///
/// This showcases the **Phase 3: Analysis Layer** of the LISA pipeline.
use arxis_quaternions::physics::{
    EventCandidate, LISASource, MatchedFilter, PowerSpectralDensity, StrainTimeSeries,
    SyntheticDataGenerator, TemplateBank, TemplateParameters, WaveformTemplate,
};

fn main() {
    println!("╔═══════════════════════════════════════════════════════════════════╗");
    println!("║        LISA Analysis Layer - Matched Filtering Pipeline          ║");
    println!("║                Phase 3: Event Detection & Analysis                ║");
    println!("╚═══════════════════════════════════════════════════════════════════╝");
    println!();

    // ========================================================================
    // Part 1: Generate Synthetic MBHB Signal
    // ========================================================================
    println!("📡 Part 1: Generating Synthetic MBHB Signal");
    println!("   -------------------------------------------");

    // Signal parameters
    let m1 = 1e6; // Solar masses
    let m2 = 5e5; // Solar masses
    let distance = 3e25; // meters (~1 Gpc)
    let redshift = 1.0;

    let source = LISASource::smbh(m1, m2, distance, redshift);
    let f_gw = source.gw_frequency();
    let h_c = source.characteristic_strain();

    println!("   Source: MBHB (Massive Black Hole Binary)");
    println!("   Primary mass: {:.1e} M☉", m1);
    println!("   Secondary mass: {:.1e} M☉", m2);
    println!("   Total mass: {:.1e} M☉", m1 + m2);
    println!(
        "   Chirp mass: {:.1e} M☉",
        ((m1 * m2).powf(3.0 / 5.0)) / ((m1 + m2).powf(1.0 / 5.0))
    );
    println!(
        "   Distance: {:.1e} m ({:.1} Gpc)",
        distance,
        distance / 3.086e25
    );
    println!("   Redshift: {:.2}", redshift);
    println!("   GW frequency: {:.6} Hz", f_gw);
    println!("   Characteristic strain: {:.2e}", h_c);
    println!();

    // Generate data
    let duration = 10000.0; // seconds
    let sampling_rate = 0.1; // Hz
    let gen = SyntheticDataGenerator::new(sampling_rate, duration);

    let signal = gen.monochromatic_binary(f_gw, h_c, 0.0);
    let noise_level = 1e-22;
    let data = gen.signal_plus_noise(&signal, noise_level);

    println!(
        "   Generated {} s of data at {} Hz",
        duration, sampling_rate
    );
    println!("   Signal samples: {}", signal.h_plus.len());
    println!("   Noise level: {:.2e}", noise_level);
    println!("   Signal RMS: {:.2e}", signal.rms_strain());
    println!("   Data RMS: {:.2e}", data.rms_strain());
    println!();

    // ========================================================================
    // Part 2: Create Template Bank
    // ========================================================================
    println!("🗂️  Part 2: Creating Template Bank");
    println!("   -----------------------------------");

    let mut bank = TemplateBank::new(0.97); // 97% minimum match

    // Method A: MBHB Grid (simple m1, m2 grid)
    println!("   Method A: MBHB Mass Grid");
    bank.generate_mbhb_grid(
        (5e5, 2e6), // m1 range
        (2e5, 1e6), // m2 range
        4,          // n_m1
        4,          // n_m2
        distance,
        duration,
        sampling_rate,
    );
    println!("   Generated {} MBHB templates (mass grid)", bank.len());

    // Method B: Chirp Mass Grid (more efficient)
    let mut bank2 = TemplateBank::new(0.97);
    println!("   Method B: Chirp Mass Grid");
    bank2.generate_chirp_mass_grid(
        (1e5, 5e5), // Chirp mass range
        (0.2, 0.8), // Mass ratio range
        5,          // n_chirp
        4,          // n_ratio
        distance,
        duration,
        sampling_rate,
    );
    println!("   Generated {} templates (chirp mass grid)", bank2.len());

    // Use Method A for this example
    println!();
    println!("   Using MBHB grid with {} templates", bank.len());

    // Estimate template count
    let (est_m1, est_m2) = bank.estimate_template_count((5e5, 2e6), (2e5, 1e6));
    println!(
        "   Recommended templates: {}×{} = {}",
        est_m1,
        est_m2,
        est_m1 * est_m2
    );

    // Optimize bank
    let original_count = bank.len();
    bank.optimize(0.98);
    let optimized_count = bank.len();
    println!(
        "   Optimized: {} → {} templates ({:.1}% reduction)",
        original_count,
        optimized_count,
        100.0 * (1.0 - optimized_count as f64 / original_count as f64)
    );
    println!();

    // ========================================================================
    // Part 3: Perform Matched Filtering
    // ========================================================================
    println!("🔍 Part 3: Matched Filtering Search");
    println!("   -----------------------------------");

    // Create noise PSD
    let psd = PowerSpectralDensity::lisa_noise_model(1e-4, 0.05, 1000);
    println!("   LISA noise PSD:");
    println!("   f_min = {:.6} Hz", psd.frequencies[0]);
    println!(
        "   f_max = {:.6} Hz",
        psd.frequencies[psd.frequencies.len() - 1]
    );
    println!("   PSD at {} Hz: {:.2e} Hz⁻¹", f_gw, psd.interpolate(f_gw));
    println!();

    // Create matched filter
    let snr_threshold = 7.0; // Typical LISA threshold
    let mf = MatchedFilter::new(bank, psd.clone(), snr_threshold);

    println!("   Searching {} templates...", mf.bank.len());
    let t_start = std::time::Instant::now();
    let results = mf.search(&data);
    let t_elapsed = t_start.elapsed();

    println!(
        "   Search completed in {:.2} ms",
        t_elapsed.as_secs_f64() * 1000.0
    );
    println!(
        "   Found {} candidates above SNR = {}",
        results.len(),
        snr_threshold
    );
    println!();

    // ========================================================================
    // Part 4: Event Detection & Clustering
    // ========================================================================
    println!("🎯 Part 4: Event Detection & Clustering");
    println!("   ---------------------------------------");

    if !results.is_empty() {
        // Show top 5 candidates
        println!("   Top candidates:");
        for (i, result) in results.iter().take(5).enumerate() {
            println!(
                "   #{} SNR = {:.2}, Time = {:.1} s, Template: {}",
                i + 1,
                result.snr,
                result.time,
                result.template_id
            );
        }
        println!();

        // Cluster nearby detections
        let time_window = 100.0; // seconds
        let clustered = mf.cluster_events(&results, time_window);

        println!("   Clustering with {:.0}s window:", time_window);
        println!(
            "   {} candidates → {} clusters",
            results.len(),
            clustered.len()
        );
        println!();

        // ========================================================================
        // Part 5: Event Characterization
        // ========================================================================
        println!("📊 Part 5: Event Characterization");
        println!("   ----------------------------------");

        for (i, result) in clustered.iter().take(3).enumerate() {
            println!("   Event #{}", i + 1);
            println!("   ├─ SNR: {:.2}", result.snr);
            println!("   ├─ Detection time: {:.1} s", result.time);
            println!("   ├─ Template: {}", result.template_id);
            println!("   ├─ Recovered parameters:");
            println!("   │  ├─ M₁ = {:.2e} M☉", result.parameters.mass_1);
            println!("   │  ├─ M₂ = {:.2e} M☉", result.parameters.mass_2);
            println!("   │  ├─ Mchirp = {:.2e} M☉", result.parameters.chirp_mass);
            println!("   │  ├─ q = {:.3}", result.parameters.mass_ratio);
            println!("   │  └─ Distance = {:.2e} m", result.parameters.distance);

            // Create event candidate
            let event = EventCandidate::from_result(result, format!("LISA-EVT-{:03}", i + 1));
            println!("   ├─ Event ID: {}", event.event_id);
            println!("   ├─ False alarm prob: {:.2e}", event.false_alarm_prob);
            println!("   ├─ Confidence: {:.1}%", event.confidence * 100.0);
            println!("   └─ Significant: {}", event.is_significant(snr_threshold));
            println!();
        }

        // ========================================================================
        // Part 6: Comparison with Injected Signal
        // ========================================================================
        println!("✅ Part 6: Parameter Recovery");
        println!("   -----------------------------");

        let best = &clustered[0];
        let m1_recovered = best.parameters.mass_1;
        let m2_recovered = best.parameters.mass_2;

        let m1_error = ((m1_recovered - m1) / m1 * 100.0).abs();
        let m2_error = ((m2_recovered - m2) / m2 * 100.0).abs();

        println!("   Injected vs Recovered:");
        println!(
            "   ├─ M₁: {:.2e} → {:.2e} M☉ (Δ = {:.1}%)",
            m1, m1_recovered, m1_error
        );
        println!(
            "   ├─ M₂: {:.2e} → {:.2e} M☉ (Δ = {:.1}%)",
            m2, m2_recovered, m2_error
        );
        println!("   ├─ SNR: {:.2}", best.snr);
        println!("   └─ Template match: {}", best.template_id);
        println!();

        // Compute optimal SNR for comparison
        if let Some(template) = mf.bank.templates.iter().find(|t| t.id == best.template_id) {
            let snr_opt = mf.compute_optimal_snr(template);
            println!("   SNR comparison:");
            println!("   ├─ Measured: {:.2}", best.snr);
            println!("   ├─ Optimal: {:.2}", snr_opt);
            println!(
                "   └─ Efficiency: {:.1}%",
                (best.snr / snr_opt * 100.0).min(100.0)
            );
            println!();
        }
    } else {
        println!("   ⚠️  No candidates found above threshold!");
        println!("   This could mean:");
        println!("   - Signal too weak (increase h_c or decrease noise)");
        println!("   - Template bank doesn't cover signal parameters");
        println!("   - Threshold too high");
        println!();
    }

    // ========================================================================
    // Summary
    // ========================================================================
    println!("╔═══════════════════════════════════════════════════════════════════╗");
    println!("║                         Pipeline Summary                          ║");
    println!("╚═══════════════════════════════════════════════════════════════════╝");
    println!();
    println!("✅ Phase 0: Mathematical Kernel (Tensor, Quaternion, Relativity)");
    println!("✅ Phase 1: Input Layer (LDC data, synthetic generation)");
    println!("✅ Phase 2: Processing Layer (FFT, PSD, whitening, TDI)");
    println!("✅ Phase 3: Analysis Layer (Matched filtering, event detection) ← YOU ARE HERE");
    println!("⏳ Phase 4: Visualization (coming next)");
    println!("⏳ Phase 5: Event Catalog & Reporting");
    println!();
    println!("📈 Performance:");
    println!("   Template bank: {} templates", optimized_count);
    println!("   Search time: {:.2} ms", t_elapsed.as_secs_f64() * 1000.0);
    println!("   Detections: {} events", results.len());
    println!();
    println!("🎉 Phase 3 Complete! Next: Visualization Layer");
    println!();
}

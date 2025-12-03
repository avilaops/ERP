/// LISA Visualization Example - Complete Pipeline Visualization
///
/// This example demonstrates all visualization capabilities:
/// 1. Time series plotting (raw strain, whitened)
/// 2. Spectrograms (time-frequency analysis)
/// 3. SNR time series with event detection
/// 4. Template bank coverage
/// 5. Sky map visualization
///
/// Phase 4: Visualization Layer demonstration
use arxis_quaternions::physics::{
    EventCandidate, LISASource, MatchedFilter, PowerSpectralDensity, SNRPlot, SkyMap, Spectrogram,
    SyntheticDataGenerator, TemplateBank, TemplateBankPlot, TemplateParameters, TimeSeriesPlot,
};

fn main() {
    println!("╔═══════════════════════════════════════════════════════════════════╗");
    println!("║       LISA Visualization Layer - Complete Demonstration          ║");
    println!("║              Phase 4: Data Visualization & Analysis               ║");
    println!("╚═══════════════════════════════════════════════════════════════════╝");
    println!();

    // ========================================================================
    // Part 1: Time Series Visualization
    // ========================================================================
    println!("📊 Part 1: Time Series Plots");
    println!("   -------------------------");
    println!();

    // Generate synthetic MBHB signal
    let m1 = 1e6;
    let m2 = 5e5;
    let source = LISASource::smbh(m1, m2, 3e25, 1.0);
    let f_gw = source.gw_frequency();
    let h_c = source.characteristic_strain();

    let gen = SyntheticDataGenerator::new(0.5, 500.0); // 500s at 0.5 Hz
    let signal = gen.monochromatic_binary(f_gw, h_c, 0.0);
    let noisy_data = gen.signal_plus_noise(&signal, 1e-22);

    println!("   Signal: MBHB at f = {:.6} Hz, h_c = {:.2e}", f_gw, h_c);
    println!("   Duration: {:.0}s, Sampling: {:.1} Hz", 500.0, 0.5);
    println!();

    // Plot 1: Clean signal
    let plot1 = TimeSeriesPlot::from_strain(&signal, "MBHB Signal (Clean)");
    let downsampled = plot1.downsample(100);
    println!("{}", downsampled.to_ascii(80, 12));

    // Plot 2: Noisy data
    let plot2 = TimeSeriesPlot::from_strain(&noisy_data, "MBHB Signal + Noise");
    let downsampled2 = plot2.downsample(100);
    println!("{}", downsampled2.to_ascii(80, 12));

    // ========================================================================
    // Part 2: Spectrogram Visualization
    // ========================================================================
    println!("🎵 Part 2: Spectrogram (Time-Frequency Analysis)");
    println!("   ----------------------------------------------");
    println!();

    let spec = Spectrogram::from_strain(&noisy_data, 50, 0.5);
    println!("   Window size: 50 samples");
    println!("   Overlap: 50%");
    println!("   Time bins: {}", spec.time.len());
    println!("   Freq bins: {}", spec.frequency.len());
    println!();
    println!("{}", spec.to_ascii(70, 20));

    // ========================================================================
    // Part 3: Matched Filtering & SNR Visualization
    // ========================================================================
    println!("🔍 Part 3: SNR Time Series & Event Detection");
    println!("   ------------------------------------------");
    println!();

    // Create template bank
    let mut bank = TemplateBank::new(0.97);
    bank.generate_mbhb_grid((5e5, 2e6), (2e5, 1e6), 3, 3, 3e25, 500.0, 0.5);

    println!("   Template bank: {} templates", bank.len());

    // Run matched filtering
    let psd = PowerSpectralDensity::lisa_noise_model(1e-4, 0.05, 200);
    let mf = MatchedFilter::new(bank, psd, 7.0);

    let results = mf.search(&noisy_data);
    println!("   Candidates found: {}", results.len());
    println!();

    // Create SNR plot for best template
    if !results.is_empty() {
        let best_result = &results[0];
        println!("   Best candidate:");
        println!("   ├─ Template: {}", best_result.template_id);
        println!("   ├─ SNR: {:.2}", best_result.snr);
        println!("   └─ Time: {:.1}s", best_result.time);
        println!();

        // Get template and compute SNR time series
        if let Some(template) = mf
            .bank
            .templates
            .iter()
            .find(|t| t.id == best_result.template_id)
        {
            let snr_ts = mf.filter_single(&noisy_data, template);
            let time: Vec<f64> = (0..snr_ts.len())
                .map(|i| i as f64 / noisy_data.sampling_rate)
                .collect();

            let snr_plot = SNRPlot::new(time, snr_ts, 7.0);

            // Downsample for ASCII display
            let step = (snr_plot.time.len() / 100).max(1);
            let time_ds: Vec<f64> = snr_plot.time.iter().step_by(step).copied().collect();
            let snr_ds: Vec<f64> = snr_plot.snr.iter().step_by(step).copied().collect();

            let snr_plot_ds = SNRPlot::new(time_ds, snr_ds, 7.0);
            println!("{}", snr_plot_ds.to_ascii(80, 15));
        }
    } else {
        println!("   ⚠️  No candidates found above threshold");
        println!();
    }

    // ========================================================================
    // Part 4: Template Bank Coverage
    // ========================================================================
    println!("🗂️  Part 4: Template Bank Coverage Visualization");
    println!("   ----------------------------------------------");
    println!();

    let bank_plot = TemplateBankPlot::from_bank(&mf.bank);
    println!(
        "   Parameter space: ({}, {}) templates",
        bank_plot.m1.len(),
        bank_plot.m2.len()
    );
    println!();
    println!("{}", bank_plot.to_ascii(60, 30));

    // ========================================================================
    // Part 5: Sky Map (Event Localization)
    // ========================================================================
    println!("🌍 Part 5: Sky Map - Event Localization");
    println!("   --------------------------------------");
    println!();

    // Create event candidates
    let mut events = Vec::new();
    for (i, result) in results.iter().take(10).enumerate() {
        let event = EventCandidate::from_result(result, format!("LISA-GW-{:06}", 240120 + i));
        events.push(event);
    }

    if !events.is_empty() {
        println!("   Events to plot: {}", events.len());
        for (i, evt) in events.iter().take(5).enumerate() {
            println!(
                "   #{} {} - SNR: {:.2}, FAP: {:.2e}",
                i + 1,
                evt.event_id,
                evt.snr,
                evt.false_alarm_prob
            );
        }
        println!();

        let skymap = SkyMap::from_events(&events);
        println!("{}", skymap.to_ascii(80, 25));
    } else {
        println!("   No events to visualize");
        println!();
    }

    // ========================================================================
    // Summary & Export Information
    // ========================================================================
    println!("╔═══════════════════════════════════════════════════════════════════╗");
    println!("║                    Visualization Summary                          ║");
    println!("╚═══════════════════════════════════════════════════════════════════╝");
    println!();
    println!("✅ Phase 0: Mathematical Kernel");
    println!("✅ Phase 1: Input Layer (LDC, synthetic data)");
    println!("✅ Phase 2: Processing Layer (FFT, PSD, whitening)");
    println!("✅ Phase 3: Analysis Layer (matched filtering)");
    println!("✅ Phase 4: Visualization Layer ← YOU ARE HERE");
    println!("⏳ Phase 5: Event Catalog & Reporting (next)");
    println!();
    println!("📊 Visualization Capabilities:");
    println!("   ✓ Time series plots (strain, whitened)");
    println!("   ✓ Spectrograms (STFT-based)");
    println!("   ✓ SNR time series with peak detection");
    println!("   ✓ Template bank coverage (mass parameter space)");
    println!("   ✓ Sky maps (event localization)");
    println!();
    println!("💾 Export Options:");
    println!("   - ASCII art (terminal display) ✓");
    println!("   - Data arrays (Vec<f64>) for external plotting");
    println!("   - Future: SVG/PNG export via plotters.rs");
    println!("   - Future: Interactive web visualization");
    println!();
    println!("🔧 Integration with External Tools:");
    println!("   - Python/matplotlib: Export data via serde_json");
    println!("   - Rust plotters: Direct integration ready");
    println!("   - Web frontend: JSON API ready");
    println!();
    println!("🎉 Phase 4 Complete! Next: Event Catalog & Database");
    println!();
}

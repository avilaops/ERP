/// LISA Data Input Layer - Complete Example
///
/// Demonstrates the scientific architecture for processing LISA data:
/// 1. Official ESA data formats (LISACode, LDC)
/// 2. Synthetic data generation (Arxis simulator)
/// 3. Data validation and quality checks
/// 4. Integration with LISA mission planning
use arxis_quaternions::physics::*;
use std::path::Path;

fn main() {
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║          ARXIS - LISA Data Input Layer                    ║");
    println!("║     Scientific Architecture for Gravitational Waves        ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    // ==================== PART 1: SYNTHETIC DATA GENERATION ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Part 1: Synthetic Data Generation (Arxis Internal)        ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("🔬 SCENARIO: Generate synthetic SMBH binary waveform\n");

    // Create data generator
    let sampling_rate = 0.1; // Hz (10 second cadence - typical for LISA)
    let duration = 86400.0; // seconds (1 day observation)

    let generator = SyntheticDataGenerator::new(sampling_rate, duration);

    println!("📊 Generator Configuration:");
    println!(
        "   • Sampling rate: {} Hz ({} sec cadence)",
        sampling_rate,
        1.0 / sampling_rate
    );
    println!("   • Duration: {:.1} days", duration / 86400.0);
    println!(
        "   • Expected samples: {}\n",
        (sampling_rate * duration) as usize
    );

    // Example 1: Monochromatic binary (constant frequency)
    println!("📡 Example 1A: Monochromatic Binary");
    println!("   (e.g., galactic white dwarf binary with stable orbit)\n");

    let frequency = 0.003; // Hz (3 mHz - in LISA band)
    let amplitude = 1e-21; // Typical strain for nearby galactic binary
    let phase = 0.0;

    let mono_signal = generator.monochromatic_binary(frequency, amplitude, phase);

    println!("   Generated waveform:");
    println!("   • Frequency: {} mHz", frequency * 1000.0);
    println!("   • Amplitude: {:.2e}", amplitude);
    println!("   • Samples: {}", mono_signal.len());
    println!("   • RMS strain: {:.2e}", mono_signal.rms_strain());
    println!("   • Peak strain: {:.2e}\n", mono_signal.peak_strain());

    // Example 2: Chirping binary (inspiral)
    println!("📡 Example 1B: Chirping Binary (Inspiral)");
    println!("   (e.g., SMBH binary approaching merger)\n");

    let f_start = 0.001; // 1 mHz
    let f_end = 0.01; // 10 mHz (frequency increases during inspiral)
    let amplitude = 5e-21;

    let chirp_signal = generator.chirping_binary(f_start, f_end, amplitude);

    println!("   Generated chirp:");
    println!("   • Start frequency: {} mHz", f_start * 1000.0);
    println!("   • End frequency: {} mHz", f_end * 1000.0);
    println!("   • Amplitude: {:.2e}", amplitude);
    println!("   • Samples: {}", chirp_signal.len());
    println!("   • RMS strain: {:.2e}", chirp_signal.rms_strain());
    println!("   • Peak strain: {:.2e}\n", chirp_signal.peak_strain());

    // Example 3: Detector noise
    println!("📡 Example 1C: Detector Noise");
    println!("   (Gaussian noise simulating LISA sensitivity)\n");

    let noise_std = 1e-22; // LISA noise level at optimal frequency
    let noise = generator.gaussian_noise(noise_std);

    println!("   Generated noise:");
    println!("   • Standard deviation: {:.2e}", noise_std);
    println!("   • Samples: {}", noise.len());
    println!("   • RMS: {:.2e}", noise.rms_strain());
    println!("   • Peak: {:.2e}\n", noise.peak_strain());

    // Example 4: Signal + Noise (realistic observation)
    println!("📡 Example 1D: Signal + Noise");
    println!("   (Realistic LISA observation)\n");

    let noisy_signal = generator.signal_plus_noise(&mono_signal, noise_std);

    println!("   Signal + Noise:");
    println!("   • Signal RMS: {:.2e}", mono_signal.rms_strain());
    println!("   • Noise RMS: {:.2e}", noise_std);
    println!("   • Combined RMS: {:.2e}", noisy_signal.rms_strain());
    println!(
        "   • SNR estimate: {:.1}\n",
        mono_signal.rms_strain() / noise_std
    );

    // ==================== PART 2: LDC DATA FORMAT ====================
    println!("\n╔════════════════════════════════════════════════════════════╗");
    println!("║ Part 2: LISA Data Challenge (LDC) Format                  ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("📦 Creating LDC dataset (ESA official format)\n");

    // Generate synthetic LDC data
    let ldc_data = generator.generate_ldc_data(
        "ARXIS_SMBH_001".to_string(),
        0.003, // 3 mHz
        1e-21,
    );

    println!("{}\n", ldc_data.summary());

    // ==================== PART 3: DATA VALIDATION ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Part 3: Data Validation and Quality Checks                ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("🔍 Running validation pipeline...\n");

    let warnings = DataValidator::validate_all(&ldc_data);

    println!("Validation Results:");
    for warning in warnings {
        println!("   {}", warning);
    }
    println!();

    // ==================== PART 4: FILE I/O ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Part 4: File Input/Output                                 ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("💾 Demonstrating ASCII file format (compatible with LISACode)\n");

    // Save to ASCII file
    let output_path = Path::new("lisa_synthetic_data.txt");

    match ldc_data.to_ascii(output_path) {
        Ok(_) => {
            println!("✅ Data saved to: {}", output_path.display());
            println!("   Format: ASCII text (time, h_plus, h_cross)");
            println!("   Compatible with: LISACode, Python, MATLAB\n");

            // Try to read it back
            println!("📖 Reading data back from file...\n");

            match LDCData::from_ascii(output_path) {
                Ok(loaded_data) => {
                    println!("✅ Data loaded successfully");
                    println!("   Source: {}", loaded_data.source_id);
                    println!("   Version: {}", loaded_data.version);
                    println!("   Samples: {}", loaded_data.channel_a.len());
                    println!(
                        "   Duration: {:.1} days\n",
                        loaded_data.channel_a.duration / 86400.0
                    );
                }
                Err(e) => println!("❌ Error loading data: {}\n", e),
            }

            // Clean up
            let _ = std::fs::remove_file(output_path);
            println!("🧹 Cleaned up temporary file\n");
        }
        Err(e) => println!("❌ Error saving data: {}\n", e),
    }

    // ==================== PART 5: INTEGRATION WITH LISA MODULE ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Part 5: Integration with LISA Mission Module              ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("🔗 Connecting data input layer with LISA physics...\n");

    // Create SMBH source from LISA module
    let smbh_source = LISASource::smbh(
        1e6,  // 1 million solar masses
        5e5,  // 500,000 solar masses
        1.0,  // z=1
        0.05, // 0.05 AU separation
    );

    println!("📡 SMBH Source Properties:");
    println!("   • Type: {:?}", smbh_source.source_type);
    println!(
        "   • Masses: {:.2e} + {:.2e} M☉",
        smbh_source.mass_1, smbh_source.mass_2
    );
    println!(
        "   • GW frequency: {:.3} mHz",
        smbh_source.gw_frequency() * 1000.0
    );
    println!(
        "   • Characteristic strain: {:.2e}",
        smbh_source.characteristic_strain()
    );
    println!("   • LISA SNR: {:.1}", smbh_source.lisa_snr());
    println!();

    // Generate corresponding waveform data
    println!("🌊 Generating waveform for this source...\n");

    let source_freq = smbh_source.gw_frequency();
    let source_amplitude = smbh_source.characteristic_strain();

    let gen_1year = SyntheticDataGenerator::new(0.1, 365.25 * 86400.0); // 1 year
    let smbh_waveform = gen_1year.monochromatic_binary(source_freq, source_amplitude, 0.0);

    println!("   Generated waveform:");
    println!("   • Duration: 1 year");
    println!("   • Samples: {}", smbh_waveform.len());
    println!("   • Frequency: {:.3} mHz", source_freq * 1000.0);
    println!("   • Peak strain: {:.2e}", smbh_waveform.peak_strain());
    println!();

    // Check detectability
    let mission = LISAMission::standard();

    println!("🎯 Detectability Analysis:");
    if mission.is_detectable(&smbh_source) {
        println!("   ✅ Source IS detectable by LISA");
        println!(
            "   • SNR: {:.1} (threshold: {})",
            smbh_source.lisa_snr(),
            mission.snr_threshold
        );
        println!(
            "   • Observable cycles: {:.2e}",
            smbh_source.observable_cycles()
        );
        println!(
            "   • Time to coalescence: {:.2e} years",
            smbh_source.time_to_coalescence()
        );
    } else {
        println!("   ❌ Source is NOT detectable");
    }
    println!();

    // ==================== PART 6: SCIENTIFIC WORKFLOW ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Part 6: Complete Scientific Workflow                      ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("🔬 ARXIS SCIENTIFIC ARCHITECTURE:\n");

    println!("   📥 INPUT LAYER (This Module):");
    println!("      ├─ Official ESA formats (LISACode, LDC)");
    println!("      ├─ Synthetic data generation");
    println!("      ├─ Data validation");
    println!("      └─ File I/O (HDF5, ASCII)\n");

    println!("   ⚙️  PROCESSING LAYER (In Development):");
    println!("      ├─ Signal preprocessing");
    println!("      ├─ Noise estimation");
    println!("      ├─ Glitch removal");
    println!("      └─ Data conditioning\n");

    println!("   🔍 ANALYSIS LAYER (In Development):");
    println!("      ├─ Matched filtering");
    println!("      ├─ Parameter estimation");
    println!("      ├─ Bayesian inference");
    println!("      └─ Source characterization\n");

    println!("   📊 OUTPUT LAYER (In Development):");
    println!("      ├─ Visualization");
    println!("      ├─ Scientific plots");
    println!("      ├─ Reports and catalogs");
    println!("      └─ Publication-ready figures\n");

    // ==================== USAGE EXAMPLES ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Practical Usage Examples                                  ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("💡 USE CASE 1: Prepare data for LISA Data Challenge");
    println!("   ```rust");
    println!("   let gen = SyntheticDataGenerator::new(0.1, 31536000.0);");
    println!("   let ldc = gen.generate_ldc_data(\"SMBH_001\", 0.003, 1e-21);");
    println!("   ldc.to_ascii(Path::new(\"submission.txt\"))?;");
    println!("   ```\n");

    println!("💡 USE CASE 2: Test detection algorithms");
    println!("   ```rust");
    println!("   let signal = gen.chirping_binary(0.001, 0.01, 1e-21);");
    println!("   let noisy = gen.signal_plus_noise(&signal, 1e-22);");
    println!("   // Apply your detection algorithm here");
    println!("   ```\n");

    println!("💡 USE CASE 3: Validate external data");
    println!("   ```rust");
    println!("   let data = LDCData::from_ascii(Path::new(\"external.txt\"))?;");
    println!("   let warnings = DataValidator::validate_all(&data);");
    println!("   for w in warnings {{ println!(\"{{}}\", w); }}");
    println!("   ```\n");

    println!("💡 USE CASE 4: Generate training data for ML");
    println!("   ```rust");
    println!("   for i in 0..1000 {{");
    println!("       let f = 0.001 + i as f64 * 0.00001;");
    println!("       let signal = gen.monochromatic_binary(f, 1e-21, 0.0);");
    println!("       // Save for ML training");
    println!("   }}");
    println!("   ```\n");

    // ==================== NEXT STEPS ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Next Steps for Development                                ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("🚀 ROADMAP:\n");

    println!("   ✅ Phase 1: Input Layer (COMPLETED)");
    println!("      • Synthetic data generation");
    println!("      • LDC format support");
    println!("      • Data validation");
    println!("      • File I/O\n");

    println!("   🔄 Phase 2: Processing Layer (NEXT)");
    println!("      • FFT and spectral analysis");
    println!("      • Whitening and filtering");
    println!("      • TDI combinations (A, E, T)");
    println!("      • Glitch identification\n");

    println!("   📋 Phase 3: Analysis Layer");
    println!("      • Template bank generation");
    println!("      • Matched filtering");
    println!("      • Maximum likelihood estimation");
    println!("      • MCMC sampling (parameter estimation)\n");

    println!("   📊 Phase 4: Visualization Layer");
    println!("      • Time-frequency plots");
    println!("      • Corner plots");
    println!("      • Sky maps");
    println!("      • Publication figures\n");

    println!("   🌐 Phase 5: Integration");
    println!("      • Python bindings (PyO3)");
    println!("      • Web API");
    println!("      • Cloud deployment");
    println!("      • Real-time processing\n");

    // ==================== REFERENCES ====================
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║ Scientific References                                      ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("📚 KEY PAPERS:\n");
    println!("   [1] LISA Mission Proposal");
    println!("       arXiv:1702.00786\n");

    println!("   [2] LISA Data Challenges");
    println!("       https://lisa-ldc.lal.in2p3.fr/\n");

    println!("   [3] LISA Sensitivity Curve");
    println!("       arXiv:1803.01944\n");

    println!("   [4] TDI (Time-Delay Interferometry)");
    println!("       Living Rev. Relativity 7, 1 (2004)\n");

    println!("   [5] LISA Data Analysis");
    println!("       arXiv:1806.01772\n");

    println!("🔗 RESOURCES:\n");
    println!("   • LISA Official: https://lisa.nasa.gov/");
    println!("   • ESA LISA: https://www.cosmos.esa.int/lisa");
    println!("   • LISACode: https://gitlab.in2p3.fr/LISA/LISACode");
    println!("   • LISA Data Challenges: https://lisa-ldc.lal.in2p3.fr/");

    println!("\n══════════════════════════════════════════════════════════════");
    println!("  ARXIS: Production-Ready LISA Data Input Layer");
    println!("  Contact: nicolas@avila.inc | GitHub: @avilaops/arxis");
    println!("══════════════════════════════════════════════════════════════");
}

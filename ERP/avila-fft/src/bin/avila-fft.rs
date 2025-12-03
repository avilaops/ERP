use avila_fft::timefreq::*;
use std::env;
use std::f64::consts::PI;
use std::fs::File;
use std::io::{BufWriter, Write};

const VERSION: &str = env!("CARGO_PKG_VERSION");

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        print_usage(&args[0]);
        std::process::exit(1);
    }

    match args[1].as_str() {
        "--help" | "-h" => {
            print_usage(&args[0]);
            std::process::exit(0);
        }
        "--version" | "-v" => {
            println!("avila-fft v{}", VERSION);
            std::process::exit(0);
        }
        "analyze" => {
            if args.len() < 3 {
                eprintln!("Error: Missing input file");
                eprintln!("Usage: {} analyze <input.txt> [options]", args[0]);
                std::process::exit(1);
            }
            let input_file = &args[2];
            let config = parse_analyze_args(&args[3..]);
            run_analysis(input_file, config);
        }
        "generate" => {
            let config = parse_generate_args(&args[2..]);
            run_generate(config);
        }
        "spectrogram" => {
            if args.len() < 3 {
                eprintln!("Error: Missing input file");
                eprintln!("Usage: {} spectrogram <input.txt> [options]", args[0]);
                std::process::exit(1);
            }
            let input_file = &args[2];
            let config = parse_spectrogram_args(&args[3..]);
            run_spectrogram(input_file, config);
        }
        "benchmark" => {
            run_benchmark();
        }
        _ => {
            eprintln!("Error: Unknown command '{}'", args[1]);
            eprintln!("Run '{} --help' for usage information", args[0]);
            std::process::exit(1);
        }
    }
}

fn print_usage(program: &str) {
    println!("avila-fft v{} - Professional FFT & STFT Analysis Tool", VERSION);
    println!("Pure Rust • Zero Dependencies • Production Ready\n");
    println!("USAGE:");
    println!("    {} <COMMAND> [OPTIONS]\n", program);
    println!("COMMANDS:");
    println!("    analyze        Analyze signal from text file (one sample per line)");
    println!("    generate       Generate test signals and save to file");
    println!("    spectrogram    Compute STFT spectrogram and export data");
    println!("    benchmark      Run performance benchmarks");
    println!("    --help, -h     Display this help message");
    println!("    --version, -v  Display version information\n");
    println!("ANALYZE OPTIONS:");
    println!("    --sample-rate <Hz>      Sample rate (default: 16384.0)");
    println!("    --window-size <N>       Window size for STFT (default: 1024)");
    println!("    --overlap <percent>     Overlap percentage (default: 75)");
    println!("    --window <type>         Window type: hann, hamming, blackman, blackman-harris");
    println!("    --export <path>         Export results to CSV file");
    println!("    --no-display            Don't display visualizations");
    println!("    --harmonics             Enable harmonic analysis");
    println!("    --phase                 Enable phase coherence analysis");
    println!("    --snr                   Enable temporal SNR estimation\n");
    println!("GENERATE OPTIONS:");
    println!("    --output <path>         Output file path (default: signal.txt)");
    println!("    --type <type>           Signal type: chirp, tone, noise, impulse, sweep");
    println!("    --duration <sec>        Duration in seconds (default: 1.0)");
    println!("    --sample-rate <Hz>      Sample rate (default: 16384.0)");
    println!("    --frequency <Hz>        Frequency for tone/chirp (default: 440.0)");
    println!("    --end-freq <Hz>         End frequency for chirp (default: 1000.0)\n");
    println!("SPECTROGRAM OPTIONS:");
    println!("    --sample-rate <Hz>      Sample rate (default: 16384.0)");
    println!("    --window-size <N>       Window size (default: 1024)");
    println!("    --overlap <percent>     Overlap percentage (default: 75)");
    println!("    --window <type>         Window type (default: hann)");
    println!("    --export <path>         Export spectrogram to CSV");
    println!("    --format <type>         Export format: csv, magnitude, power, phase, db");
    println!("    --max-freq <Hz>         Maximum frequency to export (default: Nyquist)\n");
    println!("EXAMPLES:");
    println!("    {} generate --type chirp --duration 2.0 --output test.txt", program);
    println!("    {} analyze test.txt --harmonics --export results.csv", program);
    println!("    {} spectrogram input.txt --format db --export spec.csv", program);
    println!("    {} benchmark", program);
}

#[derive(Debug)]
struct AnalyzeConfig {
    sample_rate: f64,
    window_size: usize,
    overlap_percent: f64,
    window_type: WindowType,
    export_path: Option<String>,
    display: bool,
    harmonics: bool,
    phase: bool,
    snr: bool,
}

impl Default for AnalyzeConfig {
    fn default() -> Self {
        Self {
            sample_rate: 16384.0,
            window_size: 1024,
            overlap_percent: 75.0,
            window_type: WindowType::Hann,
            export_path: None,
            display: true,
            harmonics: false,
            phase: false,
            snr: false,
        }
    }
}

#[derive(Debug)]
struct GenerateConfig {
    output_path: String,
    signal_type: String,
    duration: f64,
    sample_rate: f64,
    frequency: f64,
    end_frequency: f64,
}

impl Default for GenerateConfig {
    fn default() -> Self {
        Self {
            output_path: "signal.txt".to_string(),
            signal_type: "tone".to_string(),
            duration: 1.0,
            sample_rate: 16384.0,
            frequency: 440.0,
            end_frequency: 1000.0,
        }
    }
}

#[derive(Debug)]
struct SpectrogramConfig {
    sample_rate: f64,
    window_size: usize,
    overlap_percent: f64,
    window_type: WindowType,
    export_path: Option<String>,
    format: String,
    max_frequency: Option<f64>,
}

impl Default for SpectrogramConfig {
    fn default() -> Self {
        Self {
            sample_rate: 16384.0,
            window_size: 1024,
            overlap_percent: 75.0,
            window_type: WindowType::Hann,
            export_path: None,
            format: "magnitude".to_string(),
            max_frequency: None,
        }
    }
}

fn parse_analyze_args(args: &[String]) -> AnalyzeConfig {
    let mut config = AnalyzeConfig::default();
    let mut i = 0;

    while i < args.len() {
        match args[i].as_str() {
            "--sample-rate" => {
                i += 1;
                if i < args.len() {
                    config.sample_rate = args[i].parse().unwrap_or(config.sample_rate);
                }
            }
            "--window-size" => {
                i += 1;
                if i < args.len() {
                    config.window_size = args[i].parse().unwrap_or(config.window_size);
                }
            }
            "--overlap" => {
                i += 1;
                if i < args.len() {
                    config.overlap_percent = args[i].parse().unwrap_or(config.overlap_percent);
                }
            }
            "--window" => {
                i += 1;
                if i < args.len() {
                    config.window_type = match args[i].as_str() {
                        "hann" => WindowType::Hann,
                        "hamming" => WindowType::Hamming,
                        "blackman" => WindowType::Blackman,
                        "blackman-harris" => WindowType::BlackmanHarris,
                        _ => config.window_type,
                    };
                }
            }
            "--export" => {
                i += 1;
                if i < args.len() {
                    config.export_path = Some(args[i].clone());
                }
            }
            "--no-display" => {
                config.display = false;
            }
            "--harmonics" => {
                config.harmonics = true;
            }
            "--phase" => {
                config.phase = true;
            }
            "--snr" => {
                config.snr = true;
            }
            _ => {}
        }
        i += 1;
    }

    config
}

fn parse_generate_args(args: &[String]) -> GenerateConfig {
    let mut config = GenerateConfig::default();
    let mut i = 0;

    while i < args.len() {
        match args[i].as_str() {
            "--output" => {
                i += 1;
                if i < args.len() {
                    config.output_path = args[i].clone();
                }
            }
            "--type" => {
                i += 1;
                if i < args.len() {
                    config.signal_type = args[i].clone();
                }
            }
            "--duration" => {
                i += 1;
                if i < args.len() {
                    config.duration = args[i].parse().unwrap_or(config.duration);
                }
            }
            "--sample-rate" => {
                i += 1;
                if i < args.len() {
                    config.sample_rate = args[i].parse().unwrap_or(config.sample_rate);
                }
            }
            "--frequency" => {
                i += 1;
                if i < args.len() {
                    config.frequency = args[i].parse().unwrap_or(config.frequency);
                }
            }
            "--end-freq" => {
                i += 1;
                if i < args.len() {
                    config.end_frequency = args[i].parse().unwrap_or(config.end_frequency);
                }
            }
            _ => {}
        }
        i += 1;
    }

    config
}

fn parse_spectrogram_args(args: &[String]) -> SpectrogramConfig {
    let mut config = SpectrogramConfig::default();
    let mut i = 0;

    while i < args.len() {
        match args[i].as_str() {
            "--sample-rate" => {
                i += 1;
                if i < args.len() {
                    config.sample_rate = args[i].parse().unwrap_or(config.sample_rate);
                }
            }
            "--window-size" => {
                i += 1;
                if i < args.len() {
                    config.window_size = args[i].parse().unwrap_or(config.window_size);
                }
            }
            "--overlap" => {
                i += 1;
                if i < args.len() {
                    config.overlap_percent = args[i].parse().unwrap_or(config.overlap_percent);
                }
            }
            "--window" => {
                i += 1;
                if i < args.len() {
                    config.window_type = match args[i].as_str() {
                        "hann" => WindowType::Hann,
                        "hamming" => WindowType::Hamming,
                        "blackman" => WindowType::Blackman,
                        "blackman-harris" => WindowType::BlackmanHarris,
                        _ => config.window_type,
                    };
                }
            }
            "--export" => {
                i += 1;
                if i < args.len() {
                    config.export_path = Some(args[i].clone());
                }
            }
            "--format" => {
                i += 1;
                if i < args.len() {
                    config.format = args[i].clone();
                }
            }
            "--max-freq" => {
                i += 1;
                if i < args.len() {
                    config.max_frequency = args[i].parse().ok();
                }
            }
            _ => {}
        }
        i += 1;
    }

    config
}

fn load_signal(path: &str) -> Result<Vec<f64>, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let signal: Result<Vec<f64>, _> = content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.trim().parse::<f64>())
        .collect();

    signal.map_err(|e| format!("Failed to parse signal data: {}", e))
}

fn run_analysis(input_file: &str, config: AnalyzeConfig) {
    println!("═══════════════════════════════════════════════════════════════");
    println!("  AVILA-FFT Professional Signal Analysis v{}", VERSION);
    println!("═══════════════════════════════════════════════════════════════\n");

    // Load signal
    println!("📂 Loading signal from: {}", input_file);
    let signal = match load_signal(input_file) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("❌ Error: {}", e);
            std::process::exit(1);
        }
    };

    let n_samples = signal.len();
    let duration = n_samples as f64 / config.sample_rate;

    println!("   ✓ Loaded {} samples", n_samples);
    println!("   • Sample rate: {} Hz", config.sample_rate);
    println!("   • Duration: {:.3} s", duration);
    println!("   • Peak amplitude: {:.6}", signal.iter().map(|&x| x.abs()).fold(0.0, f64::max));
    println!("   • RMS level: {:.6}\n", (signal.iter().map(|&x| x * x).sum::<f64>() / n_samples as f64).sqrt());

    // STFT configuration
    let hop_size = (config.window_size as f64 * (1.0 - config.overlap_percent / 100.0)) as usize;
    let overlap_config = OverlapConfig::new(config.window_size, hop_size)
        .expect("Invalid overlap configuration");

    println!("⚙️  STFT Configuration:");
    println!("   • Window: {:?}", config.window_type);
    println!("   • Window size: {} samples", config.window_size);
    println!("   • Hop size: {} samples", hop_size);
    println!("   • Overlap: {:.1}%", config.overlap_percent);
    println!("   • Time resolution: {:.2} ms", (hop_size as f64 / config.sample_rate) * 1000.0);
    println!("   • Frequency resolution: {:.2} Hz\n", config.sample_rate / config.window_size as f64);

    // Process STFT
    println!("🔄 Processing STFT...");
    let start = std::time::Instant::now();
    let processor = StftProcessor::new(overlap_config, config.window_type)
        .expect("Failed to create STFT processor");
    let spec = processor.process(&signal, config.sample_rate)
        .expect("Failed to process STFT");
    let elapsed = start.elapsed();

    println!("   ✓ Completed in {:.2} ms", elapsed.as_secs_f64() * 1000.0);
    println!("   • Frames: {}", spec.num_frames);
    println!("   • Frequency bins: {}", spec.num_freqs);
    println!("   • Data points: {}\n", spec.num_frames * spec.num_freqs);

    // Spectral analysis
    println!("📊 Spectral Features:");
    let centroids = spec.spectral_centroid();
    let bandwidths = spec.spectral_bandwidth();
    let flatness = spec.spectral_flatness();

    let avg_centroid = centroids.iter().sum::<f64>() / centroids.len() as f64;
    let avg_bandwidth = bandwidths.iter().sum::<f64>() / bandwidths.len() as f64;
    let avg_flatness = flatness.iter().sum::<f64>() / flatness.len() as f64;

    println!("   • Spectral Centroid: {:.1} Hz (avg)", avg_centroid);
    println!("   • Spectral Bandwidth: {:.1} Hz (avg)", avg_bandwidth);
    println!("   • Spectral Flatness: {:.5} (avg)", avg_flatness);
    println!("   • Interpretation: {}",
             if avg_flatness < 0.1 { "Highly tonal" }
             else if avg_flatness < 0.3 { "Tonal" }
             else { "Noisy/Complex" });

    // Optional analyses
    if config.harmonics {
        println!("\n🎼 Harmonic Analysis:");
        detect_harmonics_cli(&spec);
    }

    if config.phase {
        println!("\n🌀 Phase Coherence:");
        analyze_phase_cli(&spec);
    }

    if config.snr {
        println!("\n📡 Temporal SNR:");
        analyze_snr_cli(&spec);
    }

    // Export if requested
    if let Some(export_path) = config.export_path {
        println!("\n💾 Exporting results to: {}", export_path);
        export_analysis(&spec, &export_path, &signal, config.sample_rate)
            .unwrap_or_else(|e| {
                eprintln!("⚠  Warning: Failed to export: {}", e);
            });
        println!("   ✓ Export completed");
    }

    println!("\n═══════════════════════════════════════════════════════════════");
    println!("  ✓ Analysis Complete");
    println!("═══════════════════════════════════════════════════════════════");
}

fn detect_harmonics_cli(spec: &Spectrogram<f64>) {
    let mag = spec.magnitude();
    let freqs = spec.frequencies();

    let mut avg_mag: Vec<f64> = vec![0.0; spec.num_freqs];
    for freq_idx in 0..spec.num_freqs {
        avg_mag[freq_idx] = mag[freq_idx].iter().sum::<f64>() / spec.num_frames as f64;
    }

    let mut peaks = Vec::new();
    for i in 2..avg_mag.len() - 2 {
        if avg_mag[i] > avg_mag[i-1] && avg_mag[i] > avg_mag[i+1] {
            let threshold = avg_mag.iter().cloned().fold(0.0, f64::max) * 0.05;
            if avg_mag[i] > threshold {
                peaks.push((freqs[i], avg_mag[i]));
            }
        }
    }

    peaks.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    println!("   • Detected {} peaks", peaks.len());
    for (i, (freq, _)) in peaks.iter().take(5).enumerate() {
        println!("     {}. {:.1} Hz", i + 1, freq);
    }
}

fn analyze_phase_cli(spec: &Spectrogram<f64>) {
    let phase = spec.phase();
    let mut phase_variance = Vec::new();

    for freq_idx in 0..spec.num_freqs.min(100) {
        if spec.num_frames < 2 { continue; }

        let mut diffs = Vec::new();
        for frame in 1..spec.num_frames {
            let mut diff = phase[freq_idx][frame] - phase[freq_idx][frame - 1];
            while diff > PI { diff -= 2.0 * PI; }
            while diff < -PI { diff += 2.0 * PI; }
            diffs.push(diff);
        }

        if !diffs.is_empty() {
            let mean = diffs.iter().sum::<f64>() / diffs.len() as f64;
            let variance = diffs.iter().map(|&d| (d - mean).powi(2)).sum::<f64>() / diffs.len() as f64;
            phase_variance.push(variance);
        }
    }

    if !phase_variance.is_empty() {
        let avg_variance = phase_variance.iter().sum::<f64>() / phase_variance.len() as f64;
        let coherence = (-avg_variance).exp();
        println!("   • Phase variance: {:.4} rad²", avg_variance);
        println!("   • Coherence score: {:.4}", coherence);
        println!("   • Stability: {}",
                 if coherence > 0.9 { "Excellent" }
                 else if coherence > 0.7 { "Good" }
                 else { "Low" });
    }
}

fn analyze_snr_cli(spec: &Spectrogram<f64>) {
    let power = spec.power();
    let mut frame_energy: Vec<f64> = Vec::new();

    for frame in 0..spec.num_frames {
        frame_energy.push(power.iter().map(|row| row[frame]).sum());
    }

    let mut sorted = frame_energy.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let noise_floor = sorted[sorted.len() / 10];

    let snr: Vec<f64> = frame_energy.iter()
        .map(|&e| 10.0 * ((e - noise_floor).max(noise_floor * 0.01) / noise_floor).log10())
        .collect();

    let avg_snr = snr.iter().sum::<f64>() / snr.len() as f64;
    let max_snr = snr.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

    println!("   • Average SNR: {:.1} dB", avg_snr);
    println!("   • Peak SNR: {:.1} dB", max_snr);
    println!("   • Dynamic range: {:.1} dB", max_snr - avg_snr);
}

fn export_analysis(spec: &Spectrogram<f64>, path: &str, signal: &[f64], sample_rate: f64) -> Result<(), String> {
    let file = File::create(path).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(file);

    // Write metadata
    writeln!(writer, "# AVILA-FFT Analysis Results").map_err(|e| e.to_string())?;
    writeln!(writer, "# Sample Rate: {} Hz", sample_rate).map_err(|e| e.to_string())?;
    writeln!(writer, "# Samples: {}", signal.len()).map_err(|e| e.to_string())?;
    writeln!(writer, "# Frames: {}", spec.num_frames).map_err(|e| e.to_string())?;
    writeln!(writer, "# Frequency Bins: {}", spec.num_freqs).map_err(|e| e.to_string())?;
    writeln!(writer, "").map_err(|e| e.to_string())?;

    // Write spectral features
    writeln!(writer, "time_sec,centroid_hz,bandwidth_hz,flatness").map_err(|e| e.to_string())?;

    let times = spec.times();
    let centroids = spec.spectral_centroid();
    let bandwidths = spec.spectral_bandwidth();
    let flatness = spec.spectral_flatness();

    for i in 0..spec.num_frames {
        writeln!(writer, "{:.6},{:.2},{:.2},{:.6}",
                 times[i], centroids[i], bandwidths[i], flatness[i])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn run_generate(config: GenerateConfig) {
    println!("═══════════════════════════════════════════════════════════════");
    println!("  AVILA-FFT Signal Generator v{}", VERSION);
    println!("═══════════════════════════════════════════════════════════════\n");

    println!("⚙️  Configuration:");
    println!("   • Signal type: {}", config.signal_type);
    println!("   • Duration: {} s", config.duration);
    println!("   • Sample rate: {} Hz", config.sample_rate);
    if config.signal_type == "tone" || config.signal_type == "chirp" {
        println!("   • Frequency: {} Hz", config.frequency);
    }
    if config.signal_type == "chirp" {
        println!("   • End frequency: {} Hz", config.end_frequency);
    }

    let n_samples = (config.sample_rate * config.duration) as usize;
    println!("   • Samples: {}\n", n_samples);

    println!("🎵 Generating signal...");
    let signal: Vec<f64> = (0..n_samples)
        .map(|i| {
            let t = i as f64 / config.sample_rate;
            match config.signal_type.as_str() {
                "tone" => (2.0 * PI * config.frequency * t).sin(),
                "chirp" => {
                    let rate = (config.end_frequency - config.frequency) / config.duration;
                    let freq = config.frequency + rate * t;
                    (2.0 * PI * freq * t).sin()
                }
                "noise" => (((i * 48271) % 2147483647) as f64 / 2147483647.0 - 0.5) * 2.0,
                "impulse" => if i == n_samples / 2 { 1.0 } else { 0.0 },
                "sweep" => (2.0 * PI * config.frequency * t +
                           PI * (config.end_frequency - config.frequency) / config.duration * t * t).sin(),
                _ => 0.0,
            }
        })
        .collect();

    println!("   ✓ Generated {} samples", signal.len());

    println!("\n💾 Saving to: {}", config.output_path);
    match save_signal(&signal, &config.output_path) {
        Ok(_) => println!("   ✓ Saved successfully"),
        Err(e) => {
            eprintln!("❌ Error: {}", e);
            std::process::exit(1);
        }
    }

    println!("\n═══════════════════════════════════════════════════════════════");
    println!("  ✓ Generation Complete");
    println!("═══════════════════════════════════════════════════════════════");
}

fn save_signal(signal: &[f64], path: &str) -> Result<(), String> {
    let file = File::create(path).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(file);

    for &sample in signal {
        writeln!(writer, "{}", sample).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn run_spectrogram(input_file: &str, config: SpectrogramConfig) {
    println!("═══════════════════════════════════════════════════════════════");
    println!("  AVILA-FFT Spectrogram Export v{}", VERSION);
    println!("═══════════════════════════════════════════════════════════════\n");

    println!("📂 Loading signal from: {}", input_file);
    let signal = match load_signal(input_file) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("❌ Error: {}", e);
            std::process::exit(1);
        }
    };

    println!("   ✓ Loaded {} samples\n", signal.len());

    let hop_size = (config.window_size as f64 * (1.0 - config.overlap_percent / 100.0)) as usize;
    let overlap_config = OverlapConfig::new(config.window_size, hop_size)
        .expect("Invalid overlap configuration");

    println!("🔄 Computing spectrogram...");
    let processor = StftProcessor::new(overlap_config, config.window_type)
        .expect("Failed to create STFT processor");
    let spec = processor.process(&signal, config.sample_rate)
        .expect("Failed to process STFT");

    println!("   ✓ {} frames × {} frequencies\n", spec.num_frames, spec.num_freqs);

    if let Some(ref export_path) = config.export_path {
        println!("💾 Exporting to: {}", export_path);
        match export_spectrogram(&spec, export_path, &config) {
            Ok(_) => println!("   ✓ Export completed"),
            Err(e) => {
                eprintln!("❌ Error: {}", e);
                std::process::exit(1);
            }
        }
    }

    println!("\n═══════════════════════════════════════════════════════════════");
    println!("  ✓ Spectrogram Export Complete");
    println!("═══════════════════════════════════════════════════════════════");
}

fn export_spectrogram(spec: &Spectrogram<f64>, path: &str, config: &SpectrogramConfig) -> Result<(), String> {
    let file = File::create(path).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(file);

    let data = match config.format.as_str() {
        "magnitude" => spec.magnitude(),
        "power" => spec.power(),
        "phase" => spec.phase(),
        "db" => spec.magnitude_db(),
        _ => spec.magnitude(),
    };

    let freqs = spec.frequencies();
    let times = spec.times();

    // Determine frequency range
    let max_freq_idx = if let Some(max_f) = config.max_frequency {
        freqs.iter().position(|&f| f > max_f).unwrap_or(spec.num_freqs)
    } else {
        spec.num_freqs
    };

    // Write header
    write!(writer, "frequency_hz").map_err(|e| e.to_string())?;
    for &t in &times {
        write!(writer, ",t_{:.6}", t).map_err(|e| e.to_string())?;
    }
    writeln!(writer).map_err(|e| e.to_string())?;

    // Write data
    for freq_idx in 0..max_freq_idx {
        write!(writer, "{:.2}", freqs[freq_idx]).map_err(|e| e.to_string())?;
        for frame in 0..spec.num_frames {
            write!(writer, ",{:.6}", data[freq_idx][frame]).map_err(|e| e.to_string())?;
        }
        writeln!(writer).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn run_benchmark() {
    println!("═══════════════════════════════════════════════════════════════");
    println!("  AVILA-FFT Performance Benchmark v{}", VERSION);
    println!("═══════════════════════════════════════════════════════════════\n");

    let sizes = [256, 512, 1024, 2048, 4096, 8192];
    let durations = [1.0, 2.0, 5.0];

    println!("📊 FFT Performance:");
    println!("   Size    │  Forward  │  Inverse  │  Total");
    println!("   ────────┼───────────┼───────────┼───────────");

    for &size in &sizes {
        let signal: Vec<f64> = (0..size).map(|i| (2.0 * PI * 440.0 * i as f64 / 16384.0).sin()).collect();

        use avila_fft::*;
        let planner = FftPlanner::new(size, false).unwrap();

        let start = std::time::Instant::now();
        let mut complex: Vec<Complex<f64>> = signal.iter().map(|&x| Complex::new(x, 0.0)).collect();
        planner.process(&mut complex);
        let forward = start.elapsed();

        let start = std::time::Instant::now();
        let planner_inv = FftPlanner::new(size, true).unwrap();
        planner_inv.process(&mut complex);
        let inverse = start.elapsed();

        println!("   {:6}  │ {:7.2} ms │ {:7.2} ms │ {:7.2} ms",
                 size,
                 forward.as_secs_f64() * 1000.0,
                 inverse.as_secs_f64() * 1000.0,
                 (forward + inverse).as_secs_f64() * 1000.0);
    }

    println!("\n📈 STFT Performance:");
    println!("   Duration │ Window │  Process  │  Inverse  │  Frames");
    println!("   ─────────┼────────┼───────────┼───────────┼─────────");

    for &dur in &durations {
        let sample_rate = 16384.0;
        let n_samples = (sample_rate * dur) as usize;
        let signal: Vec<f64> = (0..n_samples).map(|i| (2.0 * PI * 440.0 * i as f64 / sample_rate).sin()).collect();

        let window_size = 1024;
        let config = OverlapConfig::overlap_75(window_size);
        let processor = StftProcessor::new(config, WindowType::Hann).unwrap();

        let start = std::time::Instant::now();
        let spec = processor.process(&signal, sample_rate).unwrap();
        let process_time = start.elapsed();

        let start = std::time::Instant::now();
        let _ = processor.inverse(&spec).unwrap();
        let inverse_time = start.elapsed();

        println!("   {:6.1} s │  {:4}  │ {:7.2} ms │ {:7.2} ms │  {:5}",
                 dur,
                 window_size,
                 process_time.as_secs_f64() * 1000.0,
                 inverse_time.as_secs_f64() * 1000.0,
                 spec.num_frames);
    }

    println!("\n═══════════════════════════════════════════════════════════════");
    println!("  ✓ Benchmark Complete");
    println!("═══════════════════════════════════════════════════════════════");
}

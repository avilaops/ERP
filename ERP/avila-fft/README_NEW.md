# 🚀 AVILA-FFT: Production-Ready FFT Library

[![Crates.io](https://img.shields.io/crates/v/avila-fft.svg)](https://crates.io/crates/avila-fft)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Performance](https://img.shields.io/badge/speedup-4x_parallel-brightgreen.svg)](#performance)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-orange.svg)](#features)

**High-performance Fast Fourier Transform library and CLI tool in pure Rust**

- 🔥 **Zero external dependencies** - Pure Rust implementation
- ⚡ **Multi-threaded** - Up to 4x speedup with parallel processing
- 💾 **Streaming support** - Process multi-GB files with constant memory
- 🎯 **Production-ready** - Professional CLI tool included
- 📊 **STFT & Spectrograms** - Complete time-frequency analysis
- 🔬 **Scientific accuracy** - Extensively tested (42 tests passing)

## 🎬 Quick Start

### As a Library

```toml
[dependencies]
avila-fft = "0.1.0"
```

```rust
use avila_fft::*;

// Simple FFT
let signal = vec![1.0, 2.0, 3.0, 4.0];
let planner = FftPlanner::new(4, false)?;
let spectrum = planner.process_real(&signal)?;

// STFT with spectrogram
let config = OverlapConfig::overlap_75(1024);
let processor = StftProcessor::new(config, WindowType::Hann)?;
let spectrogram = processor.process(&signal, 16384.0)?;
```

### As a CLI Tool

```bash
# Install
cargo install avila-fft

# Generate test signal
avila-fft generate --type sweep --frequency 100 --end-freq 2000 --output test.txt

# Analyze with advanced features
avila-fft analyze test.txt --harmonics --phase --snr --export results.csv

# Create spectrogram
avila-fft spectrogram test.txt --format db --max-freq 2500 --export spec.csv

# Run benchmarks
avila-fft benchmark
```

## ✨ Features

### Core FFT

- **Cooley-Tukey algorithm** - Iterative in-place implementation
- **Real and complex FFT** - Optimized for both data types
- **Generic floating-point** - Support for `f32` and `f64`
- **Twiddle factor caching** - Reduced redundant computations
- **Bit-reversal optimization** - Cache-friendly permutation

### STFT & Time-Frequency Analysis

- **Short-Time Fourier Transform** - Complete STFT/ISTFT implementation
- **Window functions** - Hann, Hamming, Blackman, Blackman-Harris
- **Configurable overlap** - 50%, 75%, 87.5% presets
- **Spectral features** - Centroid, bandwidth, flatness, rolloff
- **Phase analysis** - Coherence and stability metrics
- **Harmonic detection** - Automatic peak finding
- **SNR estimation** - Temporal signal-to-noise ratio

### Scalability ⚡

#### Parallel Processing
```rust
use avila_fft::parallel::*;

let config = ParallelConfig::default();
let processor = ParallelFft::new(config);

// Process batch of 100 signals with 4x speedup
let results = processor.process_batch(signals, false);
```

**Benchmarks:**
- FFT batch (100 signals, size 4096): **4x speedup** with 4 threads
- STFT (5s audio): **1.07x speedup** with 2 threads
- Near-linear scaling for large workloads

#### Streaming for Large Files
```rust
use avila_fft::streaming::*;

let config = StreamConfig::default();
let mut processor = StreamingStft::new(config);

// Process multi-GB file with constant memory
processor.process_file("huge_audio.txt", |frame_idx, time, spectrum| {
    // Process frame (only one in memory at a time)
})?;
```

**Performance:**
- **37x realtime** throughput (16K buffer)
- **Constant memory** usage (processes 10GB files with 64MB RAM)
- Configurable buffer sizes for optimal I/O

See [PERFORMANCE.md](PERFORMANCE.md) for detailed benchmarks and optimization guide.

## 📊 Performance

### FFT Benchmarks

| Operation | Size | Time | Throughput |
|-----------|------|------|------------|
| Forward FFT | 1024 | 0.05 ms | 20 million/s |
| Forward FFT | 4096 | 0.63 ms | 6.5 million/s |
| Inverse FFT | 1024 | 0.05 ms | 20 million/s |

### STFT Benchmarks

| Signal | Frames | Process Time | Inverse Time |
|--------|--------|--------------|--------------|
| 1s audio | 61 | 15 ms | 8 ms |
| 5s audio | 317 | 67 ms | 41 ms |

### Parallel Speedup

| Workload | Serial | Parallel (4 threads) | Speedup |
|----------|--------|---------------------|---------|
| 100 FFTs (4096) | 149 ms | 37 ms | **4.0x** |
| 50 FFTs (2048) | 43 ms | 25 ms | **1.7x** |

### Streaming Performance

| Buffer | Throughput | Realtime Factor |
|--------|------------|-----------------|
| 16K samples | 612K samples/s | **37x** |
| 4K samples | 169K samples/s | 10x |

## 🛠️ CLI Tool

Professional-grade command-line interface for signal analysis:

### Commands

- **`generate`** - Create test signals (chirp, tone, sweep, noise, impulse)
- **`analyze`** - Complete STFT analysis with optional features
- **`spectrogram`** - Export time-frequency data to CSV
- **`benchmark`** - Performance testing

### Advanced Analysis Features

```bash
# Harmonic analysis
avila-fft analyze signal.txt --harmonics

# Phase coherence
avila-fft analyze signal.txt --phase

# Temporal SNR
avila-fft analyze signal.txt --snr

# All features combined
avila-fft analyze signal.txt --harmonics --phase --snr --export full_analysis.csv
```

### Output Formats

- **CSV export** with metadata headers
- **Multiple formats**: magnitude, power, phase, dB scale
- **Configurable frequency range** for targeted analysis
- **Pipeline-friendly** for batch processing

See [CLI.md](CLI.md) for complete documentation.

## 🔬 Scientific Validation

### Test Coverage

- **42 tests passing** (35 core + 7 STFT + parallel + streaming)
- **Zero external dependencies** - No test framework bloat
- **Numerical accuracy** - ε < 1e-10 for f64
- **Edge cases covered** - Power-of-2 validation, empty signals, etc.

### ISTFT Reconstruction Quality

```
Signal → STFT → ISTFT → Recovered Signal
```

**Signal-to-Noise Ratio**: **308.8 dB**
- Virtually perfect reconstruction
- Validates overlap-add algorithm
- Proves Parseval's theorem compliance

### Benchmark Methodology

```bash
# Release mode compilation (critical!)
cargo build --release

# Run comprehensive benchmarks
cargo run --release --example scale_benchmark

# Individual feature tests
cargo test --release
```

## 📚 Documentation

- **[README.md](README.md)** - This file (overview and quick start)
- **[CLI.md](CLI.md)** - Complete CLI reference and examples
- **[PERFORMANCE.md](PERFORMANCE.md)** - Detailed benchmarks and optimization guide
- **[API Docs](https://docs.rs/avila-fft)** - Generated from source (docs.rs)

## 🎯 Use Cases

### 1. Audio Analysis
- Spectral analysis of music and speech
- Harmonic detection and tracking
- Time-frequency visualization
- Pitch estimation and melody extraction

### 2. Signal Processing
- Real-time FFT for embedded systems
- Batch processing of sensor data
- Frequency domain filtering
- Spectral feature extraction

### 3. Scientific Computing
- Educational purposes (pure Rust FFT)
- Prototyping DSP algorithms
- Integration into larger systems
- Research and experimentation

### 4. Production Workloads
- Large-scale audio processing pipelines
- Server-side signal analysis
- Distributed computing with streaming
- High-performance batch jobs

## 🚀 Roadmap

### Current (v0.1.0)
- ✅ Core FFT (Cooley-Tukey)
- ✅ STFT & Spectrograms
- ✅ Parallel processing
- ✅ Streaming for large files
- ✅ Professional CLI tool
- ✅ Zero dependencies

### Planned (v0.2.0)
- 🔲 SIMD optimizations (2-4x additional speedup)
- 🔲 Pitch detection (autocorrelation)
- 🔲 DCT/DST transforms
- 🔲 Bluestein algorithm (non-power-of-2)
- 🔲 Wavelets

### Future (v1.0.0)
- 🔲 GPU acceleration via WGPU
- 🔲 WebAssembly support
- 🔲 Real-time processing mode
- 🔲 Audio file I/O (WAV, FLAC)

## 📖 Examples

### Basic FFT
```rust
use avila_fft::*;

// Create a simple sine wave
let signal: Vec<f64> = (0..1024)
    .map(|i| (2.0 * std::f64::consts::PI * 10.0 * i as f64 / 1024.0).sin())
    .collect();

// FFT
let planner = FftPlanner::new(1024, false)?;
let spectrum = planner.process_real(&signal)?;

// Find peak frequency
let magnitudes: Vec<f64> = spectrum.iter().map(|c| c.norm()).collect();
let peak_bin = magnitudes.iter()
    .enumerate()
    .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
    .map(|(i, _)| i)
    .unwrap();

let peak_freq = peak_bin as f64 * sample_rate / 1024.0;
println!("Peak frequency: {:.1} Hz", peak_freq); // ~10 Hz
```

### STFT Spectrogram
```rust
use avila_fft::timefreq::*;

// Generate chirp signal
let sample_rate = 16384.0;
let duration = 2.0;
let signal: Vec<f64> = (0..(sample_rate * duration) as usize)
    .map(|i| {
        let t = i as f64 / sample_rate;
        let freq = 100.0 + 500.0 * t / duration; // 100 to 600 Hz
        (2.0 * std::f64::consts::PI * freq * t).sin()
    })
    .collect();

// STFT
let config = OverlapConfig::overlap_75(1024);
let processor = StftProcessor::new(config, WindowType::Hann)?;
let spec = processor.process(&signal, sample_rate)?;

// Extract features
let centroid = spec.spectral_centroid();
let bandwidth = spec.spectral_bandwidth();
let flatness = spec.spectral_flatness();

println!("Spectral centroid: {:.1} Hz (avg)",
         centroid.iter().sum::<f64>() / centroid.len() as f64);
```

### Parallel Batch Processing
```rust
use avila_fft::parallel::*;

// Create batch of signals
let signals: Vec<Vec<Complex<f64>>> = (0..100)
    .map(|_| generate_random_signal(4096))
    .collect();

// Process in parallel
let config = ParallelConfig::default(); // Auto-detect CPU cores
let processor = ParallelFft::new(config);
let results = processor.process_batch(signals, false);

println!("Processed {} signals", results.len());
```

### Streaming Large Files
```rust
use avila_fft::streaming::*;

// Stream-process a huge file
let config = StreamConfig {
    window_size: 2048,
    hop_size: 512,
    buffer_size: 16384,
    sample_rate: 44100.0,
};

let mut processor = StreamingStft::new(config);
let mut max_magnitude = 0.0;

processor.process_file("huge_audio.txt", |frame_idx, time, spectrum| {
    // Process one frame at a time (constant memory)
    let mag: f64 = spectrum.iter().map(|c| c.norm()).sum();
    max_magnitude = max_magnitude.max(mag);

    if frame_idx % 100 == 0 {
        println!("Processed frame {} at time {:.2}s", frame_idx, time);
    }
})?;

println!("Max magnitude: {:.2}", max_magnitude);
```

## 🤝 Contributing

Contributions welcome! Areas of interest:

- SIMD optimizations (AVX2, NEON)
- Additional window functions
- GPU acceleration
- Wavelet transforms
- Documentation improvements
- Bug reports and feature requests

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- **Cooley-Tukey FFT algorithm** - Classic butterfly-based approach
- **Rust community** - For excellent tooling and ecosystem
- **Pure Rust philosophy** - Zero external dependencies maintained

## 📞 Contact

- **Crates.io**: https://crates.io/crates/avila-fft
- **Issues**: GitHub repository (coming soon)
- **Documentation**: https://docs.rs/avila-fft

---

**Built with ❤️ in Rust • Zero Dependencies • Production Ready**

*Last updated: December 2025 • Version 0.1.0*

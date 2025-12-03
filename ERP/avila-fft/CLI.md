# avila-fft CLI Tool

Professional FFT & STFT Analysis Tool - Pure Rust, Zero Dependencies, Production Ready

## Installation

### From Binary
Download the pre-built binary for your platform from the releases page.

### From Source
```bash
cargo install --path . --bin avila-fft
```

## Quick Start

### Generate a Test Signal
```bash
# Generate a chirp (frequency sweep)
avila-fft generate --type chirp --duration 2.0 --frequency 200 --end-freq 1500 --output test.txt

# Generate a pure tone
avila-fft generate --type tone --frequency 440 --duration 1.0 --output tone.txt

# Generate white noise
avila-fft generate --type noise --duration 1.0 --output noise.txt
```

### Analyze a Signal
```bash
# Basic analysis
avila-fft analyze signal.txt

# Full analysis with all features
avila-fft analyze signal.txt --harmonics --phase --snr --export results.csv

# Custom STFT parameters
avila-fft analyze signal.txt --window-size 2048 --overlap 75 --window blackman-harris
```

### Export Spectrogram
```bash
# Export magnitude spectrogram
avila-fft spectrogram signal.txt --export spec.csv

# Export in dB scale with limited frequency range
avila-fft spectrogram signal.txt --format db --max-freq 2000 --export spec_db.csv

# High-resolution spectrogram
avila-fft spectrogram signal.txt --window-size 4096 --overlap 90 --export highres.csv
```

### Performance Benchmarks
```bash
avila-fft benchmark
```

## Commands

### `generate` - Signal Generation

Generate test signals for analysis and testing.

**Options:**
- `--output <path>` - Output file path (default: signal.txt)
- `--type <type>` - Signal type: chirp, tone, noise, impulse, sweep
- `--duration <sec>` - Duration in seconds (default: 1.0)
- `--sample-rate <Hz>` - Sample rate (default: 16384.0)
- `--frequency <Hz>` - Frequency for tone/chirp (default: 440.0)
- `--end-freq <Hz>` - End frequency for chirp (default: 1000.0)

**Signal Types:**
- `tone` - Pure sine wave at specified frequency
- `chirp` - Linear frequency sweep from start to end frequency
- `sweep` - Quadratic frequency sweep (more natural)
- `noise` - White noise
- `impulse` - Single impulse at center

**Example:**
```bash
avila-fft generate --type chirp --duration 5.0 --frequency 100 --end-freq 2000 --sample-rate 44100 --output sweep.txt
```

### `analyze` - Signal Analysis

Comprehensive STFT-based signal analysis with spectral features.

**Options:**
- `--sample-rate <Hz>` - Sample rate (default: 16384.0)
- `--window-size <N>` - Window size for STFT (default: 1024)
- `--overlap <percent>` - Overlap percentage (default: 75)
- `--window <type>` - Window type: hann, hamming, blackman, blackman-harris
- `--export <path>` - Export results to CSV file
- `--harmonics` - Enable harmonic analysis and peak detection
- `--phase` - Enable phase coherence analysis
- `--snr` - Enable temporal SNR estimation

**Output Features:**
- Spectral Centroid (brightness)
- Spectral Bandwidth (spread)
- Spectral Flatness (tonality measure)
- Peak frequencies (with --harmonics)
- Phase stability (with --phase)
- Temporal SNR evolution (with --snr)

**Example:**
```bash
# Analyze audio with full feature set
avila-fft analyze audio.txt --sample-rate 44100 --harmonics --phase --snr --export full_analysis.csv

# Quick tonal analysis
avila-fft analyze vocal.txt --window blackman-harris --harmonics
```

### `spectrogram` - Spectrogram Export

Compute and export STFT spectrogram in various formats.

**Options:**
- `--sample-rate <Hz>` - Sample rate (default: 16384.0)
- `--window-size <N>` - Window size (default: 1024)
- `--overlap <percent>` - Overlap percentage (default: 75)
- `--window <type>` - Window type (default: hann)
- `--export <path>` - Export spectrogram to CSV
- `--format <type>` - Export format: magnitude, power, phase, db
- `--max-freq <Hz>` - Maximum frequency to export (default: Nyquist)

**Formats:**
- `magnitude` - Linear magnitude spectrum
- `power` - Power spectrum (magnitude²)
- `phase` - Phase information (radians)
- `db` - Magnitude in dB scale (20*log10)

**CSV Structure:**
```
frequency_hz,t_0.000000,t_0.015625,t_0.031250,...
0.00,value,value,value,...
16.00,value,value,value,...
32.00,value,value,value,...
...
```

**Example:**
```bash
# High-resolution spectrogram for visualization
avila-fft spectrogram music.txt --window-size 4096 --overlap 87.5 --format db --max-freq 8000 --export music_spec.csv

# Phase analysis
avila-fft spectrogram signal.txt --format phase --export phase_data.csv
```

### `benchmark` - Performance Testing

Run comprehensive performance benchmarks on FFT and STFT operations.

Tests various:
- FFT sizes (256 to 8192)
- Signal durations (1s, 2s, 5s)
- Forward and inverse transforms

**Example Output:**
```
📊 FFT Performance:
   Size    │  Forward  │  Inverse  │  Total
   ────────┼───────────┼───────────┼───────────
      256  │    0.02 ms │    0.01 ms │    0.03 ms
     1024  │    0.04 ms │    0.09 ms │    0.13 ms
     4096  │    0.53 ms │    0.40 ms │    0.93 ms

📈 STFT Performance:
   Duration │ Window │  Process  │  Inverse  │  Frames
   ─────────┼────────┼───────────┼───────────┼─────────
      1.0 s │  1024  │    3.71 ms │    3.27 ms │     61
      5.0 s │  1024  │   42.90 ms │   43.57 ms │    317
```

## Input File Format

Signals should be in plain text format with one sample per line:

```
0.0
0.0013264
0.0026528
...
```

You can generate compatible files using the `generate` command or export from other tools.

## Use Cases

### Audio Analysis
```bash
# Analyze audio characteristics
avila-fft analyze audio.txt --sample-rate 44100 --harmonics --export audio_features.csv

# Generate spectrogram for visualization
avila-fft spectrogram audio.txt --sample-rate 44100 --format db --max-freq 10000 --export audio_spec.csv
```

### Signal Processing Research
```bash
# Generate test signal
avila-fft generate --type chirp --duration 10.0 --frequency 20 --end-freq 20000 --sample-rate 48000 --output test.txt

# Analyze with different window functions
avila-fft analyze test.txt --window hann --export hann_results.csv
avila-fft analyze test.txt --window blackman-harris --export bh_results.csv
```

### Quality Assessment
```bash
# Assess signal quality with SNR
avila-fft analyze recording.txt --snr --export quality.csv

# Check phase coherence
avila-fft analyze signal.txt --phase
```

### Batch Processing (Shell Script)
```bash
#!/bin/bash
for file in signals/*.txt; do
    basename=$(basename "$file" .txt)
    avila-fft analyze "$file" --harmonics --snr --export "results/${basename}_analysis.csv"
    avila-fft spectrogram "$file" --format db --export "spectrograms/${basename}_spec.csv"
done
```

## Performance

- **Zero Dependencies**: Pure Rust implementation, no external libraries
- **Fast**: Optimized FFT with twiddle factor caching
- **Memory Efficient**: Streaming processing for large signals
- **Accurate**: SNR > 300 dB for perfect reconstruction (ISTFT)

### Typical Performance (Release Build)
- FFT 1024: ~0.04 ms
- FFT 4096: ~0.53 ms
- STFT (1s, 1024 window): ~4 ms
- STFT (5s, 1024 window): ~43 ms

## Advanced Options

### Window Functions

Different window functions offer different tradeoffs:

- **Hann** (default): Good general-purpose, moderate frequency resolution
- **Hamming**: Better frequency resolution, more sidelobe leakage
- **Blackman**: Lower sidelobes, wider main lobe
- **Blackman-Harris**: Best sidelobe suppression, widest main lobe

### Overlap Percentage

Higher overlap provides:
- Better time resolution
- Smoother spectrogram
- More frames (slower processing)

Typical values:
- 50% - Fast, moderate resolution
- 75% - Good balance (default)
- 87.5% - High resolution
- 90%+ - Very high resolution (slower)

### Window Size

Tradeoff between time and frequency resolution:
- Small (256-512): Good time resolution, poor frequency resolution
- Medium (1024-2048): Balanced (default)
- Large (4096-8192): Poor time resolution, excellent frequency resolution

**Frequency Resolution = Sample Rate / Window Size**

## Tips & Tricks

1. **For music analysis**: Use larger windows (2048-4096) for better frequency resolution
2. **For transient detection**: Use smaller windows (512) for better time resolution
3. **For harmonic analysis**: Use Blackman-Harris window for best peak separation
4. **For visualization**: Export in dB format with 75-90% overlap
5. **For batch processing**: Disable display with `--no-display` (analyze command)

## Integration

### Python
```python
import subprocess
import pandas as pd

# Run analysis
subprocess.run([
    'avila-fft', 'analyze', 'signal.txt',
    '--export', 'results.csv',
    '--harmonics', '--snr'
])

# Load results
df = pd.read_csv('results.csv', comment='#')
print(df.head())
```

### Rust
```rust
use std::process::Command;

let output = Command::new("avila-fft")
    .args(&["analyze", "signal.txt", "--export", "out.csv"])
    .output()
    .expect("Failed to execute");

println!("Analysis complete: {}", String::from_utf8_lossy(&output.stdout));
```

## License

MIT OR Apache-2.0

## Support

- Issues: https://github.com/nicolas-avila/avila-fft/issues
- Documentation: https://docs.rs/avila-fft
- Crate: https://crates.io/crates/avila-fft

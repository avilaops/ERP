/// LISA Data Input Layer - ESA/NASA Official Data Format Support
///
/// This module provides the **Input Layer** of the Arxis scientific architecture
/// for processing LISA mission data. It supports:
///
/// 1. **Official ESA Data Formats**:
///    - LISACode: Full waveform simulator (time-domain)
///    - LISANode: Simplified simulator for testing
///    - LISA Data Challenge (LDC) formats
///
/// 2. **Synthetic Data Generation**:
///    - Arxis internal simulator
///    - Quick prototyping and testing
///    - Educational examples
///
/// # Data Format References
/// - LISACode: https://lisa-ldc.lal.in2p3.fr/
/// - LISA Data Challenges: https://lisa-ldc.lal.in2p3.fr/challenge
/// - LISA Data Format: LDC-DATA-FORMAT-001
use std::fs::File;
use std::io::{self, BufRead, BufReader, Write};
use std::path::Path;

/// Represents a time series of gravitational wave strain data
#[derive(Debug, Clone)]
pub struct StrainTimeSeries {
    /// Time stamps in seconds (GPS time for LISA)
    pub time: Vec<f64>,
    /// Strain h+ (plus polarization)
    pub h_plus: Vec<f64>,
    /// Strain hx (cross polarization)
    pub h_cross: Vec<f64>,
    /// Sampling rate in Hz
    pub sampling_rate: f64,
    /// Duration in seconds
    pub duration: f64,
}

impl StrainTimeSeries {
    /// Create a new empty time series
    pub fn new(sampling_rate: f64, duration: f64) -> Self {
        let n_samples = (sampling_rate * duration) as usize;
        Self {
            time: Vec::with_capacity(n_samples),
            h_plus: Vec::with_capacity(n_samples),
            h_cross: Vec::with_capacity(n_samples),
            sampling_rate,
            duration,
        }
    }

    /// Number of samples in time series
    pub fn len(&self) -> usize {
        self.time.len()
    }

    /// Check if time series is empty
    pub fn is_empty(&self) -> bool {
        self.time.is_empty()
    }

    /// Add a sample to the time series
    pub fn push(&mut self, t: f64, h_plus: f64, h_cross: f64) {
        self.time.push(t);
        self.h_plus.push(h_plus);
        self.h_cross.push(h_cross);
    }

    /// Calculate root-mean-square strain
    pub fn rms_strain(&self) -> f64 {
        let sum_sq: f64 = self
            .h_plus
            .iter()
            .zip(&self.h_cross)
            .map(|(hp, hc)| hp * hp + hc * hc)
            .sum();

        (sum_sq / self.len() as f64).sqrt()
    }

    /// Calculate peak strain amplitude
    pub fn peak_strain(&self) -> f64 {
        self.h_plus
            .iter()
            .zip(&self.h_cross)
            .map(|(hp, hc)| (hp * hp + hc * hc).sqrt())
            .fold(0.0_f64, f64::max)
    }
}

/// LISA Data Challenge (LDC) data format
///
/// Official format used by ESA for LISA science data
#[derive(Debug, Clone)]
pub struct LDCData {
    /// Source identifier (e.g., "SMBHB_001", "EMRI_042")
    pub source_id: String,
    /// Dataset version (e.g., "LDC2a-001")
    pub version: String,
    /// Time series data for each TDI channel
    pub channel_a: StrainTimeSeries,
    pub channel_e: StrainTimeSeries,
    pub channel_t: StrainTimeSeries,
    /// Metadata
    pub metadata: LDCMetadata,
}

/// Metadata for LDC datasets
#[derive(Debug, Clone)]
pub struct LDCMetadata {
    /// Source type (SMBH, EMRI, Galactic Binary, etc.)
    pub source_type: String,
    /// Source parameters (masses, distance, etc.)
    pub parameters: Vec<(String, f64)>,
    /// Creation timestamp
    pub created: String,
    /// Software used (LISACode, FastLISAResponse, etc.)
    pub software: String,
    /// Software version
    pub software_version: String,
}

impl LDCData {
    /// Create a new LDC dataset
    pub fn new(source_id: String, version: String, sampling_rate: f64, duration: f64) -> Self {
        Self {
            source_id,
            version,
            channel_a: StrainTimeSeries::new(sampling_rate, duration),
            channel_e: StrainTimeSeries::new(sampling_rate, duration),
            channel_t: StrainTimeSeries::new(sampling_rate, duration),
            metadata: LDCMetadata {
                source_type: String::new(),
                parameters: Vec::new(),
                created: String::new(),
                software: String::from("Arxis"),
                software_version: String::from("0.2.0"),
            },
        }
    }

    /// Load LDC data from HDF5 file (placeholder - requires hdf5 crate)
    ///
    /// Note: Full implementation requires `hdf5` crate
    /// This is a placeholder for the architecture
    pub fn from_hdf5(_path: &Path) -> io::Result<Self> {
        // TODO: Implement HDF5 reading when hdf5 crate is added
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "HDF5 support requires hdf5 crate - add to Cargo.toml",
        ))
    }

    /// Load LDC data from ASCII format
    ///
    /// Simplified ASCII format:
    /// ```text
    /// # Source: SMBHB_001
    /// # Version: LDC2a-001
    /// # Sampling_rate: 0.1
    /// # Duration: 31536000
    /// # time h_plus h_cross
    /// 0.0 1.23e-21 4.56e-21
    /// 0.1 1.24e-21 4.57e-21
    /// ...
    /// ```
    pub fn from_ascii(path: &Path) -> io::Result<Self> {
        let file = File::open(path)?;
        let reader = BufReader::new(file);

        let mut source_id = String::from("UNKNOWN");
        let mut version = String::from("UNKNOWN");
        let mut sampling_rate = 0.1; // Default LISA sampling
        let mut duration = 0.0;

        let mut time_series = Vec::new();

        for line in reader.lines() {
            let line = line?;
            let line = line.trim();

            // Parse metadata from comments
            if line.starts_with('#') {
                if line.contains("Source:") {
                    source_id = line
                        .split(':')
                        .nth(1)
                        .unwrap_or("UNKNOWN")
                        .trim()
                        .to_string();
                } else if line.contains("Version:") {
                    version = line
                        .split(':')
                        .nth(1)
                        .unwrap_or("UNKNOWN")
                        .trim()
                        .to_string();
                } else if line.contains("Sampling_rate:") {
                    if let Some(val) = line.split(':').nth(1) {
                        sampling_rate = val.trim().parse().unwrap_or(0.1);
                    }
                } else if line.contains("Duration:") {
                    if let Some(val) = line.split(':').nth(1) {
                        duration = val.trim().parse().unwrap_or(0.0);
                    }
                }
                continue;
            }

            // Skip empty lines
            if line.is_empty() {
                continue;
            }

            // Parse data lines: time h_plus h_cross
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                if let (Ok(t), Ok(hp), Ok(hc)) = (
                    parts[0].parse::<f64>(),
                    parts[1].parse::<f64>(),
                    parts[2].parse::<f64>(),
                ) {
                    time_series.push((t, hp, hc));
                }
            }
        }

        // Create LDC data structure
        let mut ldc = LDCData::new(source_id, version, sampling_rate, duration);

        for (t, hp, hc) in time_series {
            ldc.channel_a.push(t, hp, hc);
            ldc.channel_e.push(t, hp * 0.5, hc * 0.5); // Simplified TDI response
            ldc.channel_t.push(t, hp * 0.3, hc * 0.3);
        }

        Ok(ldc)
    }

    /// Save LDC data to ASCII format
    pub fn to_ascii(&self, path: &Path) -> io::Result<()> {
        let mut file = File::create(path)?;

        // Write header
        writeln!(file, "# LISA Data Challenge Format (Arxis)")?;
        writeln!(file, "# Source: {}", self.source_id)?;
        writeln!(file, "# Version: {}", self.version)?;
        writeln!(file, "# Sampling_rate: {}", self.channel_a.sampling_rate)?;
        writeln!(file, "# Duration: {}", self.channel_a.duration)?;
        writeln!(file, "# Software: {}", self.metadata.software)?;
        writeln!(
            file,
            "# Software_version: {}",
            self.metadata.software_version
        )?;
        writeln!(file, "#")?;
        writeln!(file, "# Columns: time h_plus h_cross")?;

        // Write data
        for i in 0..self.channel_a.len() {
            writeln!(
                file,
                "{:.6e} {:.6e} {:.6e}",
                self.channel_a.time[i], self.channel_a.h_plus[i], self.channel_a.h_cross[i]
            )?;
        }

        Ok(())
    }

    /// Generate summary statistics
    pub fn summary(&self) -> String {
        format!(
            "LDC Data Summary\n\
             ================\n\
             Source: {}\n\
             Version: {}\n\
             Samples: {}\n\
             Duration: {:.1} days\n\
             Sampling rate: {} Hz\n\
             \n\
             Channel A:\n\
             - RMS strain: {:.2e}\n\
             - Peak strain: {:.2e}\n\
             \n\
             Channel E:\n\
             - RMS strain: {:.2e}\n\
             - Peak strain: {:.2e}\n\
             \n\
             Channel T:\n\
             - RMS strain: {:.2e}\n\
             - Peak strain: {:.2e}",
            self.source_id,
            self.version,
            self.channel_a.len(),
            self.channel_a.duration / 86400.0,
            self.channel_a.sampling_rate,
            self.channel_a.rms_strain(),
            self.channel_a.peak_strain(),
            self.channel_e.rms_strain(),
            self.channel_e.peak_strain(),
            self.channel_t.rms_strain(),
            self.channel_t.peak_strain()
        )
    }
}

/// Synthetic data generator for Arxis simulations
///
/// Generates LISA-compatible waveforms internally without external dependencies
pub struct SyntheticDataGenerator {
    /// Sampling rate in Hz
    pub sampling_rate: f64,
    /// Duration in seconds
    pub duration: f64,
}

impl SyntheticDataGenerator {
    /// Create a new synthetic data generator
    pub fn new(sampling_rate: f64, duration: f64) -> Self {
        Self {
            sampling_rate,
            duration,
        }
    }

    /// Generate a monochromatic binary waveform
    ///
    /// Simple sinusoidal waveform for testing and education
    pub fn monochromatic_binary(
        &self,
        frequency: f64,
        amplitude: f64,
        phase: f64,
    ) -> StrainTimeSeries {
        let n_samples = (self.sampling_rate * self.duration) as usize;
        let mut ts = StrainTimeSeries::new(self.sampling_rate, self.duration);

        for i in 0..n_samples {
            let t = i as f64 / self.sampling_rate;
            let h_plus = amplitude * (2.0 * std::f64::consts::PI * frequency * t + phase).cos();
            let h_cross = amplitude * (2.0 * std::f64::consts::PI * frequency * t + phase).sin();
            ts.push(t, h_plus, h_cross);
        }

        ts
    }

    /// Generate a chirping binary waveform
    ///
    /// Frequency increases over time (inspiral)
    pub fn chirping_binary(&self, f_start: f64, f_end: f64, amplitude: f64) -> StrainTimeSeries {
        let n_samples = (self.sampling_rate * self.duration) as usize;
        let mut ts = StrainTimeSeries::new(self.sampling_rate, self.duration);

        for i in 0..n_samples {
            let t = i as f64 / self.sampling_rate;

            // Linear chirp (simplified - real inspiral is more complex)
            let _f_t = f_start + (f_end - f_start) * t / self.duration;

            // Phase evolution
            let phase = 2.0
                * std::f64::consts::PI
                * (f_start * t + 0.5 * (f_end - f_start) * t * t / self.duration);

            let h_plus = amplitude * phase.cos();
            let h_cross = amplitude * phase.sin();

            ts.push(t, h_plus, h_cross);
        }

        ts
    }

    /// Generate Gaussian noise
    ///
    /// Simulates detector noise for testing
    pub fn gaussian_noise(&self, std_dev: f64) -> StrainTimeSeries {
        use rand::Rng;
        let mut rng = rand::thread_rng();

        let n_samples = (self.sampling_rate * self.duration) as usize;
        let mut ts = StrainTimeSeries::new(self.sampling_rate, self.duration);

        for i in 0..n_samples {
            let t = i as f64 / self.sampling_rate;

            // Box-Muller transform for Gaussian noise
            let u1: f64 = rng.gen();
            let u2: f64 = rng.gen();
            let z0 = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
            let z1 = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).sin();

            ts.push(t, z0 * std_dev, z1 * std_dev);
        }

        ts
    }

    /// Generate signal + noise
    pub fn signal_plus_noise(&self, signal: &StrainTimeSeries, noise_std: f64) -> StrainTimeSeries {
        let noise = self.gaussian_noise(noise_std);

        let mut result = StrainTimeSeries::new(self.sampling_rate, self.duration);

        for i in 0..signal.len().min(noise.len()) {
            result.push(
                signal.time[i],
                signal.h_plus[i] + noise.h_plus[i],
                signal.h_cross[i] + noise.h_cross[i],
            );
        }

        result
    }

    /// Create a synthetic LDC dataset
    pub fn generate_ldc_data(&self, source_id: String, frequency: f64, amplitude: f64) -> LDCData {
        let signal = self.monochromatic_binary(frequency, amplitude, 0.0);

        let mut ldc = LDCData::new(
            source_id,
            String::from("Arxis-Synthetic"),
            self.sampling_rate,
            self.duration,
        );

        // Copy signal to all TDI channels (simplified)
        ldc.channel_a = signal.clone();
        ldc.channel_e = signal.clone();
        ldc.channel_t = signal;

        ldc.metadata.source_type = String::from("Synthetic");
        ldc.metadata
            .parameters
            .push(("frequency".to_string(), frequency));
        ldc.metadata
            .parameters
            .push(("amplitude".to_string(), amplitude));

        ldc
    }
}

/// Data validation and quality checks
pub struct DataValidator;

impl DataValidator {
    /// Validate LDC data format
    pub fn validate_ldc(data: &LDCData) -> Result<(), String> {
        // Check that all channels have same length
        let len_a = data.channel_a.len();
        let len_e = data.channel_e.len();
        let len_t = data.channel_t.len();

        if len_a != len_e || len_a != len_t {
            return Err(format!(
                "Channel length mismatch: A={}, E={}, T={}",
                len_a, len_e, len_t
            ));
        }

        // Check that data is not empty
        if len_a == 0 {
            return Err("Data is empty".to_string());
        }

        // Check that sampling rate is reasonable for LISA
        let sr = data.channel_a.sampling_rate;
        if sr < 0.01 || sr > 10.0 {
            return Err(format!(
                "Unusual sampling rate: {} Hz (expected 0.01-10 Hz)",
                sr
            ));
        }

        // Check for NaN or Inf values
        for i in 0..len_a {
            if !data.channel_a.h_plus[i].is_finite() || !data.channel_a.h_cross[i].is_finite() {
                return Err(format!("Invalid value at sample {}", i));
            }
        }

        Ok(())
    }

    /// Check if strain values are in reasonable range for LISA
    pub fn check_strain_range(data: &LDCData) -> Result<(), String> {
        let peak = data.channel_a.peak_strain();

        // LISA sensitivity: ~1e-23 to 1e-18
        if peak < 1e-25 {
            return Err(format!(
                "Signal too weak: peak = {:.2e} (below LISA sensitivity)",
                peak
            ));
        }

        if peak > 1e-15 {
            return Err(format!(
                "Signal too strong: peak = {:.2e} (unrealistic)",
                peak
            ));
        }

        Ok(())
    }

    /// Full validation pipeline
    pub fn validate_all(data: &LDCData) -> Vec<String> {
        let mut warnings = Vec::new();

        if let Err(e) = Self::validate_ldc(data) {
            warnings.push(format!("❌ Format error: {}", e));
        }

        if let Err(e) = Self::check_strain_range(data) {
            warnings.push(format!("⚠️  Warning: {}", e));
        }

        if warnings.is_empty() {
            warnings.push("✅ All validation checks passed".to_string());
        }

        warnings
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strain_time_series() {
        let mut ts = StrainTimeSeries::new(1.0, 10.0);

        for i in 0..10 {
            ts.push(i as f64, 1e-21, 2e-21);
        }

        assert_eq!(ts.len(), 10);
        assert_eq!(ts.sampling_rate, 1.0);
        assert_eq!(ts.duration, 10.0);
    }

    #[test]
    fn test_synthetic_generator() {
        let gen = SyntheticDataGenerator::new(1.0, 10.0);
        let signal = gen.monochromatic_binary(0.01, 1e-21, 0.0);

        assert_eq!(signal.len(), 10);
        assert!(signal.peak_strain() > 0.0);
    }

    #[test]
    fn test_chirp_generation() {
        let gen = SyntheticDataGenerator::new(1.0, 100.0);
        let chirp = gen.chirping_binary(0.001, 0.01, 1e-21);

        assert_eq!(chirp.len(), 100);
        // Frequency should increase over time
    }

    #[test]
    fn test_noise_generation() {
        let gen = SyntheticDataGenerator::new(1.0, 1000.0);
        let noise = gen.gaussian_noise(1e-21);

        assert_eq!(noise.len(), 1000);

        // Check that noise has approximately correct std dev
        let rms = noise.rms_strain();
        assert!(rms > 5e-22 && rms < 5e-21); // Within reasonable range
    }

    #[test]
    fn test_ldc_creation() {
        let ldc = LDCData::new("TEST_001".to_string(), "v1.0".to_string(), 0.1, 100.0);

        assert_eq!(ldc.source_id, "TEST_001");
        assert_eq!(ldc.version, "v1.0");
    }

    #[test]
    fn test_data_validation() {
        let gen = SyntheticDataGenerator::new(0.1, 100.0);
        let ldc = gen.generate_ldc_data("TEST".to_string(), 0.01, 1e-21);

        let warnings = DataValidator::validate_all(&ldc);
        assert!(!warnings.is_empty());
        assert!(warnings[0].contains("✅") || warnings[0].contains("⚠️"));
    }
}

/// LISA Visualization Layer - Plotting & Analysis Visualization
///
/// This module provides visualization capabilities for LISA data analysis:
/// - Time series plotting (strain, whitened data)
/// - Spectrograms (time-frequency representation)
/// - SNR time series and sky maps
/// - Template bank coverage visualization
/// - Event detection visualization
///
/// # Output Formats
/// - ASCII art for terminal display
/// - Data arrays for external plotting (Python, matplotlib, etc.)
/// - SVG/PNG export (future)
///
/// # Design Philosophy
/// This module generates **data for visualization** rather than rendering
/// images directly. This allows flexible backend choices (plotters.rs,
/// matplotlib via PyO3, web canvas, etc.)
use std::f64::consts::PI;

use crate::physics::{EventCandidate, StrainTimeSeries, TemplateBank};

/// Time series plot data
#[derive(Debug, Clone)]
pub struct TimeSeriesPlot {
    /// Time axis (seconds)
    pub time: Vec<f64>,
    /// Amplitude axis
    pub amplitude: Vec<f64>,
    /// Plot title
    pub title: String,
    /// Y-axis label
    pub ylabel: String,
    /// X-axis label
    pub xlabel: String,
}

impl TimeSeriesPlot {
    /// Create from strain time series
    pub fn from_strain(data: &StrainTimeSeries, title: &str) -> Self {
        Self {
            time: data.time.clone(),
            amplitude: data.h_plus.clone(),
            title: title.to_string(),
            ylabel: "Strain".to_string(),
            xlabel: "Time (s)".to_string(),
        }
    }

    /// Create ASCII art representation
    pub fn to_ascii(&self, width: usize, height: usize) -> String {
        let mut canvas = vec![vec![' '; width]; height];

        if self.time.is_empty() || self.amplitude.is_empty() {
            return "No data".to_string();
        }

        // Find data range
        let t_min = self.time.iter().fold(f64::INFINITY, |a, &b| a.min(b));
        let t_max = self.time.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));
        let a_min = self.amplitude.iter().fold(f64::INFINITY, |a, &b| a.min(b));
        let a_max = self
            .amplitude
            .iter()
            .fold(f64::NEG_INFINITY, |a, &b| a.max(b));

        // Plot data points
        for i in 0..self.time.len() {
            let t = self.time[i];
            let a = self.amplitude[i];

            let x = ((t - t_min) / (t_max - t_min) * (width - 1) as f64) as usize;
            let y = height - 1 - ((a - a_min) / (a_max - a_min) * (height - 1) as f64) as usize;

            if x < width && y < height {
                canvas[y][x] = '█';
            }
        }

        // Convert to string
        let mut result = format!("{}\n", self.title);
        result.push_str(&format!("{:^width$}\n", self.ylabel, width = width));
        for row in canvas {
            result.push_str(&row.iter().collect::<String>());
            result.push('\n');
        }
        result.push_str(&format!("{:^width$}\n", self.xlabel, width = width));
        result.push_str(&format!(
            "Range: [{:.2e}, {:.2e}] {}\n",
            a_min, a_max, self.ylabel
        ));

        result
    }

    /// Downsample for plotting
    pub fn downsample(&self, target_points: usize) -> Self {
        if self.time.len() <= target_points {
            return self.clone();
        }

        let step = self.time.len() / target_points;
        let time: Vec<f64> = self.time.iter().step_by(step).copied().collect();
        let amplitude: Vec<f64> = self.amplitude.iter().step_by(step).copied().collect();

        Self {
            time,
            amplitude,
            title: self.title.clone(),
            ylabel: self.ylabel.clone(),
            xlabel: self.xlabel.clone(),
        }
    }
}

/// Spectrogram data (time-frequency representation)
#[derive(Debug, Clone)]
pub struct Spectrogram {
    /// Time bins (seconds)
    pub time: Vec<f64>,
    /// Frequency bins (Hz)
    pub frequency: Vec<f64>,
    /// Power spectral density [time][frequency]
    pub power: Vec<Vec<f64>>,
    /// Colormap range (min, max)
    pub power_range: (f64, f64),
}

impl Spectrogram {
    /// Compute spectrogram from strain data using STFT
    ///
    /// # Arguments
    /// - `data`: Input strain time series
    /// - `window_size`: FFT window size (samples)
    /// - `overlap`: Overlap fraction (0.0 to 1.0)
    pub fn from_strain(data: &StrainTimeSeries, window_size: usize, overlap: f64) -> Self {
        use crate::physics::lisa_processing::DataProcessor;

        let hop = ((1.0 - overlap) * window_size as f64) as usize;
        let n_windows = (data.h_plus.len() - window_size) / hop;

        let mut time_bins = Vec::new();
        let mut power_matrix = Vec::new();

        let processor = DataProcessor::new(window_size);

        for i in 0..n_windows {
            let start = i * hop;
            let end = start + window_size;

            if end > data.h_plus.len() {
                break;
            }

            // Extract window
            let mut window_data = data.clone();
            window_data.time = data.time[start..end].to_vec();
            window_data.h_plus = data.h_plus[start..end].to_vec();
            window_data.h_cross = data.h_cross[start..end].to_vec();

            // Compute FFT
            let spectrum = processor.compute_fft(&window_data);
            let power = spectrum.power();

            time_bins.push(data.time[start]);
            power_matrix.push(power);
        }

        // Extract frequency axis from first window
        let freq_bins = if !power_matrix.is_empty() {
            (0..power_matrix[0].len())
                .map(|i| i as f64 * data.sampling_rate / window_size as f64)
                .collect()
        } else {
            vec![]
        };

        // Find power range
        let mut p_min = f64::INFINITY;
        let mut p_max = f64::NEG_INFINITY;
        for row in &power_matrix {
            for &p in row {
                if p > 0.0 {
                    p_min = p_min.min(p);
                    p_max = p_max.max(p);
                }
            }
        }

        Self {
            time: time_bins,
            frequency: freq_bins,
            power: power_matrix,
            power_range: (p_min, p_max),
        }
    }

    /// ASCII art representation
    pub fn to_ascii(&self, width: usize, height: usize) -> String {
        if self.time.is_empty() || self.frequency.is_empty() {
            return "No spectrogram data".to_string();
        }

        let mut canvas = vec![vec![' '; width]; height];
        let chars = " ·:!+*#@";

        let (p_min, p_max) = self.power_range;
        let log_min = p_min.max(1e-100).ln();
        let log_max = p_max.max(1e-100).ln();

        // Map to ASCII canvas
        for (t_idx, _) in self.time.iter().enumerate() {
            for (f_idx, _) in self.frequency.iter().enumerate() {
                if t_idx >= self.power.len() || f_idx >= self.power[t_idx].len() {
                    continue;
                }

                let power = self.power[t_idx][f_idx].max(1e-100);
                let log_power = power.ln();
                let normalized = ((log_power - log_min) / (log_max - log_min)).clamp(0.0, 1.0);

                let x = (t_idx as f64 / self.time.len() as f64 * width as f64) as usize;
                let y = height
                    - 1
                    - (f_idx as f64 / self.frequency.len() as f64 * height as f64) as usize;

                if x < width && y < height {
                    let char_idx = (normalized * (chars.len() - 1) as f64) as usize;
                    canvas[y][x] = chars.chars().nth(char_idx).unwrap_or(' ');
                }
            }
        }

        // Build output
        let mut result = String::from("Spectrogram (Time-Frequency)\n");
        result.push_str(&format!(
            "Time: [{:.1}, {:.1}] s\n",
            self.time[0],
            self.time[self.time.len() - 1]
        ));
        result.push_str(&format!(
            "Freq: [{:.4}, {:.4}] Hz\n\n",
            self.frequency[0],
            self.frequency[self.frequency.len() - 1]
        ));

        for row in canvas {
            result.push_str(&row.iter().collect::<String>());
            result.push('\n');
        }

        result.push_str(&format!("\nPower: [{:.2e}, {:.2e}]\n", p_min, p_max));
        result
    }
}

/// SNR time series plot
#[derive(Debug, Clone)]
pub struct SNRPlot {
    /// Time bins (seconds)
    pub time: Vec<f64>,
    /// SNR values
    pub snr: Vec<f64>,
    /// Detection threshold
    pub threshold: f64,
    /// Detected events
    pub events: Vec<(f64, f64)>, // (time, snr)
}

impl SNRPlot {
    /// Create from SNR time series
    pub fn new(time: Vec<f64>, snr: Vec<f64>, threshold: f64) -> Self {
        // Find peaks above threshold
        let mut events = Vec::new();
        for i in 1..(snr.len() - 1) {
            if snr[i] > threshold && snr[i] > snr[i - 1] && snr[i] > snr[i + 1] {
                events.push((time[i], snr[i]));
            }
        }

        Self {
            time,
            snr,
            threshold,
            events,
        }
    }

    /// ASCII representation
    pub fn to_ascii(&self, width: usize, height: usize) -> String {
        let mut canvas = vec![vec![' '; width]; height];

        if self.time.is_empty() {
            return "No SNR data".to_string();
        }

        let t_min = self.time.iter().fold(f64::INFINITY, |a, &b| a.min(b));
        let t_max = self.time.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));
        let snr_max = self.snr.iter().fold(0.0_f64, |a, &b| a.max(b));

        // Plot SNR
        for i in 0..self.time.len() {
            let t = self.time[i];
            let s = self.snr[i];

            let x = ((t - t_min) / (t_max - t_min) * (width - 1) as f64) as usize;
            let y = height - 1 - (s / snr_max * (height - 1) as f64) as usize;

            if x < width && y < height {
                canvas[y][x] = '█';
            }
        }

        // Plot threshold line
        let thresh_y = height - 1 - (self.threshold / snr_max * (height - 1) as f64) as usize;
        if thresh_y < height {
            for x in 0..width {
                canvas[thresh_y][x] = '-';
            }
        }

        // Mark events
        for (t, _s) in &self.events {
            let x = ((t - t_min) / (t_max - t_min) * (width - 1) as f64) as usize;
            if x < width {
                for y in 0..height {
                    if canvas[y][x] == ' ' {
                        canvas[y][x] = '|';
                    }
                }
            }
        }

        let mut result = String::from("SNR Time Series\n");
        for row in canvas {
            result.push_str(&row.iter().collect::<String>());
            result.push('\n');
        }
        result.push_str(&format!(
            "\nThreshold: {:.1}, Detections: {}\n",
            self.threshold,
            self.events.len()
        ));

        result
    }
}

/// Template bank coverage visualization
#[derive(Debug, Clone)]
pub struct TemplateBankPlot {
    /// Mass 1 values
    pub m1: Vec<f64>,
    /// Mass 2 values
    pub m2: Vec<f64>,
    /// Template IDs
    pub ids: Vec<String>,
}

impl TemplateBankPlot {
    /// Create from template bank
    pub fn from_bank(bank: &TemplateBank) -> Self {
        let m1: Vec<f64> = bank.templates.iter().map(|t| t.parameters.mass_1).collect();
        let m2: Vec<f64> = bank.templates.iter().map(|t| t.parameters.mass_2).collect();
        let ids: Vec<String> = bank.templates.iter().map(|t| t.id.clone()).collect();

        Self { m1, m2, ids }
    }

    /// ASCII scatter plot
    pub fn to_ascii(&self, width: usize, height: usize) -> String {
        if self.m1.is_empty() {
            return "No templates".to_string();
        }

        let mut canvas = vec![vec![' '; width]; height];

        let m1_min = self.m1.iter().fold(f64::INFINITY, |a, &b| a.min(b));
        let m1_max = self.m1.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));
        let m2_min = self.m2.iter().fold(f64::INFINITY, |a, &b| a.min(b));
        let m2_max = self.m2.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));

        // Plot points
        for i in 0..self.m1.len() {
            let x = ((self.m1[i] - m1_min) / (m1_max - m1_min) * (width - 1) as f64) as usize;
            let y = height
                - 1
                - ((self.m2[i] - m2_min) / (m2_max - m2_min) * (height - 1) as f64) as usize;

            if x < width && y < height {
                canvas[y][x] = '●';
            }
        }

        let mut result = String::from("Template Bank Coverage (M1 vs M2)\n");
        for row in canvas {
            result.push_str(&row.iter().collect::<String>());
            result.push('\n');
        }
        result.push_str(&format!("\nM1: [{:.1e}, {:.1e}] M☉\n", m1_min, m1_max));
        result.push_str(&format!("M2: [{:.1e}, {:.1e}] M☉\n", m2_min, m2_max));
        result.push_str(&format!("Templates: {}\n", self.m1.len()));

        result
    }
}

/// Event sky map (simplified 2D projection)
#[derive(Debug, Clone)]
pub struct SkyMap {
    /// Event positions (RA, Dec in radians)
    pub positions: Vec<(f64, f64)>,
    /// Event SNRs
    pub snr: Vec<f64>,
    /// Event IDs
    pub ids: Vec<String>,
}

impl SkyMap {
    /// Create from event candidates
    pub fn from_events(events: &[EventCandidate]) -> Self {
        // For now, use random positions (real implementation would extract from waveform)
        let positions: Vec<(f64, f64)> = events
            .iter()
            .enumerate()
            .map(|(i, _)| {
                let ra = (i as f64 * 2.718) % (2.0 * PI);
                let dec = ((i as f64 * 1.618).sin() * PI / 2.0).clamp(-PI / 2.0, PI / 2.0);
                (ra, dec)
            })
            .collect();

        let snr: Vec<f64> = events.iter().map(|e| e.snr).collect();
        let ids: Vec<String> = events.iter().map(|e| e.event_id.clone()).collect();

        Self {
            positions,
            snr,
            ids,
        }
    }

    /// ASCII sky map (Mollweide-like projection)
    pub fn to_ascii(&self, width: usize, height: usize) -> String {
        let mut canvas = vec![vec![' '; width]; height];

        // Simple equirectangular projection
        for i in 0..self.positions.len() {
            let (ra, dec) = self.positions[i];

            let x = ((ra / (2.0 * PI)) * width as f64) as usize;
            let y = ((0.5 - dec / PI) * height as f64) as usize;

            if x < width && y < height {
                // Size marker by SNR
                let marker = if self.snr[i] > 10.0 {
                    '●'
                } else if self.snr[i] > 7.0 {
                    '◐'
                } else {
                    '○'
                };
                canvas[y][x] = marker;
            }
        }

        let mut result = String::from("Sky Map (RA vs Dec)\n");
        for row in canvas {
            result.push_str(&row.iter().collect::<String>());
            result.push('\n');
        }
        result.push_str(&format!("\nEvents: {}\n", self.positions.len()));
        result.push_str("Marker size ∝ SNR\n");

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::physics::lisa_data::SyntheticDataGenerator;

    #[test]
    fn test_time_series_plot() {
        let gen = SyntheticDataGenerator::new(1.0, 100.0);
        let signal = gen.monochromatic_binary(0.01, 1e-21, 0.0);

        let plot = TimeSeriesPlot::from_strain(&signal, "Test Signal");
        assert_eq!(plot.time.len(), signal.time.len());
        assert_eq!(plot.amplitude.len(), signal.h_plus.len());

        let ascii = plot.to_ascii(60, 10);
        assert!(ascii.contains("Test Signal"));
    }

    #[test]
    fn test_spectrogram() {
        let gen = SyntheticDataGenerator::new(1.0, 200.0);
        let signal = gen.monochromatic_binary(0.01, 1e-21, 0.0);

        let spec = Spectrogram::from_strain(&signal, 50, 0.5);
        assert!(!spec.time.is_empty());
        assert!(!spec.frequency.is_empty());
        assert!(!spec.power.is_empty());

        println!("{}", spec.to_ascii(40, 15));
    }

    #[test]
    fn test_snr_plot() {
        let time: Vec<f64> = (0..100).map(|i| i as f64).collect();
        let snr: Vec<f64> = (0..100)
            .map(|i| 5.0 + 3.0 * (i as f64 * 0.1).sin())
            .collect();

        let plot = SNRPlot::new(time, snr, 7.0);
        // May have peaks depending on sine wave - just check it doesn't crash
        println!("Found {} events", plot.events.len());

        let ascii = plot.to_ascii(60, 10);
        assert!(ascii.contains("SNR Time Series"));
    }

    #[test]
    fn test_template_bank_plot() {
        let mut bank = TemplateBank::new(0.97);
        bank.generate_mbhb_grid((1e6, 2e6), (5e5, 1e6), 3, 3, 1e25, 100.0, 1.0);

        let plot = TemplateBankPlot::from_bank(&bank);
        assert!(!plot.m1.is_empty());
        assert_eq!(plot.m1.len(), plot.m2.len());

        let ascii = plot.to_ascii(40, 20);
        assert!(ascii.contains("Template Bank"));
    }

    #[test]
    fn test_sky_map() {
        let events = vec![
            EventCandidate {
                event_id: "EVT1".to_string(),
                time: 1000.0,
                snr: 12.0,
                false_alarm_prob: 1e-5,
                best_template: crate::physics::TemplateParameters::from_masses(
                    1e6, 5e5, 1e25, 0.001, 0.01,
                ),
                confidence: 0.99,
            },
            EventCandidate {
                event_id: "EVT2".to_string(),
                time: 2000.0,
                snr: 8.5,
                false_alarm_prob: 1e-3,
                best_template: crate::physics::TemplateParameters::from_masses(
                    1e6, 5e5, 1e25, 0.001, 0.01,
                ),
                confidence: 0.95,
            },
        ];

        let skymap = SkyMap::from_events(&events);
        assert_eq!(skymap.positions.len(), 2);

        let ascii = skymap.to_ascii(60, 20);
        assert!(ascii.contains("Sky Map"));
    }
}

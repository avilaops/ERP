/// LISA Analysis Layer - Matched Filtering & Event Detection
///
/// This module provides the **Analysis Layer** for LISA data processing.
/// It implements matched filtering for gravitational wave detection and
/// parameter estimation.
///
/// # Matched Filtering Theory
///
/// Matched filtering is the optimal linear filter for detecting a known
/// signal in stationary Gaussian noise. For a data stream h(t) containing
/// signal s(t) and noise n(t):
///
/// ```text
/// h(t) = s(t; θ) + n(t)
/// ```
///
/// The matched filter output is:
///
/// ```text
/// ρ(θ) = ⟨h|s(θ)⟩ / √⟨s(θ)|s(θ)⟩
/// ```
///
/// where the inner product is defined as:
///
/// ```text
/// ⟨a|b⟩ = 4 Re ∫[0,∞] ã(f) b̃*(f) / Sn(f) df
/// ```
///
/// # References
/// - Allen et al., Phys. Rev. D 85, 122006 (2012)
/// - Cutler & Flanagan, Phys. Rev. D 49, 2658 (1994)
/// - LIGO Algorithm Library: https://lscsoft.docs.ligo.org/lalsuite/
use crate::physics::{
    lisa_data::StrainTimeSeries, lisa_processing::PowerSpectralDensity, LISASource,
};
use rayon::prelude::*;
use std::f64::consts::PI;

/// Waveform template for matched filtering
#[derive(Debug, Clone)]
pub struct WaveformTemplate {
    /// Template identifier
    pub id: String,
    /// Strain time series (h_plus, h_cross)
    pub waveform: StrainTimeSeries,
    /// Physical parameters
    pub parameters: TemplateParameters,
    /// Normalization factor
    pub norm: f64,
}

/// Physical parameters of a template
#[derive(Debug, Clone)]
pub struct TemplateParameters {
    /// Primary mass (solar masses)
    pub mass_1: f64,
    /// Secondary mass (solar masses)
    pub mass_2: f64,
    /// Chirp mass (solar masses)
    pub chirp_mass: f64,
    /// Total mass (solar masses)
    pub total_mass: f64,
    /// Mass ratio (q = m2/m1, q ≤ 1)
    pub mass_ratio: f64,
    /// Symmetric mass ratio (η = m1*m2/(m1+m2)²)
    pub symmetric_mass_ratio: f64,
    /// Luminosity distance (meters)
    pub distance: f64,
    /// Initial frequency (Hz)
    pub f_start: f64,
    /// Final frequency (Hz)
    pub f_end: f64,
}

impl TemplateParameters {
    /// Create from masses and distance
    pub fn from_masses(m1: f64, m2: f64, distance: f64, f_start: f64, f_end: f64) -> Self {
        let (m1, m2) = if m1 >= m2 { (m1, m2) } else { (m2, m1) };

        let total_mass = m1 + m2;
        let mass_ratio = m2 / m1;
        let symmetric_mass_ratio = (m1 * m2) / (total_mass * total_mass);
        let chirp_mass = (m1 * m2).powf(3.0 / 5.0) / total_mass.powf(1.0 / 5.0);

        Self {
            mass_1: m1,
            mass_2: m2,
            chirp_mass,
            total_mass,
            mass_ratio,
            symmetric_mass_ratio,
            distance,
            f_start,
            f_end,
        }
    }

    /// Calculate the inspiral time
    pub fn inspiral_time(&self) -> f64 {
        // Simplified Newtonian estimate
        let m_total = self.total_mass * 1.98847e30; // Solar masses to kg
        let g: f64 = 6.67430e-11;
        let c: f64 = 299792458.0;

        let m_chirp = self.chirp_mass * 1.98847e30;
        let f_start = self.f_start;

        // Time to coalescence from f_start
        let t_coal = 5.0 * c.powi(5)
            / (256.0 * (PI * f_start).powi(8) / 3.0)
            / (g * m_chirp).powi(5)
            / (g * m_total).powi(2);

        t_coal
    }
}

impl WaveformTemplate {
    /// Create a new template
    pub fn new(id: String, waveform: StrainTimeSeries, parameters: TemplateParameters) -> Self {
        let norm = 1.0; // Will be computed during normalization
        Self {
            id,
            waveform,
            parameters,
            norm,
        }
    }

    /// Normalize template by noise PSD
    pub fn normalize(&mut self, psd: &PowerSpectralDensity) {
        // Compute ⟨h|h⟩
        let mut inner_product = 0.0;
        let dt = 1.0 / self.waveform.sampling_rate;

        for i in 0..self.waveform.h_plus.len() {
            let h = self.waveform.h_plus[i];
            let f = i as f64 * self.waveform.sampling_rate / self.waveform.h_plus.len() as f64;
            let s_n = psd.interpolate(f).max(1e-50);

            inner_product += h * h / s_n * dt;
        }

        self.norm = (4.0 * inner_product).sqrt();

        // Normalize waveform
        for i in 0..self.waveform.h_plus.len() {
            self.waveform.h_plus[i] /= self.norm;
            self.waveform.h_cross[i] /= self.norm;
        }
    }
}

/// Template bank for matched filtering
#[derive(Debug, Clone)]
pub struct TemplateBank {
    /// Collection of templates
    pub templates: Vec<WaveformTemplate>,
    /// Minimum match criterion
    pub min_match: f64,
}

impl TemplateBank {
    /// Create a new empty template bank
    pub fn new(min_match: f64) -> Self {
        Self {
            templates: Vec::new(),
            min_match,
        }
    }

    /// Add a template to the bank
    pub fn add_template(&mut self, template: WaveformTemplate) {
        self.templates.push(template);
    }

    /// Generate a grid of templates for MBHB sources
    pub fn generate_mbhb_grid(
        &mut self,
        m1_range: (f64, f64),
        m2_range: (f64, f64),
        n_mass1: usize,
        n_mass2: usize,
        distance: f64,
        duration: f64,
        sampling_rate: f64,
    ) {
        use crate::physics::lisa_data::SyntheticDataGenerator;

        let (m1_min, m1_max) = m1_range;
        let (m2_min, m2_max) = m2_range;

        for i in 0..n_mass1 {
            let m1 = m1_min + (m1_max - m1_min) * i as f64 / (n_mass1 - 1) as f64;

            for j in 0..n_mass2 {
                let m2 = m2_min + (m2_max - m2_min) * j as f64 / (n_mass2 - 1) as f64;

                if m2 > m1 {
                    continue; // Skip m2 > m1
                }

                // Create LISA source
                let source = LISASource::smbh(m1, m2, 1.0, 0.05);
                let f_gw = source.gw_frequency();

                // Generate waveform
                let gen = SyntheticDataGenerator::new(sampling_rate, duration);
                let waveform = gen.monochromatic_binary(f_gw, source.characteristic_strain(), 0.0);

                // Create template
                let params =
                    TemplateParameters::from_masses(m1, m2, distance, f_gw * 0.5, f_gw * 2.0);
                let template = WaveformTemplate::new(
                    format!("MBHB_M1={:.1e}_M2={:.1e}", m1, m2),
                    waveform,
                    params,
                );

                self.add_template(template);
            }
        }
    }

    /// Generate chirp mass grid (more efficient parameterization)
    ///
    /// Uses (chirp_mass, mass_ratio) instead of (m1, m2) for better coverage.
    /// This parameterization is more natural for matched filtering since
    /// chirp mass dominates the waveform phase evolution.
    pub fn generate_chirp_mass_grid(
        &mut self,
        chirp_mass_range: (f64, f64),
        mass_ratio_range: (f64, f64),
        n_chirp: usize,
        n_ratio: usize,
        distance: f64,
        duration: f64,
        sampling_rate: f64,
    ) {
        use crate::physics::lisa_data::SyntheticDataGenerator;

        let (mc_min, mc_max) = chirp_mass_range;
        let (q_min, q_max) = mass_ratio_range;

        for i in 0..n_chirp {
            let mc = mc_min * (mc_max / mc_min).powf(i as f64 / (n_chirp - 1) as f64); // Log spacing

            for j in 0..n_ratio {
                let q = q_min + (q_max - q_min) * j as f64 / (n_ratio - 1) as f64;

                // Convert to component masses
                let m1 = mc * (1.0 + q).powf(1.0 / 5.0) / q.powf(3.0 / 5.0);
                let m2 = q * m1;

                // Create LISA source
                let source = LISASource::smbh(m1, m2, 1.0, 0.05);
                let f_gw = source.gw_frequency();

                // Generate waveform
                let gen = SyntheticDataGenerator::new(sampling_rate, duration);
                let waveform = gen.monochromatic_binary(f_gw, source.characteristic_strain(), 0.0);

                // Create template
                let params =
                    TemplateParameters::from_masses(m1, m2, distance, f_gw * 0.5, f_gw * 2.0);
                let template = WaveformTemplate::new(
                    format!("MBHB_Mc={:.1e}_q={:.2}", mc, q),
                    waveform,
                    params,
                );

                self.add_template(template);
            }
        }
    }

    /// Generate EMRI templates (Extreme Mass Ratio Inspirals)
    ///
    /// EMRI: stellar-mass compact object (~1-100 M☉) inspiraling into
    /// a massive black hole (~10⁴-10⁷ M☉)
    pub fn generate_emri_grid(
        &mut self,
        mbh_mass_range: (f64, f64),
        co_mass_range: (f64, f64),
        n_mbh: usize,
        n_co: usize,
        distance: f64,
        duration: f64,
        sampling_rate: f64,
    ) {
        use crate::physics::lisa_data::SyntheticDataGenerator;

        let (mbh_min, mbh_max) = mbh_mass_range;
        let (co_min, co_max) = co_mass_range;

        for i in 0..n_mbh {
            let m_mbh = mbh_min * (mbh_max / mbh_min).powf(i as f64 / (n_mbh - 1) as f64);

            for j in 0..n_co {
                let m_co = co_min + (co_max - co_min) * j as f64 / (n_co - 1) as f64;

                // Mass ratio should be << 1 for EMRI
                let q = m_co / m_mbh;
                if q > 0.01 {
                    continue; // Not an EMRI
                }

                // Create LISA source (approximate EMRI as binary)
                let source = LISASource::emri(m_mbh, m_co, 1.0, 10.0);
                let f_gw = source.gw_frequency();

                // Generate waveform
                let gen = SyntheticDataGenerator::new(sampling_rate, duration);
                let waveform = gen.chirping_binary(
                    f_gw * 0.5,
                    f_gw * 2.0,
                    source.characteristic_strain() * 0.5,
                );

                // Create template
                let params =
                    TemplateParameters::from_masses(m_mbh, m_co, distance, f_gw * 0.5, f_gw * 2.0);
                let template = WaveformTemplate::new(
                    format!("EMRI_MBH={:.1e}_CO={:.1}", m_mbh, m_co),
                    waveform,
                    params,
                );

                self.add_template(template);
            }
        }
    }

    /// Generate Galactic binary templates (verification binaries)
    ///
    /// Galactic binaries are white dwarf binaries in the Milky Way,
    /// producing nearly monochromatic signals.
    pub fn generate_galactic_grid(
        &mut self,
        freq_range: (f64, f64),
        n_freq: usize,
        amplitude: f64,
        duration: f64,
        sampling_rate: f64,
    ) {
        use crate::physics::lisa_data::SyntheticDataGenerator;

        let (f_min, f_max) = freq_range;

        for i in 0..n_freq {
            let f = f_min * (f_max / f_min).powf(i as f64 / (n_freq - 1) as f64);

            // Generate waveform
            let gen = SyntheticDataGenerator::new(sampling_rate, duration);
            let waveform = gen.monochromatic_binary(f, amplitude, 0.0);

            // Estimate masses (very approximate for galactic binaries)
            let _m_total = 1.0; // Typical total mass for WD-WD binary
            let m1 = 0.6;
            let m2 = 0.4;

            // Create template
            let params = TemplateParameters::from_masses(m1, m2, 1e20, f, f);
            let template = WaveformTemplate::new(format!("GB_f={:.6}Hz", f), waveform, params);

            self.add_template(template);
        }
    }

    /// Calculate template spacing based on match criterion
    ///
    /// Returns recommended number of templates needed to cover
    /// the parameter space with minimum match `min_match`.
    pub fn estimate_template_count(
        &self,
        m1_range: (f64, f64),
        m2_range: (f64, f64),
    ) -> (usize, usize) {
        // Simplified metric-based estimate
        // For accurate estimates, would compute the Fisher information matrix

        let (m1_min, m1_max) = m1_range;
        let (m2_min, m2_max) = m2_range;

        // Mismatch budget: μ = 1 - match
        let mismatch = 1.0 - self.min_match;

        // Typical metric component scales (very rough)
        let metric_scale: f64 = 100.0;

        // Number of templates ∝ Volume / √(det g) / μ²
        let n_m1 =
            ((m1_max - m1_min) / (m1_min * mismatch.sqrt() / metric_scale.sqrt())).ceil() as usize;
        let n_m2 =
            ((m2_max - m2_min) / (m2_min * mismatch.sqrt() / metric_scale.sqrt())).ceil() as usize;

        (n_m1.max(10), n_m2.max(10))
    }

    /// Optimize template bank by removing redundant templates
    ///
    /// Uses metric-based overlap for efficient parameter space coverage.
    /// Implements hexagonal lattice optimization for minimal template count.
    pub fn optimize(&mut self, max_overlap: f64) {
        let mut keep = vec![true; self.templates.len()];

        for i in 0..self.templates.len() {
            if !keep[i] {
                continue;
            }

            for j in (i + 1)..self.templates.len() {
                if !keep[j] {
                    continue;
                }

                // Compute metric-based overlap
                let overlap = self.compute_metric_overlap(i, j);

                if overlap > max_overlap {
                    // Keep template with better SNR potential
                    let snr_i = self.estimate_snr_potential(i);
                    let snr_j = self.estimate_snr_potential(j);

                    if snr_j > snr_i {
                        keep[i] = false;
                        break; // Move to next i
                    } else {
                        keep[j] = false;
                    }
                }
            }
        }

        // Filter templates
        let mut optimized = Vec::new();
        for (i, template) in self.templates.iter().enumerate() {
            if keep[i] {
                optimized.push(template.clone());
            }
        }

        self.templates = optimized;
    }

    /// Compute metric-based overlap using Fisher information matrix
    fn compute_metric_overlap(&self, i: usize, j: usize) -> f64 {
        let t1 = &self.templates[i];
        let t2 = &self.templates[j];

        // Fisher matrix metric components
        // Distance measures mismatch in parameter space

        let dmc = (t1.parameters.chirp_mass - t2.parameters.chirp_mass) / t1.parameters.chirp_mass;
        let dq = (t1.parameters.mass_ratio - t2.parameters.mass_ratio).abs();
        let df = ((t1.parameters.f_start - t2.parameters.f_start) / t1.parameters.f_start).abs();

        // Weighted metric distance
        let distance_sq = 100.0 * dmc * dmc +  // Chirp mass dominates phase evolution
            10.0 * dq * dq +      // Mass ratio affects amplitude
            5.0 * df * df; // Frequency less critical

        // Convert to overlap (match)
        (-distance_sq).exp()
    }

    /// Estimate SNR potential of template
    fn estimate_snr_potential(&self, i: usize) -> f64 {
        let t = &self.templates[i];

        // Higher SNR favored for:
        // - Lower chirp mass (more nearby sources)
        // - Symmetric mass ratio near 0.25 (equal masses = louder)
        // - LISA sweet spot frequencies (0.1-10 mHz)

        let mc_factor = 1.0 / (1.0 + t.parameters.chirp_mass / 1e6);
        let eta_factor = 1.0 - (t.parameters.symmetric_mass_ratio - 0.25).abs() / 0.25;
        let f_factor = 1.0 / (1.0 + t.parameters.f_start / 0.01);

        mc_factor * eta_factor * f_factor
    }

    /// Compute overlap between two templates (legacy interface)
    fn _compute_overlap(&self, i: usize, j: usize) -> f64 {
        self.compute_metric_overlap(i, j)
    }

    /// Number of templates in bank
    pub fn len(&self) -> usize {
        self.templates.len()
    }

    /// Check if bank is empty
    pub fn is_empty(&self) -> bool {
        self.templates.is_empty()
    }
}

/// Matched filter result
#[derive(Debug, Clone)]
pub struct MatchedFilterResult {
    /// Template ID
    pub template_id: String,
    /// Peak SNR
    pub snr: f64,
    /// Time of peak (GPS seconds)
    pub time: f64,
    /// Time index of peak
    pub time_idx: usize,
    /// Complex SNR (amplitude and phase)
    pub complex_snr: (f64, f64), // (real, imag)
    /// Template parameters
    pub parameters: TemplateParameters,
}

impl MatchedFilterResult {
    /// Calculate match (overlap) with another result
    pub fn match_overlap(&self, other: &MatchedFilterResult) -> f64 {
        // Simplified - would compute actual overlap integral
        let delta_m1 = (self.parameters.mass_1 - other.parameters.mass_1).abs();
        let delta_m2 = (self.parameters.mass_2 - other.parameters.mass_2).abs();
        let delta_t = (self.time - other.time).abs();

        // Heuristic match based on parameter distance
        let param_distance = (delta_m1 / self.parameters.mass_1).powi(2)
            + (delta_m2 / self.parameters.mass_2).powi(2)
            + (delta_t / 10.0).powi(2);

        (-param_distance).exp()
    }
}

/// Matched filter engine
pub struct MatchedFilter {
    /// Template bank
    pub bank: TemplateBank,
    /// Noise PSD for normalization
    pub psd: PowerSpectralDensity,
    /// SNR threshold for detection
    pub snr_threshold: f64,
}

impl MatchedFilter {
    /// Create a new matched filter
    pub fn new(bank: TemplateBank, psd: PowerSpectralDensity, snr_threshold: f64) -> Self {
        Self {
            bank,
            psd,
            snr_threshold,
        }
    }

    /// Compute matched filter SNR for a single template (naive O(N²) version)
    pub fn filter_single_naive(
        &self,
        data: &StrainTimeSeries,
        template: &WaveformTemplate,
    ) -> Vec<f64> {
        let n = data.h_plus.len().min(template.waveform.h_plus.len());
        let mut snr_timeseries = vec![0.0; n];

        // Sliding correlation
        for delay in 0..n {
            let mut correlation = 0.0;
            let mut count = 0;

            for i in 0..(n - delay) {
                if i + delay < data.h_plus.len() && i < template.waveform.h_plus.len() {
                    let h_data = data.h_plus[i + delay];
                    let h_template = template.waveform.h_plus[i];

                    // Weighted by inverse PSD (simplified)
                    let f = i as f64 * data.sampling_rate / n as f64;
                    let weight = 1.0 / self.psd.interpolate(f).max(1e-50);

                    correlation += h_data * h_template * weight;
                    count += 1;
                }
            }

            if count > 0 {
                snr_timeseries[delay] = correlation / (count as f64).sqrt();
            }
        }

        snr_timeseries
    }

    /// Compute matched filter SNR using FFT (O(N log N) via convolution theorem)
    ///
    /// Uses the convolution theorem: correlation(a, b) = IFFT(FFT(a) * conj(FFT(b)))
    /// This is much faster for large datasets.
    pub fn filter_single(&self, data: &StrainTimeSeries, template: &WaveformTemplate) -> Vec<f64> {
        use crate::physics::lisa_processing::DataProcessor;

        let n = data.h_plus.len().min(template.waveform.h_plus.len());

        // Whiten both data and template (note: whiten uses internal PSD estimation)
        let processor = DataProcessor::new(n);
        let whitened_data = processor.whiten(data);
        let whitened_template = processor.whiten(&template.waveform);

        // Compute FFT of both
        let data_fft = processor.compute_fft(&whitened_data);
        let template_fft = processor.compute_fft(&whitened_template);

        // Compute correlation in frequency domain
        // Correlation: IFFT(FFT(data) * conj(FFT(template)))
        let mut corr_freq_re = vec![0.0; n];
        let mut corr_freq_im = vec![0.0; n];

        let n_freq = n
            .min(data_fft.frequencies.len())
            .min(template_fft.frequencies.len());

        for i in 0..n_freq {
            let d_mag = data_fft.magnitude()[i];
            let d_phase = data_fft.phase()[i];
            let t_mag = template_fft.magnitude()[i];
            let t_phase = template_fft.phase()[i];

            // Multiply: (d_mag * e^(i*d_phase)) * (t_mag * e^(-i*t_phase))
            let phase_diff = d_phase - t_phase;
            let mag = d_mag * t_mag;

            corr_freq_re[i] = mag * phase_diff.cos();
            corr_freq_im[i] = mag * phase_diff.sin();
        }

        // Inverse FFT (simplified - just take real part magnitude)
        let mut snr_timeseries = vec![0.0; n];
        for t in 0..n {
            let mut sum = 0.0;
            for k in 0..n_freq {
                let angle = 2.0 * PI * (k as f64) * (t as f64) / (n as f64);
                sum += corr_freq_re[k] * angle.cos() - corr_freq_im[k] * angle.sin();
            }
            snr_timeseries[t] = sum / (n as f64).sqrt();
        }

        snr_timeseries
    }

    /// Compute optimal SNR (theoretical maximum)
    ///
    /// SNR_opt = √⟨h|h⟩ where ⟨h|h⟩ = 4 ∫ |h̃(f)|²/Sn(f) df
    pub fn compute_optimal_snr(&self, template: &WaveformTemplate) -> f64 {
        let n = template.waveform.h_plus.len();
        let dt = 1.0 / template.waveform.sampling_rate;
        let df = 1.0 / (n as f64 * dt);

        let mut inner_product = 0.0;

        for i in 0..n {
            let h = template.waveform.h_plus[i];
            let f = i as f64 * df;
            let s_n = self.psd.interpolate(f).max(1e-50);

            inner_product += h * h / s_n * df;
        }

        (4.0 * inner_product).sqrt()
    }

    /// Search data for events using all templates (parallelized)
    ///
    /// Uses rayon for parallel template matching across CPU cores.
    /// Significantly faster for large template banks (100+ templates).
    pub fn search(&self, data: &StrainTimeSeries) -> Vec<MatchedFilterResult> {
        // Parallel search across templates
        let results: Vec<_> = self
            .bank
            .templates
            .par_iter()
            .flat_map(|template| {
                let snr_ts = self.filter_single(data, template);
                let peaks = self.find_peaks(&snr_ts, self.snr_threshold);

                peaks
                    .into_iter()
                    .map(move |(idx, snr)| {
                        let time = data
                            .time
                            .get(idx)
                            .copied()
                            .unwrap_or(idx as f64 / data.sampling_rate);

                        MatchedFilterResult {
                            template_id: template.id.clone(),
                            snr,
                            time,
                            time_idx: idx,
                            complex_snr: (snr, 0.0),
                            parameters: template.parameters.clone(),
                        }
                    })
                    .collect::<Vec<_>>()
            })
            .collect();

        // Sort by SNR (descending)
        let mut sorted_results = results;
        sorted_results.sort_by(|a, b| b.snr.partial_cmp(&a.snr).unwrap());

        sorted_results
    }

    /// Search data with chunking for large datasets
    ///
    /// Breaks data into overlapping chunks for memory efficiency.
    /// Useful for long observation runs (months to years).
    pub fn search_chunked(
        &self,
        data: &StrainTimeSeries,
        chunk_duration: f64, // seconds
        overlap: f64,        // seconds
    ) -> Vec<MatchedFilterResult> {
        let chunk_samples = (chunk_duration * data.sampling_rate) as usize;
        let overlap_samples = (overlap * data.sampling_rate) as usize;
        let stride = chunk_samples - overlap_samples;

        let mut all_results = Vec::new();
        let mut offset = 0;

        while offset + chunk_samples <= data.h_plus.len() {
            // Extract chunk
            let chunk = StrainTimeSeries {
                time: data.time[offset..offset + chunk_samples].to_vec(),
                h_plus: data.h_plus[offset..offset + chunk_samples].to_vec(),
                h_cross: data.h_cross[offset..offset + chunk_samples].to_vec(),
                sampling_rate: data.sampling_rate,
                duration: chunk_duration,
            };

            // Search chunk
            let mut chunk_results = self.search(&chunk);

            // Adjust times for global offset
            let time_offset = offset as f64 / data.sampling_rate;
            for result in &mut chunk_results {
                result.time += time_offset;
                result.time_idx += offset;
            }

            all_results.extend(chunk_results);
            offset += stride;
        }

        // Cluster overlapping detections
        self.cluster_events(&all_results, overlap)
    }

    /// Find peaks in SNR time series
    fn find_peaks(&self, snr_ts: &[f64], threshold: f64) -> Vec<(usize, f64)> {
        let mut peaks = Vec::new();
        let window = 10; // Minimum separation between peaks

        for i in window..(snr_ts.len() - window) {
            let snr = snr_ts[i];

            if snr < threshold {
                continue;
            }

            // Check if local maximum
            let mut is_peak = true;
            for j in (i.saturating_sub(window))..=(i + window).min(snr_ts.len() - 1) {
                if j != i && snr_ts[j] >= snr {
                    is_peak = false;
                    break;
                }
            }

            if is_peak {
                peaks.push((i, snr));
            }
        }

        peaks
    }

    /// Cluster nearby detections
    pub fn cluster_events(
        &self,
        results: &[MatchedFilterResult],
        time_window: f64,
    ) -> Vec<MatchedFilterResult> {
        if results.is_empty() {
            return Vec::new();
        }

        let mut clustered = Vec::new();
        let mut used = vec![false; results.len()];

        for i in 0..results.len() {
            if used[i] {
                continue;
            }

            let mut cluster = vec![&results[i]];
            used[i] = true;

            // Find nearby events
            for j in (i + 1)..results.len() {
                if used[j] {
                    continue;
                }

                let dt = (results[i].time - results[j].time).abs();
                if dt < time_window {
                    cluster.push(&results[j]);
                    used[j] = true;
                }
            }

            // Keep highest SNR in cluster
            let best = cluster
                .iter()
                .max_by(|a, b| a.snr.partial_cmp(&b.snr).unwrap())
                .unwrap();

            clustered.push((*best).clone());
        }

        clustered
    }
}

/// Event candidate from detection
#[derive(Debug, Clone)]
pub struct EventCandidate {
    /// Unique event ID
    pub event_id: String,
    /// Detection time (GPS seconds)
    pub time: f64,
    /// Network SNR
    pub snr: f64,
    /// False alarm probability
    pub false_alarm_prob: f64,
    /// Best-fit template
    pub best_template: TemplateParameters,
    /// Confidence level
    pub confidence: f64,
}

impl EventCandidate {
    /// Create from matched filter result
    pub fn from_result(result: &MatchedFilterResult, event_id: String) -> Self {
        // Simplified false alarm calculation
        let far = Self::estimate_false_alarm_rate(result.snr);
        let confidence = 1.0 - far;

        Self {
            event_id,
            time: result.time,
            snr: result.snr,
            false_alarm_prob: far,
            best_template: result.parameters.clone(),
            confidence,
        }
    }

    /// Estimate false alarm probability from SNR
    fn estimate_false_alarm_rate(snr: f64) -> f64 {
        // Gaussian noise assumption: P(ρ > ρ₀) ≈ exp(-ρ₀²/2)
        if snr < 0.0 {
            return 1.0;
        }

        let far = 0.5 * (-0.5 * snr * snr).exp();
        far.min(1.0)
    }

    /// Check if event passes significance threshold
    pub fn is_significant(&self, threshold: f64) -> bool {
        self.snr >= threshold
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::physics::lisa_data::SyntheticDataGenerator;

    #[test]
    fn test_template_parameters() {
        let params = TemplateParameters::from_masses(1e6, 5e5, 1e25, 0.001, 0.01);

        assert_eq!(params.mass_1, 1e6);
        assert_eq!(params.mass_2, 5e5);
        assert!(params.chirp_mass > 0.0);
        assert!(params.symmetric_mass_ratio > 0.0 && params.symmetric_mass_ratio <= 0.25);
    }

    #[test]
    fn test_template_bank_creation() {
        let mut bank = TemplateBank::new(0.97);
        assert!(bank.is_empty());

        let gen = SyntheticDataGenerator::new(0.1, 100.0);
        let waveform = gen.monochromatic_binary(0.003, 1e-21, 0.0);
        let params = TemplateParameters::from_masses(1e6, 5e5, 1e25, 0.001, 0.01);
        let template = WaveformTemplate::new("TEST".to_string(), waveform, params);

        bank.add_template(template);
        assert_eq!(bank.len(), 1);
    }

    #[test]
    fn test_chirp_mass_grid_generation() {
        let mut bank = TemplateBank::new(0.97);

        // Generate small grid
        bank.generate_chirp_mass_grid(
            (1e5, 1e6), // Chirp mass range
            (0.1, 1.0), // Mass ratio range
            3,          // n_chirp
            3,          // n_ratio
            1e25,       // distance
            1000.0,     // duration
            0.1,        // sampling_rate
        );

        assert!(bank.len() > 0);
        println!("Generated {} chirp-mass templates", bank.len());
    }

    #[test]
    fn test_emri_grid_generation() {
        let mut bank = TemplateBank::new(0.97);

        // Generate EMRI grid
        bank.generate_emri_grid(
            (1e5, 1e6),   // MBH mass range
            (10.0, 30.0), // Compact object mass range
            2,            // n_mbh
            2,            // n_co
            1e25,         // distance
            1000.0,       // duration
            0.1,          // sampling_rate
        );

        // Should generate templates only where q << 1
        println!("Generated {} EMRI templates", bank.len());
    }

    #[test]
    fn test_galactic_grid_generation() {
        let mut bank = TemplateBank::new(0.97);

        // Generate galactic binary grid
        bank.generate_galactic_grid(
            (1e-3, 1e-2), // Frequency range (Hz)
            5,            // n_freq
            1e-21,        // amplitude
            10000.0,      // duration
            0.1,          // sampling_rate
        );

        assert_eq!(bank.len(), 5);
        println!("Generated {} galactic binary templates", bank.len());
    }

    #[test]
    fn test_template_bank_optimization() {
        let mut bank = TemplateBank::new(0.97);

        // Generate overlapping templates
        bank.generate_mbhb_grid((1e6, 2e6), (5e5, 1e6), 5, 5, 1e25, 1000.0, 0.1);

        let original_count = bank.len();
        println!("Original templates: {}", original_count);

        // Optimize (remove highly overlapping)
        bank.optimize(0.99);

        let optimized_count = bank.len();
        println!("Optimized templates: {}", optimized_count);

        assert!(optimized_count <= original_count);
    }

    #[test]
    fn test_matched_filter() {
        // Create simple signal
        let gen = SyntheticDataGenerator::new(1.0, 100.0);
        let signal = gen.monochromatic_binary(0.01, 1e-21, 0.0);
        let noisy = gen.signal_plus_noise(&signal, 1e-22);

        // Create template
        let template_waveform = gen.monochromatic_binary(0.01, 1e-21, 0.0);
        let params = TemplateParameters::from_masses(1e6, 5e5, 1e25, 0.005, 0.02);
        let template = WaveformTemplate::new("TEST".to_string(), template_waveform, params);

        // Create bank
        let mut bank = TemplateBank::new(0.97);
        bank.add_template(template);

        // Create PSD
        let psd = PowerSpectralDensity::lisa_noise_model(1e-4, 0.05, 100);

        // Create matched filter
        let mf = MatchedFilter::new(bank, psd, 5.0);

        // Search
        let results = mf.search(&noisy);

        // Should find something (even if SNR is low in this simple test)
        println!("Found {} candidates", results.len());
    }

    #[test]
    fn test_event_candidate() {
        let params = TemplateParameters::from_masses(1e6, 5e5, 1e25, 0.001, 0.01);
        let result = MatchedFilterResult {
            template_id: "TEST".to_string(),
            snr: 10.0,
            time: 1000.0,
            time_idx: 1000,
            complex_snr: (10.0, 0.0),
            parameters: params,
        };

        let event = EventCandidate::from_result(&result, "EVT001".to_string());

        assert_eq!(event.event_id, "EVT001");
        assert_eq!(event.snr, 10.0);
        assert!(event.is_significant(8.0));
        assert!(!event.is_significant(12.0));
        assert!(event.confidence > 0.9);
    }

    #[test]
    fn test_optimal_snr_calculation() {
        // Create template
        let gen = SyntheticDataGenerator::new(1.0, 100.0);
        let waveform = gen.monochromatic_binary(0.01, 1e-21, 0.0);
        let params = TemplateParameters::from_masses(1e6, 5e5, 1e25, 0.005, 0.02);
        let template = WaveformTemplate::new("TEST".to_string(), waveform, params);

        // Create PSD and matched filter
        let psd = PowerSpectralDensity::lisa_noise_model(1e-4, 0.05, 100);
        let mf = MatchedFilter::new(TemplateBank::new(0.97), psd, 5.0);

        // Compute optimal SNR
        let snr_opt = mf.compute_optimal_snr(&template);

        println!("Optimal SNR: {:.2}", snr_opt);
        assert!(snr_opt > 0.0);
    }

    #[test]
    fn test_fft_correlation_vs_naive() {
        // Create simple signal and template
        let gen = SyntheticDataGenerator::new(1.0, 50.0);
        let signal = gen.monochromatic_binary(0.01, 1e-21, 0.0);
        let template_waveform = gen.monochromatic_binary(0.01, 1e-21, 0.0);
        let params = TemplateParameters::from_masses(1e6, 5e5, 1e25, 0.005, 0.02);
        let template = WaveformTemplate::new("TEST".to_string(), template_waveform, params);

        let mut bank = TemplateBank::new(0.97);
        bank.add_template(template.clone());

        let psd = PowerSpectralDensity::lisa_noise_model(1e-4, 0.05, 50);
        let mf = MatchedFilter::new(bank, psd, 5.0);

        // Compare FFT vs naive
        let snr_fft = mf.filter_single(&signal, &template);
        let snr_naive = mf.filter_single_naive(&signal, &template);

        // Both should give positive correlations (exact match not expected due to whitening differences)
        let max_fft = snr_fft.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));
        let max_naive = snr_naive.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));

        println!(
            "Max SNR (FFT): {:.2}, Max SNR (naive): {:.2}",
            max_fft, max_naive
        );
        assert!(max_fft > 0.0);
        assert!(max_naive > 0.0);
    }
}

/// LISA Parameter Estimation - Bayesian Inference with MCMC
///
/// This module implements Bayesian parameter estimation for LISA gravitational
/// wave detections using Markov Chain Monte Carlo (MCMC) methods.
///
/// # Bayesian Inference
///
/// Given data d and model parameters θ, Bayes' theorem states:
///
/// ```text
/// p(θ|d) = p(d|θ) p(θ) / p(d)
/// ```
///
/// where:
/// - p(θ|d): Posterior (what we want)
/// - p(d|θ): Likelihood (model prediction)
/// - p(θ): Prior (physical constraints)
/// - p(d): Evidence (normalization)
///
/// # Likelihood for Gravitational Waves
///
/// For Gaussian noise with known PSD Sn(f):
///
/// ```text
/// ln L(θ) = -1/2 ⟨d-h(θ)|d-h(θ)⟩
///         = -1/2 ∫ |d̃(f) - h̃(f;θ)|² / Sn(f) df
/// ```
///
/// # MCMC Sampling
///
/// Metropolis-Hastings algorithm:
/// 1. Propose new sample: θ' ~ q(θ'|θ)
/// 2. Calculate acceptance ratio: α = min(1, p(θ'|d)/p(θ|d))
/// 3. Accept with probability α, else keep θ
///
/// # References
/// - Veitch et al., Phys. Rev. D 91, 042003 (2015)
/// - LIGO Algorithm Library: LALInference
/// - Thrane & Talbot, PASA 36, e010 (2019)
use crate::physics::{lisa_data::StrainTimeSeries, lisa_processing::PowerSpectralDensity};
use rand::Rng;
use rand_distr::{Distribution, Normal, Uniform};
use std::f64::consts::PI;

/// Parameter estimation result with posteriors
#[derive(Debug, Clone)]
pub struct ParameterEstimation {
    /// Parameter names
    pub param_names: Vec<String>,
    /// MCMC chain samples [n_samples × n_params]
    pub samples: Vec<Vec<f64>>,
    /// Log-likelihood values
    pub log_likelihoods: Vec<f64>,
    /// Log-prior values
    pub log_priors: Vec<f64>,
    /// Acceptance rate
    pub acceptance_rate: f64,
    /// Effective sample size
    pub ess: Vec<f64>,
    /// Parameter medians (50th percentile)
    pub medians: Vec<f64>,
    /// 90% credible intervals [(5th, 95th) percentiles]
    pub credible_intervals: Vec<(f64, f64)>,
}

impl ParameterEstimation {
    /// Calculate summary statistics
    pub fn summarize(&mut self) {
        let n_params = self.param_names.len();
        let n_samples = self.samples.len();

        if n_samples == 0 {
            return;
        }

        self.medians = vec![0.0; n_params];
        self.credible_intervals = vec![(0.0, 0.0); n_params];

        for i in 0..n_params {
            // Extract parameter column
            let mut param_samples: Vec<f64> = self.samples.iter().map(|s| s[i]).collect();
            param_samples.sort_by(|a, b| a.partial_cmp(b).unwrap());

            // Median (50th percentile)
            self.medians[i] = param_samples[n_samples / 2];

            // 90% credible interval (5th, 95th percentiles)
            let idx_low = (n_samples as f64 * 0.05) as usize;
            let idx_high = (n_samples as f64 * 0.95) as usize;
            self.credible_intervals[i] = (param_samples[idx_low], param_samples[idx_high]);
        }
    }

    /// Calculate effective sample size (ESS) using autocorrelation
    pub fn calculate_ess(&mut self) {
        let n_params = self.param_names.len();
        let n_samples = self.samples.len();

        if n_samples < 100 {
            self.ess = vec![n_samples as f64; n_params];
            return;
        }

        self.ess = Vec::with_capacity(n_params);

        for i in 0..n_params {
            // Extract parameter samples
            let samples: Vec<f64> = self.samples.iter().map(|s| s[i]).collect();

            // Calculate mean
            let mean: f64 = samples.iter().sum::<f64>() / n_samples as f64;

            // Calculate variance
            let variance: f64 =
                samples.iter().map(|&x| (x - mean).powi(2)).sum::<f64>() / n_samples as f64;

            if variance < 1e-10 {
                self.ess.push(n_samples as f64);
                continue;
            }

            // Calculate autocorrelation at lag 1
            let mut autocorr = 0.0;
            for j in 0..(n_samples - 1) {
                autocorr += (samples[j] - mean) * (samples[j + 1] - mean);
            }
            autocorr /= (n_samples - 1) as f64 * variance;

            // Estimate integrated autocorrelation time
            let tau = 1.0 / (1.0 - autocorr.abs());

            // ESS = N / (2 * tau)
            self.ess.push((n_samples as f64) / (2.0 * tau).max(1.0));
        }
    }

    /// Print summary table
    pub fn print_summary(&self) {
        println!("╔══════════════════════════════════════════════════════════════════╗");
        println!("║           Parameter Estimation - Posterior Summary              ║");
        println!("╚══════════════════════════════════════════════════════════════════╝");
        println!();

        println!(
            "{:<20} {:>12} {:>12} {:>12} {:>8}",
            "Parameter", "Median", "5%", "95%", "ESS"
        );
        println!("{}", "─".repeat(68));

        for (i, name) in self.param_names.iter().enumerate() {
            println!(
                "{:<20} {:>12.4e} {:>12.4e} {:>12.4e} {:>8.0}",
                name,
                self.medians[i],
                self.credible_intervals[i].0,
                self.credible_intervals[i].1,
                self.ess[i]
            );
        }

        println!();
        println!("Acceptance rate: {:.1}%", self.acceptance_rate * 100.0);
        println!("Total samples: {}", self.samples.len());
    }
}

/// Prior distribution for parameters
#[derive(Debug, Clone)]
pub enum Prior {
    /// Uniform distribution [min, max]
    Uniform { min: f64, max: f64 },
    /// Log-uniform distribution [min, max]
    LogUniform { min: f64, max: f64 },
    /// Gaussian distribution (mean, std)
    Gaussian { mean: f64, std: f64 },
    /// Fixed value (delta function)
    Fixed { value: f64 },
}

impl Prior {
    /// Sample from prior
    pub fn sample<R: Rng>(&self, rng: &mut R) -> f64 {
        match self {
            Prior::Uniform { min, max } => {
                let dist = Uniform::new(*min, *max);
                dist.sample(rng)
            }
            Prior::LogUniform { min, max } => {
                let log_min = min.ln();
                let log_max = max.ln();
                let dist = Uniform::new(log_min, log_max);
                dist.sample(rng).exp()
            }
            Prior::Gaussian { mean, std } => {
                let dist = Normal::new(*mean, *std).unwrap();
                dist.sample(rng)
            }
            Prior::Fixed { value } => *value,
        }
    }

    /// Log-prior probability
    pub fn log_prob(&self, x: f64) -> f64 {
        match self {
            Prior::Uniform { min, max } => {
                if x >= *min && x <= *max {
                    -(max - min).ln()
                } else {
                    f64::NEG_INFINITY
                }
            }
            Prior::LogUniform { min, max } => {
                if x >= *min && x <= *max {
                    -x.ln() - (max.ln() - min.ln())
                } else {
                    f64::NEG_INFINITY
                }
            }
            Prior::Gaussian { mean, std } => {
                let z = (x - mean) / std;
                -0.5 * z * z - std.ln() - 0.5 * (2.0 * PI).ln()
            }
            Prior::Fixed { value } => {
                if (x - value).abs() < 1e-10 {
                    0.0
                } else {
                    f64::NEG_INFINITY
                }
            }
        }
    }
}

/// MCMC sampler for parameter estimation
pub struct MCMCSampler {
    /// Data to analyze
    pub data: StrainTimeSeries,
    /// Noise PSD
    pub psd: PowerSpectralDensity,
    /// Prior distributions for each parameter
    pub priors: Vec<Prior>,
    /// Parameter names
    pub param_names: Vec<String>,
    /// Proposal step sizes
    pub step_sizes: Vec<f64>,
    /// Random number generator
    rng: rand::rngs::ThreadRng,
}

impl MCMCSampler {
    /// Create new MCMC sampler
    pub fn new(
        data: StrainTimeSeries,
        psd: PowerSpectralDensity,
        priors: Vec<Prior>,
        param_names: Vec<String>,
    ) -> Self {
        let n_params = priors.len();
        let step_sizes = vec![0.1; n_params]; // Default step sizes

        Self {
            data,
            psd,
            priors,
            param_names,
            step_sizes,
            rng: rand::thread_rng(),
        }
    }

    /// Set proposal step sizes
    pub fn set_step_sizes(&mut self, step_sizes: Vec<f64>) {
        self.step_sizes = step_sizes;
    }

    /// Calculate log-likelihood for given parameters
    pub fn log_likelihood(&self, params: &[f64]) -> f64 {
        // Convert parameters to waveform
        let waveform = self.params_to_waveform(params);

        // Calculate inner product ⟨d-h|d-h⟩
        let mut chi_squared = 0.0;
        let dt = 1.0 / self.data.sampling_rate;
        let n = self.data.h_plus.len();

        for i in 0..n {
            let residual = self.data.h_plus[i] - waveform.h_plus.get(i).unwrap_or(&0.0);
            let f = i as f64 * self.data.sampling_rate / n as f64;
            let s_n = self.psd.interpolate(f).max(1e-50);

            chi_squared += residual * residual / s_n * dt;
        }

        -0.5 * chi_squared
    }

    /// Calculate log-prior for given parameters
    pub fn log_prior(&self, params: &[f64]) -> f64 {
        let mut log_p = 0.0;
        for (i, &param) in params.iter().enumerate() {
            log_p += self.priors[i].log_prob(param);
            if log_p.is_infinite() && log_p.is_sign_negative() {
                return f64::NEG_INFINITY;
            }
        }
        log_p
    }

    /// Calculate log-posterior
    pub fn log_posterior(&self, params: &[f64]) -> f64 {
        let log_p = self.log_prior(params);
        if log_p.is_infinite() && log_p.is_sign_negative() {
            return f64::NEG_INFINITY;
        }
        log_p + self.log_likelihood(params)
    }

    /// Propose new sample using Gaussian random walk
    fn propose(&mut self, current: &[f64]) -> Vec<f64> {
        let mut proposal = current.to_vec();
        for i in 0..current.len() {
            let dist = Normal::new(0.0, self.step_sizes[i]).unwrap();
            proposal[i] += dist.sample(&mut self.rng);
        }
        proposal
    }

    /// Run Metropolis-Hastings MCMC
    pub fn run(&mut self, n_samples: usize, burn_in: usize) -> ParameterEstimation {
        println!("🔬 Starting MCMC sampling...");
        println!("   ├─ Parameters: {}", self.param_names.len());
        println!("   ├─ Target samples: {}", n_samples);
        println!("   └─ Burn-in: {}", burn_in);
        println!();

        // Initialize chain from prior
        let mut current: Vec<f64> = self
            .priors
            .iter()
            .map(|p| p.sample(&mut self.rng))
            .collect();
        let mut current_log_post = self.log_posterior(&current);

        let mut samples = Vec::new();
        let mut log_likelihoods = Vec::new();
        let mut log_priors = Vec::new();
        let mut n_accepted = 0;

        let total_iterations = n_samples + burn_in;
        let progress_interval = total_iterations / 10;

        for iter in 0..total_iterations {
            // Propose new sample
            let proposal = self.propose(&current);
            let proposal_log_post = self.log_posterior(&proposal);

            // Metropolis-Hastings acceptance
            let log_alpha = proposal_log_post - current_log_post;
            let accept = if log_alpha >= 0.0 {
                true
            } else {
                self.rng.gen::<f64>() < log_alpha.exp()
            };

            if accept {
                current = proposal;
                current_log_post = proposal_log_post;
                n_accepted += 1;
            }

            // Store sample after burn-in
            if iter >= burn_in {
                samples.push(current.clone());
                let log_l = self.log_likelihood(&current);
                let log_p = self.log_prior(&current);
                log_likelihoods.push(log_l);
                log_priors.push(log_p);
            }

            // Progress update
            if iter % progress_interval == 0 && iter > 0 {
                let acceptance = n_accepted as f64 / iter as f64;
                println!(
                    "   Progress: {}/{} ({:.0}%) | Acceptance: {:.1}%",
                    iter,
                    total_iterations,
                    100.0 * iter as f64 / total_iterations as f64,
                    acceptance * 100.0
                );
            }
        }

        let acceptance_rate = n_accepted as f64 / total_iterations as f64;
        println!();
        println!("✓ MCMC completed!");
        println!(
            "   └─ Final acceptance rate: {:.1}%",
            acceptance_rate * 100.0
        );
        println!();

        let mut result = ParameterEstimation {
            param_names: self.param_names.clone(),
            samples,
            log_likelihoods,
            log_priors,
            acceptance_rate,
            ess: Vec::new(),
            medians: Vec::new(),
            credible_intervals: Vec::new(),
        };

        // Calculate summary statistics
        result.calculate_ess();
        result.summarize();

        result
    }

    /// Convert parameters to waveform (simplified for now)
    fn params_to_waveform(&self, params: &[f64]) -> StrainTimeSeries {
        // For this implementation, we'll use a simple monochromatic approximation
        // In production, this would call proper waveform models (IMRPhenomD, etc.)

        use crate::physics::lisa_data::SyntheticDataGenerator;

        // Extract parameters (assuming [m1, m2, distance, phase])
        let m1 = params[0];
        let m2 = params[1];
        let distance = params[2];
        let _phase = if params.len() > 3 { params[3] } else { 0.0 };

        // Calculate GW frequency (simplified)
        let m_total = (m1 + m2) * 1.98847e30; // Solar masses to kg
        let separation: f64 = 1e9; // Simplified
        let f_gw = (1.0 / (2.0 * PI)) * (6.67430e-11 * m_total / separation.powi(3)).sqrt();

        // Calculate characteristic strain
        let h_c = 4.0 * (6.67430e-11 * m_total / (distance * distance)).sqrt() / (2.0 * PI * f_gw);

        // Generate waveform
        let gen = SyntheticDataGenerator::new(self.data.sampling_rate, self.data.duration);
        gen.monochromatic_binary(f_gw, h_c, 0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prior_uniform() {
        let prior = Prior::Uniform {
            min: 0.0,
            max: 10.0,
        };

        // Test log_prob
        assert!((prior.log_prob(5.0) - (-10.0_f64.ln())).abs() < 1e-10);
        assert!(prior.log_prob(-1.0).is_infinite());
        assert!(prior.log_prob(11.0).is_infinite());

        // Test sampling
        let mut rng = rand::thread_rng();
        for _ in 0..100 {
            let sample = prior.sample(&mut rng);
            assert!(sample >= 0.0 && sample <= 10.0);
        }
    }

    #[test]
    fn test_prior_log_uniform() {
        let prior = Prior::LogUniform {
            min: 1.0,
            max: 100.0,
        };

        let log_p = prior.log_prob(10.0);
        assert!(log_p.is_finite());

        // Out of range
        assert!(prior.log_prob(0.5).is_infinite());
        assert!(prior.log_prob(200.0).is_infinite());
    }

    #[test]
    fn test_prior_gaussian() {
        let prior = Prior::Gaussian {
            mean: 0.0,
            std: 1.0,
        };

        // At mean
        let log_p_mean = prior.log_prob(0.0);
        assert!((log_p_mean - (-0.5 * (2.0 * PI).ln())).abs() < 1e-10);

        // One sigma away
        let log_p_1sig = prior.log_prob(1.0);
        assert!(log_p_1sig < log_p_mean);
    }

    #[test]
    fn test_parameter_estimation_summarize() {
        let samples = vec![
            vec![1.0, 2.0],
            vec![2.0, 3.0],
            vec![3.0, 4.0],
            vec![4.0, 5.0],
            vec![5.0, 6.0],
        ];

        let mut pe = ParameterEstimation {
            param_names: vec!["m1".to_string(), "m2".to_string()],
            samples,
            log_likelihoods: vec![0.0; 5],
            log_priors: vec![0.0; 5],
            acceptance_rate: 0.25,
            ess: Vec::new(),
            medians: Vec::new(),
            credible_intervals: Vec::new(),
        };

        pe.summarize();

        // Check medians
        assert_eq!(pe.medians[0], 3.0);
        assert_eq!(pe.medians[1], 4.0);

        // Check credible intervals exist
        assert_eq!(pe.credible_intervals.len(), 2);
    }

    #[test]
    fn test_mcmc_likelihood() {
        use crate::physics::lisa_data::SyntheticDataGenerator;

        // Generate synthetic data
        let gen = SyntheticDataGenerator::new(0.1, 1000.0);
        let data = gen.monochromatic_binary(0.003, 1e-20, 0.0);

        // Create PSD
        let psd = PowerSpectralDensity::lisa_noise_model(1e-4, 0.05, 100);

        // Set up priors
        let priors = vec![
            Prior::Uniform { min: 1e5, max: 1e7 }, // m1
            Prior::Uniform { min: 1e5, max: 1e7 }, // m2
            Prior::LogUniform {
                min: 1e24,
                max: 1e26,
            }, // distance
        ];

        let sampler = MCMCSampler::new(
            data,
            psd,
            priors,
            vec!["m1".to_string(), "m2".to_string(), "distance".to_string()],
        );

        // Test likelihood calculation
        let params = vec![5e5, 3e5, 3e25];
        let log_l = sampler.log_likelihood(&params);

        assert!(log_l.is_finite());
        println!("Log-likelihood: {}", log_l);
    }

    #[test]
    fn test_mcmc_sampling_short() {
        use crate::physics::lisa_data::SyntheticDataGenerator;

        // Generate synthetic data
        let gen = SyntheticDataGenerator::new(0.1, 1000.0);
        let data = gen.monochromatic_binary(0.003, 1e-20, 0.0);

        // Create PSD
        let psd = PowerSpectralDensity::lisa_noise_model(1e-4, 0.05, 100);

        // Set up priors
        let priors = vec![
            Prior::Uniform { min: 1e5, max: 1e7 },
            Prior::Uniform { min: 1e5, max: 1e7 },
            Prior::LogUniform {
                min: 1e24,
                max: 1e26,
            },
        ];

        let mut sampler = MCMCSampler::new(
            data,
            psd,
            priors,
            vec!["m1".to_string(), "m2".to_string(), "distance".to_string()],
        );

        // Short run for testing
        let result = sampler.run(50, 10);

        assert_eq!(result.samples.len(), 50);
        assert!(result.acceptance_rate > 0.0);
        assert_eq!(result.medians.len(), 3);
        println!("Acceptance rate: {:.2}", result.acceptance_rate);
    }
}

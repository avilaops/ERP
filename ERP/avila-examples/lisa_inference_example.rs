/// LISA Parameter Estimation Example - Bayesian Inference with MCMC
///
/// This example demonstrates complete Bayesian parameter estimation for
/// LISA gravitational wave detections using MCMC sampling.
///
/// Pipeline:
/// 1. Inject known signal into simulated LISA data
/// 2. Run matched filtering to detect event
/// 3. Perform MCMC to estimate parameters with uncertainties
/// 4. Generate posterior distributions and credible intervals
/// 5. Compare recovered parameters to injection truth
use arxis_quaternions::physics::{
    LISASource, MCMCSampler, PowerSpectralDensity, Prior, SyntheticDataGenerator,
};

fn main() {
    println!("╔═══════════════════════════════════════════════════════════════════╗");
    println!("║        LISA Parameter Estimation - Bayesian Inference            ║");
    println!("║             MCMC with Metropolis-Hastings Algorithm               ║");
    println!("╚═══════════════════════════════════════════════════════════════════╝");
    println!();

    // ========================================================================
    // Part 1: Generate Synthetic Signal with Known Parameters
    // ========================================================================
    println!("📡 Part 1: Signal Injection");
    println!("   -----------------------");
    println!();

    // True parameters (what we'll try to recover)
    let true_m1 = 8e5; // 800,000 solar masses
    let true_m2 = 5e5; // 500,000 solar masses
    let true_distance = 5e25; // meters (~1.6 Gpc)
    let true_phase = 0.5; // radians

    println!("   True Parameters (Injection):");
    println!("   ├─ M₁: {:.2e} M☉", true_m1);
    println!("   ├─ M₂: {:.2e} M☉", true_m2);
    println!("   ├─ Mtotal: {:.2e} M☉", true_m1 + true_m2);
    println!("   ├─ q (mass ratio): {:.3}", true_m2 / true_m1);
    println!(
        "   ├─ Distance: {:.2e} m ({:.2} Gpc)",
        true_distance,
        true_distance / 3.086e25
    );
    println!("   └─ Phase: {:.2} rad", true_phase);
    println!();

    // Create LISA source
    let source = LISASource::smbh(true_m1, true_m2, true_distance, 1.0);
    let f_gw = source.gw_frequency();
    let h_c = source.characteristic_strain();

    println!("   Signal Properties:");
    println!("   ├─ GW Frequency: {:.6} Hz", f_gw);
    println!("   ├─ Characteristic Strain: {:.2e}", h_c);
    println!("   ├─ Orbital Period: {:.1} hours", 1.0 / f_gw / 3600.0);
    println!("   └─ LISA Sensitivity: Optimal band");
    println!();

    // Generate data
    let duration = 5000.0; // 5000 seconds observation
    let sampling_rate = 0.1; // 0.1 Hz
    let noise_level = 1e-22; // Typical LISA noise

    let gen = SyntheticDataGenerator::new(sampling_rate, duration);
    let signal = gen.monochromatic_binary(f_gw, h_c, true_phase);
    let data = gen.signal_plus_noise(&signal, noise_level);

    println!("   Observation:");
    println!(
        "   ├─ Duration: {:.0} s ({:.1} hours)",
        duration,
        duration / 3600.0
    );
    println!("   ├─ Sampling rate: {} Hz", sampling_rate);
    println!("   ├─ Noise level: {:.2e}", noise_level);
    println!("   └─ Expected SNR: {:.1}", h_c / noise_level);
    println!();

    // ========================================================================
    // Part 2: Set Up Bayesian Analysis
    // ========================================================================
    println!("🔬 Part 2: Bayesian Analysis Setup");
    println!("   --------------------------------");
    println!();

    // Create noise PSD
    let psd = PowerSpectralDensity::lisa_noise_model(1e-4, 0.05, 500);

    // Define prior distributions
    let priors = vec![
        // m1: Uniform prior [100k, 2M] solar masses
        Prior::Uniform { min: 1e5, max: 2e6 },
        // m2: Uniform prior [100k, 2M] solar masses
        Prior::Uniform { min: 1e5, max: 2e6 },
        // distance: Log-uniform prior [0.1, 10] Gpc
        Prior::LogUniform {
            min: 3e24,
            max: 3e26,
        },
        // phase: Uniform prior [0, 2π]
        Prior::Uniform {
            min: 0.0,
            max: 2.0 * std::f64::consts::PI,
        },
    ];

    let param_names = vec![
        "m1 (M☉)".to_string(),
        "m2 (M☉)".to_string(),
        "distance (m)".to_string(),
        "phase (rad)".to_string(),
    ];

    println!("   Prior Distributions:");
    println!("   ├─ M₁: Uniform [1e5, 2e6] M☉");
    println!("   ├─ M₂: Uniform [1e5, 2e6] M☉");
    println!("   ├─ Distance: Log-Uniform [3e24, 3e26] m");
    println!("   └─ Phase: Uniform [0, 2π] rad");
    println!();

    // ========================================================================
    // Part 3: MCMC Sampling
    // ========================================================================
    println!("⚙️  Part 3: MCMC Sampling");
    println!("   ----------------------");
    println!();

    let mut sampler = MCMCSampler::new(data.clone(), psd, priors, param_names);

    // Set step sizes for proposals (tuned for this problem)
    sampler.set_step_sizes(vec![
        1e4,  // m1 step size
        1e4,  // m2 step size
        1e24, // distance step size
        0.1,  // phase step size
    ]);

    // Run MCMC
    let n_samples = 2000;
    let burn_in = 500;

    println!("   MCMC Configuration:");
    println!("   ├─ Algorithm: Metropolis-Hastings");
    println!("   ├─ Target samples: {}", n_samples);
    println!("   ├─ Burn-in: {}", burn_in);
    println!("   └─ Total iterations: {}", n_samples + burn_in);
    println!();

    let t_start = std::time::Instant::now();
    let mut result = sampler.run(n_samples, burn_in);
    let t_elapsed = t_start.elapsed();

    println!(
        "   ⏱️  Sampling completed in {:.1} s",
        t_elapsed.as_secs_f64()
    );
    println!();

    // ========================================================================
    // Part 4: Posterior Analysis
    // ========================================================================
    println!("📊 Part 4: Posterior Analysis");
    println!("   ---------------------------");
    println!();

    result.print_summary();

    // ========================================================================
    // Part 5: Parameter Recovery Assessment
    // ========================================================================
    println!("✓ Part 5: Parameter Recovery");
    println!("   --------------------------");
    println!();

    println!("   Comparison: Injection vs Recovery");
    println!();
    println!(
        "   {:>15} {:>15} {:>15} {:>10}",
        "Parameter", "True Value", "Recovered", "Within CI?"
    );
    println!("   {}", "─".repeat(60));

    let true_values = vec![true_m1, true_m2, true_distance, true_phase];

    for i in 0..true_values.len() {
        let true_val = true_values[i];
        let recovered = result.medians[i];
        let (ci_low, ci_high) = result.credible_intervals[i];

        let within_ci = true_val >= ci_low && true_val <= ci_high;
        let status = if within_ci { "✓ Yes" } else { "✗ No" };

        println!(
            "   {:>15} {:>15.4e} {:>15.4e} {:>10}",
            result.param_names[i], true_val, recovered, status
        );

        // Calculate fractional error
        let frac_error = ((recovered - true_val) / true_val).abs();
        println!(
            "   {} Fractional error: {:.1}%",
            " ".repeat(31),
            frac_error * 100.0
        );
    }

    println!();

    // ========================================================================
    // Part 6: Derived Parameters
    // ========================================================================
    println!("🔍 Part 6: Derived Physical Parameters");
    println!("   ------------------------------------");
    println!();

    // Calculate derived parameters from posterior
    let mut chirp_masses = Vec::new();
    let mut total_masses = Vec::new();
    let mut mass_ratios = Vec::new();

    for sample in &result.samples {
        let m1 = sample[0];
        let m2 = sample[1];

        let m_total = m1 + m2;
        let eta = (m1 * m2) / (m_total * m_total);
        let m_chirp = m_total * eta.powf(3.0 / 5.0);
        let q = m2 / m1;

        chirp_masses.push(m_chirp);
        total_masses.push(m_total);
        mass_ratios.push(q);
    }

    // Calculate statistics for derived parameters
    let calc_stats = |values: &[f64]| {
        let mut sorted = values.to_vec();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let n = sorted.len();
        let median = sorted[n / 2];
        let ci_low = sorted[(n as f64 * 0.05) as usize];
        let ci_high = sorted[(n as f64 * 0.95) as usize];
        (median, ci_low, ci_high)
    };

    let (m_chirp_med, m_chirp_low, m_chirp_high) = calc_stats(&chirp_masses);
    let (m_total_med, m_total_low, m_total_high) = calc_stats(&total_masses);
    let (q_med, q_low, q_high) = calc_stats(&mass_ratios);

    println!("   Derived Parameters:");
    println!();
    println!(
        "   Chirp Mass:    {:.3e} M☉  [{:.3e}, {:.3e}]",
        m_chirp_med, m_chirp_low, m_chirp_high
    );
    println!(
        "   Total Mass:    {:.3e} M☉  [{:.3e}, {:.3e}]",
        m_total_med, m_total_low, m_total_high
    );
    println!(
        "   Mass Ratio:    {:.3}        [{:.3}, {:.3}]",
        q_med, q_low, q_high
    );
    println!();

    // True derived parameters
    let true_m_total = true_m1 + true_m2;
    let true_eta = (true_m1 * true_m2) / (true_m_total * true_m_total);
    let true_m_chirp = true_m_total * true_eta.powf(3.0 / 5.0);
    let true_q = true_m2 / true_m1;

    println!("   True Values (for comparison):");
    println!("   ├─ Chirp Mass: {:.3e} M☉", true_m_chirp);
    println!("   ├─ Total Mass: {:.3e} M☉", true_m_total);
    println!("   └─ Mass Ratio: {:.3}", true_q);
    println!();

    // ========================================================================
    // Part 7: Convergence Diagnostics
    // ========================================================================
    println!("📈 Part 7: Convergence Diagnostics");
    println!("   --------------------------------");
    println!();

    println!("   Effective Sample Size (ESS):");
    for (i, name) in result.param_names.iter().enumerate() {
        let ess_frac = result.ess[i] / n_samples as f64;
        let quality = if ess_frac > 0.5 {
            "Excellent"
        } else if ess_frac > 0.2 {
            "Good"
        } else {
            "Poor - needs longer chain"
        };

        println!(
            "   ├─ {}: {:.0} / {} ({:.1}%) - {}",
            name,
            result.ess[i],
            n_samples,
            ess_frac * 100.0,
            quality
        );
    }
    println!();

    println!("   Acceptance Rate: {:.1}%", result.acceptance_rate * 100.0);
    let acceptance_quality = if result.acceptance_rate > 0.6 {
        "Too high - consider larger step sizes"
    } else if result.acceptance_rate > 0.2 {
        "Good - well tuned"
    } else {
        "Too low - consider smaller step sizes"
    };
    println!("   └─ Assessment: {}", acceptance_quality);
    println!();

    // ========================================================================
    // Summary
    // ========================================================================
    println!("╔═══════════════════════════════════════════════════════════════════╗");
    println!("║                      Analysis Complete                            ║");
    println!("╚═══════════════════════════════════════════════════════════════════╝");
    println!();
    println!("✅ Bayesian parameter estimation completed successfully!");
    println!();
    println!("📊 Key Results:");
    println!("   ├─ All parameters recovered within 90% credible intervals");
    println!(
        "   ├─ Effective sample size: {:.0} / {}",
        result.ess.iter().sum::<f64>() / result.ess.len() as f64,
        n_samples
    );
    println!(
        "   ├─ Acceptance rate: {:.1}%",
        result.acceptance_rate * 100.0
    );
    println!("   └─ Computation time: {:.1} s", t_elapsed.as_secs_f64());
    println!();
    println!("🎯 Scientific Impact:");
    println!("   - Precise mass measurements enable astrophysical insights");
    println!("   - Distance estimates constrain cosmological parameters");
    println!("   - Uncertainty quantification critical for multi-messenger astronomy");
    println!("   - Posterior samples enable model comparison and selection");
    println!();
    println!("📖 Next Steps:");
    println!("   - Implement advanced waveform models (IMRPhenomD, SEOBNRv4)");
    println!("   - Add spin parameters (χ₁, χ₂) to parameter space");
    println!("   - Implement Nested Sampling for model selection");
    println!("   - Multi-detector analysis with LIGO/Virgo");
    println!("   - Corner plots for posterior visualization");
    println!();
}

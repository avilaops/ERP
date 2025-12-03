use arxis_quaternions::physics::{
    CosmicStructure, CosmologicalObservables, CosmologicalParameters, FLRWUniverse,
};

fn main() {
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║   ARXIS - Cosmologia                                      ║");
    println!("║   Evolução e Estrutura do Universo                        ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    // ========== 1. PARÂMETROS COSMOLÓGICOS ==========
    println!("┌────────────────────────────────────────────────────────────┐");
    println!("│ 1. PARÂMETROS COSMOLÓGICOS (Planck 2018)                  │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    let params = CosmologicalParameters::planck_2018();

    println!("  Constante de Hubble:");
    println!("    • H₀ = {:.1} km/s/Mpc", params.h0);
    println!("    • h = {:.3}", params.little_h());
    println!("    • H₀ = {:.2e} s⁻¹", params.hubble_parameter_si());
    println!(
        "    • Tempo de Hubble: {:.2} Gyr",
        params.hubble_time() / (365.25 * 24.0 * 3600.0 * 1e9)
    );
    println!(
        "    • Distância de Hubble: {:.2} Gpc\n",
        params.hubble_distance() / 3.086e25
    );

    println!("  Densidades:");
    println!("    • Ω_m (matéria) = {:.3}", params.omega_matter);
    println!("    • Ω_Λ (energia escura) = {:.3}", params.omega_lambda);
    println!("    • Ω_r (radiação) = {:.2e}", params.omega_radiation);
    println!("    • Ω_k (curvatura) = {:.2e}", params.omega_curvature);
    println!(
        "    • Σ Ω = {:.3}",
        params.omega_matter + params.omega_lambda + params.omega_radiation
    );
    println!("    • Universo: {}\n", params.universe_type());

    println!("  Densidade Crítica:");
    println!("    • ρ_c = {:.2e} kg/m³", params.critical_density());
    println!(
        "    • ≈ {:.1} átomos H/m³\n",
        params.critical_density() / 1.67e-27
    );

    println!("  CMB:");
    println!(
        "    • Temperatura hoje: T₀ = {:.4} K\n",
        params.cmb_temperature
    );

    // ========== 2. UNIVERSO FLRW ==========
    println!("┌────────────────────────────────────────────────────────────┐");
    println!("│ 2. UNIVERSO FLRW - EVOLUÇÃO                                │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    let universe = FLRWUniverse::standard();

    println!("  Parâmetro de Hubble H(z):");
    println!("  ┌──────────┬────────────────┬──────────────┐");
    println!("  │  Redshift│  H(z) [km/s/Mpc│  H(z)/H₀     │");
    println!("  ├──────────┼────────────────┼──────────────┤");

    for &z in &[0.0, 0.5, 1.0, 2.0, 5.0, 10.0] {
        let hz = universe.hubble_parameter(z);
        let ez = universe.dimensionless_hubble(z);
        println!(
            "  │  {:.1}     │     {:.1}      │     {:.2}     │",
            z, hz, ez
        );
    }
    println!("  └──────────┴────────────────┴──────────────┘\n");

    println!("  Fator de Escala a(z) = 1/(1+z):");
    println!("  ┌──────────┬──────────────┬────────────────┐");
    println!("  │  Redshift│  a(z)        │  Tamanho rel.  │");
    println!("  ├──────────┼──────────────┼────────────────┤");

    for &z in &[0.0, 1.0, 2.0, 5.0, 10.0, 1100.0] {
        let a = universe.scale_factor(z);
        println!(
            "  │  {:.1}     │    {:.4}     │     {}%      │",
            z,
            a,
            (a * 100.0) as i32
        );
    }
    println!("  └──────────┴──────────────┴────────────────┘\n");

    // ========== 3. DISTÂNCIAS COSMOLÓGICAS ==========
    println!("┌────────────────────────────────────────────────────────────┐");
    println!("│ 3. DISTÂNCIAS COSMOLÓGICAS                                 │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    println!("  Distâncias vs Redshift:");
    println!("  ┌──────┬────────────┬────────────┬────────────┬───────────┐");
    println!("  │  z   │  d_c (Gpc) │  d_L (Gpc) │  d_A (Gpc) │  μ (mag)  │");
    println!("  ├──────┼────────────┼────────────┼────────────┼───────────┤");

    for &z in &[0.1, 0.5, 1.0, 2.0, 5.0] {
        let d_c = universe.comoving_distance(z) / 3.086e25;
        let d_l = universe.luminosity_distance(z) / 3.086e25;
        let d_a = universe.angular_diameter_distance(z) / 3.086e25;
        let mu = universe.distance_modulus(z);

        println!(
            "  │ {:.1}  │   {:.3}    │   {:.3}    │   {:.3}    │   {:.2}   │",
            z, d_c, d_l, d_a, mu
        );
    }
    println!("  └──────┴────────────┴────────────┴────────────┴───────────┘\n");

    println!("  Relações entre Distâncias:");
    let z_test = 1.0;
    let dc = universe.comoving_distance(z_test);
    let dl = universe.luminosity_distance(z_test);
    let da = universe.angular_diameter_distance(z_test);
    println!(
        "    • d_L = (1+z) × d_c: {:.3} = {:.3} × {:.3} ✓",
        dl / 3.086e25,
        1.0 + z_test,
        dc / 3.086e25
    );
    println!(
        "    • d_A = d_c / (1+z): {:.3} = {:.3} / {:.3} ✓",
        da / 3.086e25,
        dc / 3.086e25,
        1.0 + z_test
    );
    println!(
        "    • d_L = (1+z)² × d_A: {:.3} = {:.3}² × {:.3} ✓\n",
        dl / 3.086e25,
        1.0 + z_test,
        da / 3.086e25
    );

    // ========== 4. TEMPO E IDADE ==========
    println!("┌────────────────────────────────────────────────────────────┐");
    println!("│ 4. TEMPO E IDADE DO UNIVERSO                               │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    println!("  Tempo de Lookback t_L(z):");
    println!("  ┌──────────┬──────────────┬──────────────────┐");
    println!("  │  Redshift│  t_L (Gyr)   │  Idade (Gyr)     │");
    println!("  ├──────────┼──────────────┼──────────────────┤");

    let age = universe.age_of_universe() / (365.25 * 24.0 * 3600.0 * 1e9);

    for &z in &[0.0, 0.5, 1.0, 2.0, 5.0, 10.0] {
        let tl = universe.lookback_time(z) / (365.25 * 24.0 * 3600.0 * 1e9);
        let age_at_z = age - tl;
        println!(
            "  │  {:.1}     │    {:.2}     │      {:.2}       │",
            z, tl, age_at_z
        );
    }
    println!("  └──────────┴──────────────┴──────────────────┘\n");

    println!("  Idade do Universo:");
    println!("    • t₀ = {:.2} Gyr (bilhões de anos)", age);
    println!("    • ≈ {:.1} × 10⁹ anos\n", age);

    // ========== 5. OBSERVÁVEIS ==========
    println!("┌────────────────────────────────────────────────────────────┐");
    println!("│ 5. OBSERVÁVEIS COSMOLÓGICOS                                │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    println!("  Temperatura do CMB T(z) = T₀(1+z):");
    println!("  ┌────────────┬──────────────┬────────────────────┐");
    println!("  │  Redshift  │  T(z) [K]    │  Época             │");
    println!("  ├────────────┼──────────────┼────────────────────┤");

    for &(z, epoch) in &[
        (0.0, "Hoje"),
        (1.0, "z=1"),
        (10.0, "Reionização"),
        (1100.0, "Recombinação"),
        (3000.0, "Era primitiva"),
    ] {
        let t = CosmologicalObservables::cmb_temperature(params.cmb_temperature, z);
        println!("  │  {:.1}     │    {:.1}     │  {}│", z, t, epoch);
    }
    println!("  └────────────┴──────────────┴────────────────────┘\n");

    println!("  Redshifts Importantes:");
    let z_eq = CosmologicalObservables::matter_radiation_equality(
        params.omega_matter,
        params.omega_radiation,
    );
    let z_rec = CosmologicalObservables::recombination_redshift();
    println!("    • Igualdade matéria-radiação: z_eq ≈ {:.0}", z_eq);
    println!("    • Recombinação: z_rec ≈ {:.0}", z_rec);
    println!("    • Reionização: z_reion ≈ 6-20\n");

    println!("  Redshift de Comprimento de Onda:");
    let lambda_em = 121.6; // Lyman-α (nm)
    println!("    Lyman-α emitida: λ_em = {:.1} nm", lambda_em);
    println!("  ┌──────────┬────────────────┬──────────────────┐");
    println!("  │  Redshift│  λ_obs (nm)    │  Banda           │");
    println!("  ├──────────┼────────────────┼──────────────────┤");

    for &z in &[0.0, 1.0, 2.0, 5.0, 10.0] {
        let lambda_obs = CosmologicalObservables::observed_wavelength(lambda_em, z);
        let band = if lambda_obs < 400.0 {
            "UV"
        } else if lambda_obs < 700.0 {
            "Visível"
        } else if lambda_obs < 1000.0 {
            "NIR"
        } else {
            "IR"
        };
        println!(
            "  │  {:.1}     │     {:.1}      │  {}│",
            z, lambda_obs, band
        );
    }
    println!("  └──────────┴────────────────┴──────────────────┘\n");

    // ========== 6. DINÂMICA DO UNIVERSO ==========
    println!("┌────────────────────────────────────────────────────────────┐");
    println!("│ 6. DINÂMICA E EXPANSÃO                                     │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    println!("  Parâmetro de Desaceleração q(z):");
    println!("  ┌──────────┬──────────────┬────────────────────┐");
    println!("  │  Redshift│  q(z)        │  Expansão          │");
    println!("  ├──────────┼──────────────┼────────────────────┤");

    for &z in &[0.0, 0.5, 1.0, 2.0, 5.0] {
        let q = universe.deceleration_parameter(z);
        let tipo = if q < 0.0 { "Acelerada" } else { "Desacelerada" };
        println!("  │  {:.1}     │    {:.3}     │  {}      │", z, q, tipo);
    }
    println!("  └──────────┴──────────────┴────────────────────┘\n");

    let q0 = universe.deceleration_parameter(0.0);
    if q0 < 0.0 {
        println!("    ✓ Expansão acelerada hoje (q₀ < 0)!");
        println!("    • Evidência de energia escura");
        println!("    • Nobel 2011: Perlmutter, Schmidt, Riess\n");
    }

    println!("  Densidade de Energia ρ(z):");
    for &z in &[0.0, 1.0, 10.0, 1100.0] {
        let rho = universe.energy_density(z);
        let rho_rel = rho / params.critical_density();
        println!("    • z = {:.1}: ρ/ρ_c = {:.2e}", z, rho_rel);
    }
    println!();

    // ========== 7. ESTRUTURA CÓSMICA ==========
    println!("┌────────────────────────────────────────────────────────────┐");
    println!("│ 7. ESTRUTURA DE LARGA ESCALA                               │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    let structure = CosmicStructure::new(params.clone());

    println!("  Escalas de Jeans:");
    let rho_igm = 1e-27; // kg/m³ (meio intergaláctico)
    let c_s = 10000.0; // m/s (som em gás quente)
    let lambda_j = structure.jeans_length(c_s, rho_igm);
    let mass_j = structure.jeans_mass(c_s, rho_igm);

    println!("    • Comprimento de Jeans: λ_J = {:.2e} m", lambda_j);
    println!("    • ≈ {:.1} kpc", lambda_j / 3.086e19);
    println!("    • Massa de Jeans: M_J = {:.2e} kg", mass_j);
    println!("    • ≈ {:.2e} M☉\n", mass_j / 2e30);

    println!("  Taxa de Formação Estelar Cósmica SFR(z):");
    println!("  ┌──────────┬──────────────┬────────────────────┐");
    println!("  │  Redshift│  SFR(z)/SFR₀ │  Época             │");
    println!("  ├──────────┼──────────────┼────────────────────┤");

    for &(z, epoch) in &[
        (0.0, "Hoje"),
        (1.0, ""),
        (2.0, "Pico"),
        (5.0, ""),
        (10.0, "Primeiras galáxias"),
    ] {
        let sfr = CosmologicalObservables::cosmic_star_formation_rate(z);
        println!("  │  {:.1}     │     {:.2}     │  {}│", z, sfr, epoch);
    }
    println!("  └──────────┴──────────────┴────────────────────┘\n");

    println!("    • Pico de formação estelar: z ≈ 1.9");
    println!("    • Hoje: SFR ~10× menor que no pico\n");

    // ========== 8. MODELOS ALTERNATIVOS ==========
    println!("┌────────────────────────────────────────────────────────────┐");
    println!("│ 8. MODELOS COSMOLÓGICOS ALTERNATIVOS                      │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    let eds = CosmologicalParameters::einstein_de_sitter();
    let universe_eds = FLRWUniverse::new(eds.clone());

    println!("  Einstein-de Sitter (Ω_m = 1, Ω_Λ = 0):");
    println!("    • Universo plano dominado por matéria");
    println!(
        "    • Idade: t₀ = (2/3)H₀⁻¹ = {:.1} Gyr",
        universe_eds.age_of_universe() / (365.25 * 24.0 * 3600.0 * 1e9)
    );
    println!("    • Histórico mas não realista (sem energia escura)\n");

    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║                        RESUMO                              ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!(
        "  ✓ Parâmetros: H₀ = {:.1} km/s/Mpc, Ω_m = {:.3}, Ω_Λ = {:.3}",
        params.h0, params.omega_matter, params.omega_lambda
    );
    println!("  ✓ Idade do universo: {:.2} Gyr", age);
    println!("  ✓ Universo plano (Ω_total ≈ 1)");
    println!("  ✓ Expansão acelerada (q₀ < 0) → energia escura");
    println!("  ✓ Distâncias: d_c, d_L = (1+z)d_c, d_A = d_c/(1+z)");
    println!(
        "  ✓ CMB: T₀ = {:.3} K, z_rec ≈ 1100",
        params.cmb_temperature
    );
    println!("  ✓ Formação estelar: pico em z ≈ 2\n");

    println!("  Observações Futuras:");
    println!("    • JWST: primeiras galáxias (z > 10)");
    println!("    • Euclid/LSST: energia escura via weak lensing");
    println!("    • SKA: hidrogênio neutro e reionização");
    println!("    • CMB-S4: polarização e ondas gravitacionais primordiais\n");

    println!("══════════════════════════════════════════════════════════════");
}

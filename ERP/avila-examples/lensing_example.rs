use arxis_quaternions::physics::{
    GravitationalLens, LensType, LensingStatistics, MicrolensingEvent, WeakLensing,
};
use std::f64::consts::PI;

fn main() {
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║   ARXIS - Lentes Gravitacionais                           ║");
    println!("║   Deflexão de Luz pela Curvatura do Espaço-Tempo          ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    // ========== 1. LENTES GRAVITACIONAIS FORTES ==========
    println!("┌────────────────────────────────────────────────────────────┐");
    println!("│ 1. LENTES GRAVITACIONAIS FORTES (Strong Lensing)          │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    // Galáxia massiva como lente
    let galaxy_lens = GravitationalLens::point_mass(
        1e11, // 100 bilhões de massas solares
        1e9,  // 1 Gpc do observador
        2e9,  // Fonte a 2 Gpc
    );

    let theta_e = galaxy_lens.einstein_radius_arcsec();
    println!("  Lente: Galáxia de 10¹¹ M☉");
    println!("    • Raio de Einstein: {:.3} arcsec", theta_e);
    println!("    • D_L = {} Gpc", galaxy_lens.distance_lens / 1e9);
    println!("    • D_S = {} Gpc", galaxy_lens.distance_source / 1e9);
    println!(
        "    • D_LS = {:.1} Gpc\n",
        galaxy_lens.distance_lens_source() / 1e9
    );

    // Posições de imagens para diferentes posições da fonte
    println!("  Posições de Imagens Múltiplas:");
    println!("  ┌───────────┬──────────────┬──────────────┬──────────────┐");
    println!("  │  β (src)  │  θ₁ (img1)   │  θ₂ (img2)   │  Separação   │");
    println!("  ├───────────┼──────────────┼──────────────┼──────────────┤");

    for i in 0..5 {
        let beta = (i as f64) * theta_e / 2.0;
        let images = galaxy_lens.image_positions(beta);
        let sep = galaxy_lens.image_separation(beta);

        if images.len() >= 2 {
            println!(
                "  │  {:.4}  │   {:.4}    │   {:.4}    │    {:.4}    │",
                beta * 206265.0,
                images[0] * 206265.0,
                images[1] * 206265.0,
                sep * 206265.0
            );
        }
    }
    println!("  └───────────┴──────────────┴──────────────┴──────────────┘");
    println!("  (valores em arcsec)\n");

    // Magnificação
    println!("  Magnificação vs Posição da Imagem:");
    println!("  ┌────────────┬──────────────┬──────────────┐");
    println!("  │  θ / θ_E   │  Magnificação│  Flux ratio  │");
    println!("  ├────────────┼──────────────┼──────────────┤");

    for i in 1..=6 {
        let theta_ratio = i as f64 * 0.5;
        let theta = theta_ratio * galaxy_lens.einstein_radius();
        let mag = galaxy_lens.magnification(theta);

        println!(
            "  │    {:.2}     │     {:.2}     │    {:.2}×    │",
            theta_ratio, mag, mag
        );
    }
    println!("  └────────────┴──────────────┴──────────────┘\n");

    // Anéis de Einstein
    println!("  Anéis de Einstein:");
    let aligned_beta = 0.0;
    if galaxy_lens.forms_einstein_ring(aligned_beta, 1e-10) {
        println!("    ✓ Fonte perfeitamente alinhada → Anel de Einstein!");
        println!("    • Raio do anel: {:.3} arcsec", theta_e);
        println!("    • Magnificação total: ∞ (teórica)\n");
    }

    // Tempo de atraso entre imagens
    println!("  Tempo de Atraso entre Imagens:");
    let source_beta = theta_e * 0.5;
    let images = galaxy_lens.image_positions(source_beta);

    if images.len() >= 2 {
        let dt1 = galaxy_lens.time_delay(images[0], source_beta);
        let dt2 = galaxy_lens.time_delay(images[1], source_beta);
        let dt_diff = (dt1 - dt2).abs();

        println!("    • Δt entre imagens: {:.2} dias", dt_diff / 86400.0);
        println!("    • Usado para medir H₀ (constante de Hubble)\n");
    }

    // ========== 2. TIPOS DE LENTES ==========
    println!("┌────────────────────────────────────────────────────────────┐");
    println!("│ 2. COMPARAÇÃO DE MODELOS DE LENTES                        │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    let mass = 1e12;
    let d_l = 5e8;
    let d_s = 1e9;

    let point_lens = GravitationalLens::new(mass, d_l, d_s, LensType::PointMass);
    let sis_lens = GravitationalLens::new(mass, d_l, d_s, LensType::SIS);
    let nfw_lens = GravitationalLens::new(mass, d_l, d_s, LensType::NFW);

    println!("  Ângulo de Deflexão α(θ) para θ = 2θ_E:");
    let theta_test = point_lens.einstein_radius() * 2.0;

    println!(
        "    • Point Mass:  α = {:.4e} rad",
        point_lens.deflection_angle(theta_test)
    );
    println!(
        "    • SIS:         α = {:.4e} rad (constante)",
        sis_lens.deflection_angle(theta_test)
    );
    println!(
        "    • NFW:         α = {:.4e} rad\n",
        nfw_lens.deflection_angle(theta_test)
    );

    // ========== 3. WEAK LENSING ==========
    println!("┌────────────────────────────────────────────────────────────┐");
    println!("│ 3. LENTES GRAVITACIONAIS FRACAS (Weak Lensing)            │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    let weak_lens = WeakLensing::new(
        0.08, // κ (convergência)
        0.02, // γ₁ (shear)
        0.03, // γ₂ (shear)
    );

    println!("  Parâmetros de Weak Lensing:");
    println!("    • Convergência κ = {:.3}", weak_lens.convergence);
    println!("    • Shear γ₁ = {:.3}", weak_lens.shear_1);
    println!("    • Shear γ₂ = {:.3}", weak_lens.shear_2);
    println!("    • Shear total γ = {:.4}", weak_lens.total_shear());
    println!(
        "    • Ângulo do shear = {:.2}°",
        weak_lens.shear_angle().to_degrees()
    );
    println!(
        "    • Elipticidade induzida = {:.4}",
        weak_lens.induced_ellipticity()
    );
    println!("    • Magnificação = {:.4}\n", weak_lens.magnification());

    // Distorção de galáxias de fundo
    println!("  Distorção de Galáxias:");
    println!("  ┌──────────┬──────────┬──────────┬──────────┐");
    println!("  │  e₁(int) │  e₂(int) │  e₁(obs) │  e₂(obs) │");
    println!("  ├──────────┼──────────┼──────────┼──────────┤");

    for i in 0..4 {
        let e1_int = (i as f64 - 1.5) * 0.1;
        let e2_int = (i as f64 - 1.5) * 0.05;
        let (e1_obs, e2_obs) = weak_lens.distort_galaxy_shape(e1_int, e2_int);

        println!(
            "  │  {:.3}   │  {:.3}   │  {:.3}   │  {:.3}   │",
            e1_int, e2_int, e1_obs, e2_obs
        );
    }
    println!("  └──────────┴──────────┴──────────┴──────────┘\n");

    // ========== 4. MICROLENTES ==========
    println!("┌────────────────────────────────────────────────────────────┐");
    println!("│ 4. MICROLENTES GRAVITACIONAIS (Microlensing)              │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    let microlens_event = MicrolensingEvent::new(
        0.5,   // 0.5 M☉ (estrela típica)
        0.3,   // u₀ = 0.3 (parâmetro de impacto)
        25.0,  // t_E = 25 dias
        100.0, // Pico em t₀ = 100 dias
    );

    println!("  Evento de Microlente:");
    println!("    • Massa da lente: {:.1} M☉", microlens_event.lens_mass);
    println!(
        "    • Parâmetro de impacto: u₀ = {:.2}",
        microlens_event.impact_parameter
    );
    println!(
        "    • Tempo de Einstein: t_E = {:.1} dias",
        microlens_event.einstein_time
    );
    println!(
        "    • Tempo do pico: t₀ = {:.1} dias",
        microlens_event.peak_time
    );
    println!(
        "    • Magnificação no pico: A(t₀) = {:.2}",
        microlens_event.peak_magnification()
    );
    println!(
        "    • Duração (FWHM): {:.1} dias",
        microlens_event.event_duration()
    );
    println!(
        "    • Detectável? {}",
        if microlens_event.is_detectable(1.34) {
            "✓ Sim (A > 1.34)"
        } else {
            "✗ Não"
        }
    );

    // Curva de luz
    println!("\n  Curva de Luz A(t):");
    println!("  ┌────────────┬──────────────┬──────────────────┐");
    println!("  │  Tempo (d) │  A(t)        │  Visualização    │");
    println!("  ├────────────┼──────────────┼──────────────────┤");

    for i in 0..15 {
        let t = 70.0 + (i as f64) * 4.0;
        let mag = microlens_event.magnification_at_time(t);

        // Barra ASCII proporcional à magnificação
        let bar_length = ((mag - 1.0) * 10.0).min(20.0) as usize;
        let bar: String = "█".repeat(bar_length);

        println!("  │   {:.1}     │    {:.3}     │ {}│", t, mag, bar);
    }
    println!("  └────────────┴──────────────┴──────────────────┘\n");

    // ========== 5. ESTATÍSTICAS DE LENTES ==========
    println!("┌────────────────────────────────────────────────────────────┐");
    println!("│ 5. ESTATÍSTICAS E PROBABILIDADES                          │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    // Profundidade óptica para bojo galáctico
    let n_stars = 1e9; // densidade de estrelas
    let distance_bulge = 8000.0; // pc
    let typical_theta_e = 1e-9; // rad

    let tau = LensingStatistics::optical_depth(n_stars, distance_bulge, typical_theta_e);
    println!("  Profundidade Óptica:");
    println!("    • τ = {:.2e} (bojo galáctico)", tau);
    println!("    • Probabilidade de microlensing ∼ τ\n");

    // Taxa de eventos
    let event_rate = LensingStatistics::event_rate(tau, 20.0, 1e7);
    println!("  Taxa de Eventos:");
    println!("    • Γ = {:.1} eventos/ano", event_rate);
    println!("    • Para 10⁷ estrelas monitoradas\n");

    // Seção de choque para lente forte
    let cross_section = LensingStatistics::strong_lensing_cross_section(theta_e);
    println!("  Seção de Choque (Strong Lensing):");
    println!("    • σ = {:.2e} sr", cross_section);
    println!("    • Área efetiva no céu\n");

    // ========== 6. APLICAÇÕES ==========
    println!("┌────────────────────────────────────────────────────────────┐");
    println!("│ 6. APLICAÇÕES EM ASTROFÍSICA                              │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    println!("  Lentes Gravitacionais Fortes:");
    println!("    • Medição da constante de Hubble H₀");
    println!("    • Estudo de galáxias distantes magnificadas");
    println!("    • Mapeamento de distribuição de massa escura");
    println!("    • Detecção de exoplanetas em outras galáxias\n");

    println!("  Lentes Gravitacionais Fracas:");
    println!("    • Mapeamento de matéria escura em larga escala");
    println!("    • Medição de distâncias cosmológicas");
    println!("    • Testes da Relatividade Geral");
    println!("    • Cosmic shear surveys (DES, LSST, Euclid)\n");

    println!("  Microlentes:");
    println!("    • Detecção de MACHOs (Massive Compact Halo Objects)");
    println!("    • Descoberta de exoplanetas (método de Microlensing)");
    println!("    • Medição de massas estelares");
    println!("    • Estudo de buracos negros isolados\n");

    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║                        RESUMO                              ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("  ✓ Lentes fortes: múltiplas imagens, anéis de Einstein");
    println!("  ✓ Lentes fracas: shear, convergência, distorção de galáxias");
    println!("  ✓ Microlentes: curvas de luz, detecção de objetos compactos");
    println!("  ✓ Estatísticas: profundidade óptica, taxas de eventos");
    println!("  ✓ Aplicações: matéria escura, H₀, exoplanetas\n");

    println!("  Observações:");
    println!("    • Hubble Space Telescope: imagens de alta resolução");
    println!("    • LSST: weak lensing surveys em larga escala");
    println!("    • Gaia: microlensing astrométrico");
    println!("    • JWST: galáxias distantes magnificadas\n");

    println!("══════════════════════════════════════════════════════════════");
}

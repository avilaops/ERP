use arxis_quaternions::prelude::*;

fn main() {
    println!("╔══════════════════════════════════════════════════════════╗");
    println!("║   ARXIS - Solucionador de Equações de Einstein          ║");
    println!("║   Métricas Exatas da Relatividade Geral                 ║");
    println!("╚══════════════════════════════════════════════════════════╝\n");

    // 1. MÉTRICA DE SCHWARZSCHILD
    println!("┌───────────────────────────────────────────────────────┐");
    println!("│ 1. SCHWARZSCHILD - Buraco Negro Estático             │");
    println!("└───────────────────────────────────────────────────────┘");

    let m_solar = 1.0;
    let bh = BlackHoleProperties::schwarzschild(m_solar);

    println!("  Massa M = {:.2} M☉", m_solar);
    println!("  Raio de Schwarzschild = {:.4}", bh.event_horizon);
    println!("  Esfera de fótons = {:.4}", bh.photon_sphere);
    println!("  Temperatura Hawking = {:.6e} K", bh.hawking_temperature());
    println!("  Entropia = {:.4e}", bh.entropy());

    println!("\n  Métricas em diferentes raios (θ = π/2):");
    println!("  ┌────────┬──────────────┬──────────────────┐");
    println!("  │   r    │    ds²       │   Região         │");
    println!("  ├────────┼──────────────┼──────────────────┤");

    let test_points = vec![
        (0.5, "Dentro horizonte"),
        (2.0, "No horizonte"),
        (3.0, "Esfera fótons"),
        (10.0, "Campo fraco"),
    ];

    for (r, region) in test_points.iter() {
        let metric = MetricTensor::schwarzschild(m_solar, *r, std::f64::consts::PI / 2.0);
        let x = [1.0, *r, std::f64::consts::PI / 2.0, 0.0];
        let ds2 = metric.interval(&x);
        println!("  │ {r:6.2} │ {ds2:12.6} │ {region:16} │");
    }
    println!("  └────────┴──────────────┴──────────────────┘");

    // 2. MÉTRICA DE KERR
    println!("\n┌───────────────────────────────────────────────────────┐");
    println!("│ 2. KERR - Buraco Negro Rotante                       │");
    println!("└───────────────────────────────────────────────────────┘");

    println!("  Spins diferentes (M = {:.1} M☉):", m_solar);
    println!("  ┌────────┬────────────┬────────────┬──────────┐");
    println!("  │  a/M   │   r_+      │  r_ergo    │  T_H     │");
    println!("  ├────────┼────────────┼────────────┼──────────┤");

    for a in [0.0, 0.5, 0.9, 0.998].iter() {
        let bh_kerr = BlackHoleProperties::kerr(m_solar, *a);
        println!(
            "  │ {a:6.3} │ {rh:10.6} │ {re:10.6} │ {t:8.2e} │",
            a = a,
            rh = bh_kerr.event_horizon,
            re = bh_kerr.ergosphere_outer,
            t = bh_kerr.hawking_temperature()
        );
    }
    println!("  └────────┴────────────┴────────────┴──────────┘");

    // 3. MÉTRICA FLRW
    println!("\n┌───────────────────────────────────────────────────────┐");
    println!("│ 3. FLRW - Universo em Expansão                       │");
    println!("└───────────────────────────────────────────────────────┘");

    println!("  Fator de escala a(t) (k=0, r=2.0, θ=π/4):");
    println!("  ┌────────────┬──────────────┐");
    println!("  │   a(t)     │     ds²      │");
    println!("  ├────────────┼──────────────┤");

    let r = 2.0;
    let theta = std::f64::consts::PI / 4.0;

    for a_t in [0.5, 1.0, 1.5, 2.0].iter() {
        let metric = MetricTensor::flrw(*a_t, 0.0, r, theta);
        let x = [1.0, r, theta, 0.0];
        let ds2 = metric.interval(&x);
        println!("  │ {a:10.2} │ {ds2:12.6} │", a = a_t, ds2 = ds2);
    }
    println!("  └────────────┴──────────────┘");

    // 4. MÉTRICA DE DE SITTER
    println!("\n┌───────────────────────────────────────────────────────┐");
    println!("│ 4. DE SITTER - Constante Cosmológica                 │");
    println!("└───────────────────────────────────────────────────────┘");

    let r_ds = 5.0;
    let theta_ds = std::f64::consts::PI / 2.0;

    println!("  Constante Λ (r={:.1}, θ=π/2):", r_ds);
    println!("  ┌────────────┬──────────────┐");
    println!("  │     Λ      │     ds²      │");
    println!("  ├────────────┼──────────────┤");

    for lambda in [1e-52, 1e-40, 1e-35].iter() {
        let metric = MetricTensor::de_sitter(*lambda, r_ds, theta_ds);
        let x = [1.0, r_ds, theta_ds, 0.0];
        let ds2 = metric.interval(&x);
        println!("  │ {l:10.2e} │ {ds2:12.6} │", l = lambda, ds2 = ds2);
    }
    println!("  └────────────┴──────────────┘");

    // 5. SÍMBOLOS DE CHRISTOFFEL
    println!("\n┌───────────────────────────────────────────────────────┐");
    println!("│ 5. SÍMBOLOS DE CHRISTOFFEL Γ^λ_μν                    │");
    println!("└───────────────────────────────────────────────────────┘");

    let r_calc = 3.0 * m_solar;
    let theta_calc = std::f64::consts::PI / 2.0;
    let point = [1.0, r_calc, theta_calc, 0.0];

    // Criar closure para métrica de Schwarzschild
    let metric_func = |x: &[f64; 4]| MetricTensor::schwarzschild(m_solar, x[1], x[2]).components;

    let christoffel = ChristoffelSymbols::from_metric(metric_func, &point, 1e-6);

    println!("  Schwarzschild em r=3M (não-nulos):");
    println!("  ┌─────────────┬──────────────┐");
    println!("  │   Γ^λ_μν    │    Valor     │");
    println!("  ├─────────────┼──────────────┤");

    let mut count = 0;
    for i in 0..4 {
        for j in 0..4 {
            for k in 0..4 {
                let value = christoffel.get(i, j, k);
                if value.abs() > 1e-10 && count < 10 {
                    println!("  │ Γ^{i}_{j}{k}      │ {value:12.6} │");
                    count += 1;
                }
            }
        }
    }
    println!("  └─────────────┴──────────────┘");

    // 6. TEMPERATURA DE HAWKING
    println!("\n┌───────────────────────────────────────────────────────┐");
    println!("│ 6. TEMPERATURA DE HAWKING vs MASSA                   │");
    println!("└───────────────────────────────────────────────────────┘");

    println!("  T_H ∝ 1/M:");
    println!("  ┌─────────────┬──────────────────┬──────────────┐");
    println!("  │   Massa     │   T_Hawking (K)  │   t_evap ∝   │");
    println!("  ├─────────────┼──────────────────┼──────────────┤");

    let masses = vec![
        (1e-8, "Micro"),
        (1e-5, "Pequeno"),
        (1.0, "1 M☉"),
        (10.0, "10 M☉"),
        (1e6, "Super"),
    ];

    for (mass, label) in masses.iter() {
        let bh = BlackHoleProperties::schwarzschild(*mass);
        let temp = bh.hawking_temperature();
        let t_evap = mass.powi(3);
        println!(
            "  │ {label:11} │ {temp:16.4e} │ {t:12.2e} │",
            label = label,
            temp = temp,
            t = t_evap
        );
    }
    println!("  └─────────────┴──────────────────┴──────────────┘");

    // RESUMO
    println!("\n╔══════════════════════════════════════════════════════════╗");
    println!("║                       RESUMO                             ║");
    println!("╚══════════════════════════════════════════════════════════╝");
    println!("  ✓ Métricas: Schwarzschild, Kerr, FLRW, de Sitter");
    println!("  ✓ Cálculos: Christoffel, Ricci, Einstein, Hawking");
    println!("  ✓ Aplicações: Geodésicas, Lentes, Ondas, Cosmologia");
    println!("══════════════════════════════════════════════════════════════\n");
}

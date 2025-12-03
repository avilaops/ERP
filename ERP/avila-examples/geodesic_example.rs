use arxis_quaternions::prelude::*;
use std::f64::consts::PI;

fn main() {
    println!("╔══════════════════════════════════════════════════════════╗");
    println!("║   ARXIS - Geodésicas e Movimento de Partículas          ║");
    println!("║   Trajetórias em Espaço-Tempo Curvo                     ║");
    println!("╚══════════════════════════════════════════════════════════╝\n");

    let mass = 1.0; // Massa em unidades geométricas (G=c=1)

    // ===============================================================
    // 1. PROPRIEDADES ORBITAIS
    // ===============================================================
    println!("┌───────────────────────────────────────────────────────┐");
    println!(
        "│ 1. PROPRIEDADES ORBITAIS (M = {:.1} M☉)              │",
        mass
    );
    println!("└───────────────────────────────────────────────────────┘");

    let calc = OrbitCalculator::new(mass);

    println!("  Raios críticos:");
    println!("    • Horizonte de eventos: r_s = {:.4}", 2.0 * mass);
    println!(
        "    • Esfera de fótons:     r_ph = {:.4}",
        calc.photon_sphere_radius()
    );
    println!(
        "    • ISCO:                 r_isco = {:.4}",
        calc.isco_radius()
    );

    println!("\n  Órbitas circulares estáveis (r > ISCO):");
    println!("  ┌─────────┬────────────┬────────────┬────────────┐");
    println!("  │    r    │     Ω      │   Período  │  Estável?  │");
    println!("  ├─────────┼────────────┼────────────┼────────────┤");

    for r in [6.0, 8.0, 10.0, 15.0, 20.0].iter() {
        let omega = calc.circular_angular_velocity(*r);
        let period = calc.orbital_period(*r);
        let stable = if calc.is_stable_orbit(*r) {
            "Sim"
        } else {
            "Não"
        };

        println!(
            "  │ {r:7.2} │ {omega:10.6} │ {period:10.4} │ {stable:10} │",
            r = r,
            omega = omega,
            period = period,
            stable = stable
        );
    }
    println!("  └─────────┴────────────┴────────────┴────────────┘");

    // ===============================================================
    // 2. ENERGIA E MOMENTO ANGULAR
    // ===============================================================
    println!("\n┌───────────────────────────────────────────────────────┐");
    println!("│ 2. ENERGIA E MOMENTO ANGULAR DE ÓRBITAS CIRCULARES   │");
    println!("└───────────────────────────────────────────────────────┘");

    println!("  ┌─────────┬────────────┬────────────┐");
    println!("  │    r    │    E/m     │    L/m     │");
    println!("  ├─────────┼────────────┼────────────┤");

    for r in [6.0, 10.0, 20.0, 50.0].iter() {
        let energy = calc.circular_orbit_energy(*r);
        let angular_mom = calc.circular_orbit_angular_momentum(*r);

        println!(
            "  │ {r:7.2} │ {e:10.6} │ {l:10.6} │",
            r = r,
            e = energy,
            l = angular_mom
        );
    }
    println!("  └─────────┴────────────┴────────────┘");

    // ===============================================================
    // 3. REDSHIFT GRAVITACIONAL
    // ===============================================================
    println!("\n┌───────────────────────────────────────────────────────┐");
    println!("│ 3. REDSHIFT GRAVITACIONAL z = 1/√(1-2M/r) - 1        │");
    println!("└───────────────────────────────────────────────────────┘");

    println!("  ┌─────────┬────────────┬────────────────┐");
    println!("  │    r    │     z      │  Interpretação │");
    println!("  ├─────────┼────────────┼────────────────┤");

    for r in [2.5, 5.0, 10.0, 50.0, 100.0].iter() {
        let z = calc.gravitational_redshift(*r);
        let interp = if *r < 3.0 {
            "Extremo"
        } else if *r < 10.0 {
            "Forte"
        } else if *r < 50.0 {
            "Moderado"
        } else {
            "Fraco"
        };

        println!(
            "  │ {r:7.2} │ {z:10.6} │ {interp:14} │",
            r = r,
            z = z,
            interp = interp
        );
    }
    println!("  └─────────┴────────────┴────────────────┘");

    // ===============================================================
    // 4. PRECESSÃO PERIÉLICA
    // ===============================================================
    println!("\n┌───────────────────────────────────────────────────────┐");
    println!("│ 4. PRECESSÃO PERIÉLICA (órbitas elípticas)           │");
    println!("└───────────────────────────────────────────────────────┘");

    println!("  Δφ ≈ 6πM/a(1-e²) radianos por órbita");
    println!("\n  ┌─────────┬─────────┬──────────────┬────────────────┐");
    println!("  │    a    │    e    │  Δφ (rad)    │  Δφ (arcsec)   │");
    println!("  ├─────────┼─────────┼──────────────┼────────────────┤");

    let test_orbits = [(10.0, 0.1), (20.0, 0.2), (50.0, 0.5), (100.0, 0.7)];

    for (a, e) in test_orbits.iter() {
        let delta_phi_rad = calc.perihelion_precession(*a, *e);
        let delta_phi_arcsec = delta_phi_rad * 206265.0; // conversão rad -> arcsec

        println!(
            "  │ {a:7.2} │ {e:7.3} │ {rad:12.6} │ {arcsec:14.2} │",
            a = a,
            e = e,
            rad = delta_phi_rad,
            arcsec = delta_phi_arcsec
        );
    }
    println!("  └─────────┴─────────┴──────────────┴────────────────┘");

    println!("\n  Exemplo: Mercúrio (a ≈ 57.9M☉, e ≈ 0.206)");
    let mercury_a = 57.9;
    let mercury_e = 0.206;
    let mercury_precession = calc.perihelion_precession(mercury_a, mercury_e);
    println!(
        "    Precessão: {:.2} arcsec/órbita",
        mercury_precession * 206265.0
    );
    println!("    (Valor observado: ~43 arcsec/século)");

    // ===============================================================
    // 5. DEFLEXÃO DA LUZ
    // ===============================================================
    println!("\n┌───────────────────────────────────────────────────────┐");
    println!("│ 5. DEFLEXÃO DA LUZ Δθ ≈ 4M/b                         │");
    println!("└───────────────────────────────────────────────────────┘");

    let effects = GravitationalEffects::new(mass);

    println!("  ┌─────────────┬──────────────┬────────────────┐");
    println!("  │  b (param)  │  Δθ (rad)    │  Δθ (arcsec)   │");
    println!("  ├─────────────┼──────────────┼────────────────┤");

    for b in [5.0, 10.0, 50.0, 100.0, 1000.0].iter() {
        let deflection_rad = effects.light_deflection(*b);
        let deflection_arcsec = deflection_rad * 206265.0;

        println!(
            "  │ {b:11.2} │ {rad:12.6} │ {arcsec:14.4} │",
            b = b,
            rad = deflection_rad,
            arcsec = deflection_arcsec
        );
    }
    println!("  └─────────────┴──────────────┴────────────────┘");

    println!("\n  Exemplo: Luz do Sol (b ≈ R☉ ≈ 2.3M☉)");
    let sun_b = 2.3;
    let sun_deflection = effects.light_deflection(sun_b);
    println!("    Deflexão: {:.2} arcsec", sun_deflection * 206265.0);
    println!("    (Valor observado: ~1.75 arcsec - Einstein 1915)");

    // ===============================================================
    // 6. VELOCIDADE DE ESCAPE
    // ===============================================================
    println!("\n┌───────────────────────────────────────────────────────┐");
    println!("│ 6. VELOCIDADE DE ESCAPE v_esc = √(2M/r)              │");
    println!("└───────────────────────────────────────────────────────┘");

    println!("  ┌─────────┬────────────┬────────────────┐");
    println!("  │    r    │   v_esc    │  v_esc/c       │");
    println!("  ├─────────┼────────────┼────────────────┤");

    for r in [2.5, 5.0, 10.0, 50.0, 100.0].iter() {
        let v_esc = effects.escape_velocity(*r);

        println!(
            "  │ {r:7.2} │ {v:10.6} │ {pc:14.2}% │",
            r = r,
            v = v_esc,
            pc = v_esc * 100.0
        );
    }
    println!("  └─────────┴────────────┴────────────────┘");

    // ===============================================================
    // 7. SIMULAÇÃO DE GEODÉSICA
    // ===============================================================
    println!("\n┌───────────────────────────────────────────────────────┐");
    println!("│ 7. INTEGRAÇÃO DE GEODÉSICA (Órbita Circular)         │");
    println!("└───────────────────────────────────────────────────────┘");

    let metric_func = |x: &[f64; 4]| MetricTensor::schwarzschild(mass, x[1], x[2]).components;

    let integrator = GeodesicIntegrator::new(metric_func, 0.1);

    // Configurar órbita circular em r = 10M
    let r_orbit = 10.0;
    let omega = calc.circular_angular_velocity(r_orbit);

    let initial_position = [0.0, r_orbit, PI / 2.0, 0.0];
    let initial_velocity = [1.0, 0.0, 0.0, omega];

    let mut initial_state = ParticleState::new(initial_position, initial_velocity);

    // Calcular constantes de movimento
    let metric = MetricTensor::schwarzschild(mass, r_orbit, PI / 2.0);
    initial_state.energy = initial_state.calculate_energy(&metric.components);
    initial_state.angular_momentum = initial_state.calculate_angular_momentum(&metric.components);

    println!("  Condições iniciais:");
    println!("    • r₀ = {:.2}", r_orbit);
    println!("    • Ω = {:.6}", omega);
    println!("    • E = {:.6}", initial_state.energy);
    println!("    • L = {:.6}", initial_state.angular_momentum);

    let trajectory = integrator.integrate(initial_state, 100);

    println!("\n  Evolução da órbita (primeiros 10 passos):");
    println!("  ┌────────┬─────────┬──────────┬──────────┐");
    println!("  │   λ    │    r    │    φ     │   dr/dλ  │");
    println!("  ├────────┼─────────┼──────────┼──────────┤");

    for (i, state) in trajectory.iter().take(10).enumerate() {
        if i % 2 == 0 {
            println!(
                "  │ {lambda:6.2} │ {r:7.4} │ {phi:8.5} │ {dr:8.5} │",
                lambda = state.lambda,
                r = state.position[1],
                phi = state.position[3],
                dr = state.velocity[1]
            );
        }
    }
    println!("  └────────┴─────────┴──────────┴──────────┘");

    // Verificar estabilidade da órbita
    let final_state = trajectory.last().unwrap();
    let r_variation = (final_state.position[1] - r_orbit).abs();

    println!(
        "\n  Após {} passos (λ = {:.2}):",
        trajectory.len(),
        final_state.lambda
    );
    println!("    • r_final = {:.6}", final_state.position[1]);
    println!(
        "    • Δr = {:.6} ({:.2}%)",
        r_variation,
        (r_variation / r_orbit) * 100.0
    );

    if r_variation / r_orbit < 0.01 {
        println!("    ✓ Órbita estável!");
    }

    // ===============================================================
    // 8. CLASSIFICAÇÃO DE ÓRBITAS
    // ===============================================================
    println!("\n┌───────────────────────────────────────────────────────┐");
    println!("│ 8. CLASSIFICAÇÃO DE ÓRBITAS                          │");
    println!("└───────────────────────────────────────────────────────┘");

    let test_cases = vec![
        (0.95, 5.0, false, "Baixa energia, L alto"),
        (1.5, 10.0, false, "Alta energia"),
        (0.8, 3.0, false, "Baixo L, captura"),
        (1.0, 5.0, true, "Fóton"),
    ];

    println!("  ┌─────────┬──────┬─────────┬─────────────┬──────────────────┐");
    println!("  │    E    │  L   │ Fóton?  │   Tipo      │   Descrição      │");
    println!("  ├─────────┼──────┼─────────┼─────────────┼──────────────────┤");

    for (energy, l, is_photon, desc) in test_cases.iter() {
        let orbit_type = calc.classify_orbit(*energy, *l, *is_photon);
        let type_str = match orbit_type {
            OrbitType::Circular => "Circular",
            OrbitType::Elliptic => "Elíptica",
            OrbitType::Hyperbolic => "Hiperbólica",
            OrbitType::Capture => "Captura",
            OrbitType::Photon => "Fóton",
        };

        println!(
            "  │ {e:7.3} │ {l:4.1} │ {ph:7} │ {typ:11} │ {desc:16} │",
            e = energy,
            l = l,
            ph = if *is_photon { "Sim" } else { "Não" },
            typ = type_str,
            desc = desc
        );
    }
    println!("  └─────────┴──────┴─────────┴─────────────┴──────────────────┘");

    // ===============================================================
    // RESUMO
    // ===============================================================
    println!("\n╔══════════════════════════════════════════════════════════╗");
    println!("║                       RESUMO                             ║");
    println!("╚══════════════════════════════════════════════════════════╝");
    println!("  ✓ Geodésicas: Trajetórias de queda livre calculadas");
    println!("  ✓ Órbitas: Circulares, elípticas, hiperbólicas");
    println!("  ✓ Efeitos: Redshift, deflexão, precessão periélica");
    println!("  ✓ Integração: Runge-Kutta de 4ª ordem");
    println!("  ✓ Constantes: Energia e momento angular conservados");
    println!("\n  Aplicações:");
    println!("    • Simulação de sistemas binários");
    println!("    • Cálculo de órbitas planetárias");
    println!("    • Trajetórias de sondas espaciais");
    println!("    • Lentes gravitacionais");
    println!("    • Ondas gravitacionais");
    println!("══════════════════════════════════════════════════════════════\n");
}

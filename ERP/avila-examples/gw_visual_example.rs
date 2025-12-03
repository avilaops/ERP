use arxis_quaternions::physics::{CompactBinary, Detector};
use std::f64::consts::PI;

fn main() {
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║   ARXIS - Visualização de Ondas Gravitacionais            ║");
    println!("║   Detecção de Fusões de Buracos Negros                    ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    // Criar sistema binário similar ao GW150914
    println!("┌────────────────────────────────────────────────────────────┐");
    println!("│ 1. SISTEMA BINÁRIO - Tipo GW150914                        │");
    println!("└────────────────────────────────────────────────────────────┘");

    let binary = CompactBinary::new(
        36.0,             // Massa 1: 36 M☉
        29.0,             // Massa 2: 29 M☉
        350.0,            // Separação: 350 km
        410e6 * 3.086e19, // Distância: 410 Mpc
        0.0,              // Inclinação: face-on
    );

    let m1 = binary.mass1;
    let m2 = binary.mass2;
    let total_mass = binary.total_mass();
    let chirp_mass = binary.chirp_mass();
    let reduced_mass = binary.reduced_mass();

    println!("\n  Massas do Sistema:");
    println!("    • M₁ = {:.2} M☉", m1);
    println!("    • M₂ = {:.2} M☉", m2);
    println!("    • M_total = {:.2} M☉", total_mass);
    println!("    • M_chirp = {:.2} M☉", chirp_mass);
    println!("    • μ (reduzida) = {:.2} M☉", reduced_mass);
    println!("    • D = {:.0} Mpc", binary.distance / (3.086e22));

    // Frequências e tempos
    let f_orb = binary.orbital_frequency();
    let f_gw = binary.gravitational_wave_frequency();
    let period = binary.orbital_period();
    let tau = binary.time_to_coalescence();

    println!("\n  Dinâmica Orbital:");
    println!("    • f_orbital = {:.2} Hz", f_orb);
    println!("    • f_GW = {:.2} Hz (2 × f_orbital)", f_gw);
    println!("    • Período = {:.4} s", period);
    println!("    • Tempo até coalescência = {:.4} s", tau);

    // Luminosidade e energia
    let luminosity = binary.gravitational_luminosity();
    let radiated_energy = binary.radiated_energy_per_orbit();
    let chirp_rate = binary.chirp_rate();

    println!("\n  Radiação Gravitacional:");
    println!("    • L_GW = {:.2e} W", luminosity);
    println!("    • L_GW/c² = {:.2e} M☉/s", luminosity / (9e16));
    println!("    • E_rad/órbita = {:.2e} J", radiated_energy);
    println!("    • df/dt = {:.4} Hz/s (taxa de chirp)", chirp_rate);

    // Onda gravitacional gerada
    println!("\n┌────────────────────────────────────────────────────────────┐");
    println!("│ 2. FORMA DE ONDA                                           │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    let wave = binary.generate_wave(0.0);
    let h_plus = wave.strain(Polarization::Plus);
    let h_cross = wave.strain(Polarization::Cross);
    let amplitude = wave.amplitude();

    println!("  Amplitude da Onda:");
    println!("    • h₊ = {:.2e}", h_plus);
    println!("    • h× = {:.2e}", h_cross);
    println!("    • |h| = {:.2e}", amplitude);
    println!("    • ω = {:.4} rad/s", wave.frequency());
    println!("    • λ = {:.2e} m", 3e8 / f_gw);

    // Evolução temporal
    println!("\n  Evolução da Onda (primeiros 0.1s):");
    println!("  ┌──────────┬────────────┬────────────┬──────────┐");
    println!("  │   t (s)  │   h₊       │   h×       │  f (Hz)  │");
    println!("  ├──────────┼────────────┼────────────┼──────────┤");

    for i in 0..5 {
        let t = i as f64 * 0.02;
        let w = binary.generate_wave(t);
        let hp = w.strain(Polarization::Plus);
        let hc = w.strain(Polarization::Cross);
        let freq = w.frequency() / (2.0 * PI);
        println!(
            "  │  {:.4}  │  {:.2e} │  {:.2e} │  {:.2}   │",
            t, hp, hc, freq
        );
    }
    println!("  └──────────┴────────────┴────────────┴──────────┘");

    // Detectores
    println!("\n┌────────────────────────────────────────────────────────────┐");
    println!("│ 3. DETECTORES                                              │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    let ligo = Detector::ligo();
    let virgo = Detector::virgo();
    let lisa = Detector::lisa();

    let snr_ligo = ligo.signal_to_noise(&wave);
    let snr_virgo = virgo.signal_to_noise(&wave);
    let snr_lisa = lisa.signal_to_noise(&wave);

    println!("  Especificações:");
    println!("  ┌──────────┬──────────────┬──────────────┬──────────────┐");
    println!("  │ Detector │  f_min (Hz)  │  f_max (Hz)  │   S_n        │");
    println!("  ├──────────┼──────────────┼──────────────┼──────────────┤");
    println!(
        "  │ LIGO     │     {:.1}      │    {:.0}     │  {:.0e}  │",
        ligo.frequency_range().0,
        ligo.frequency_range().1,
        ligo.noise_spectral_density()
    );
    println!(
        "  │ Virgo    │     {:.1}      │   {:.0}     │  {:.0e}  │",
        virgo.frequency_range().0,
        virgo.frequency_range().1,
        virgo.noise_spectral_density()
    );
    println!(
        "  │ LISA     │   {:.0e}     │      {:.1}      │  {:.0e}  │",
        lisa.frequency_range().0,
        lisa.frequency_range().1,
        lisa.noise_spectral_density()
    );
    println!("  └──────────┴──────────────┴──────────────┴──────────────┘");

    println!("\n  Razão Sinal-Ruído (SNR):");
    println!("    • LIGO:  SNR = {:.2}", snr_ligo);
    println!("    • Virgo: SNR = {:.2}", snr_virgo);
    println!("    • LISA:  SNR = {:.2}", snr_lisa);

    // Alcance de detecção
    let threshold = 8.0;
    let range_ligo = ligo.detection_range(&binary, threshold);
    let range_virgo = virgo.detection_range(&binary, threshold);

    println!("\n  Alcance de Detecção (SNR ≥ {}):", threshold);
    println!("    • LIGO:  {:.0} Mpc", range_ligo / 3.086e22);
    println!("    • Virgo: {:.0} Mpc", range_virgo / 3.086e22);

    if snr_ligo > threshold {
        println!("\n    ✓ Sistema DETECTÁVEL pelo LIGO!");
    } else {
        println!("\n    ✗ Sistema NÃO detectável pelo LIGO");
    }

    if snr_virgo > threshold {
        println!("    ✓ Sistema DETECTÁVEL pelo Virgo!");
    } else {
        println!("    ✗ Sistema NÃO detectável pelo Virgo");
    }

    // Visualização ASCII da onda
    println!("\n┌────────────────────────────────────────────────────────────┐");
    println!("│ 4. VISUALIZAÇÃO DA ONDA h₊(t)                              │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    let n_points = 60;
    let max_time = 0.15;

    for i in 0..20 {
        let t = i as f64 * max_time / 20.0;
        let w = binary.generate_wave(t);
        let h = w.strain(Polarization::Plus);

        // Normalizar para visualização
        let normalized = (h / 1e-21) * 20.0;
        let pos = (normalized + 30.0) as i32;
        let pos = pos.max(0).min(n_points - 1);

        print!("  {:.3}s │", t);
        for j in 0..n_points {
            if j == 30 {
                print!("│");
            } else if j == pos {
                print!("●");
            } else {
                print!(" ");
            }
        }
        println!();
    }
    println!("         └─────────────┴─────────────────────────────────┘");
    println!("              -1e-21          0          +1e-21");

    // Energia total radiada
    println!("\n┌────────────────────────────────────────────────────────────┐");
    println!("│ 5. ENERGIA RADIADA                                         │");
    println!("└────────────────────────────────────────────────────────────┘\n");

    let total_energy = binary.total_radiated_energy();
    let energy_solar_masses = total_energy / (9e16);

    println!("  Energia Total Radiada:");
    println!("    • E_rad = {:.2e} J", total_energy);
    println!("    • E_rad = {:.4} M☉ c²", energy_solar_masses);
    println!(
        "    • Eficiência = {:.2}% da massa total",
        (energy_solar_masses / total_mass) * 100.0
    );

    let power_comparison = luminosity / 3.828e26; // Comparação com Sol
    println!("\n  Comparações:");
    println!("    • L_GW = {:.2e} × L_☉", power_comparison);
    println!("    • Durante fusão: mais brilhante que o universo visível!");

    println!("\n╔════════════════════════════════════════════════════════════╗");
    println!("║                        RESUMO                              ║");
    println!("╚════════════════════════════════════════════════════════════╝");
    println!("\n  ✓ Sistema binário modelado com massas realistas");
    println!("  ✓ Frequências orbital e gravitacional calculadas");
    println!("  ✓ Forma de onda gerada com polarizações h₊ e h×");
    println!("  ✓ SNR calculado para LIGO, Virgo e LISA");
    println!(
        "  ✓ Energia radiada: ~{:.1}% da massa total convertida\n",
        (energy_solar_masses / total_mass) * 100.0
    );

    println!("  Aplicações:");
    println!("    • Previsão de detectabilidade de eventos");
    println!("    • Estimativa de parâmetros (massas, distância)");
    println!("    • Planejamento de observações");
    println!("    • Análise de dados de LIGO/Virgo\n");
    println!("══════════════════════════════════════════════════════════════");
}

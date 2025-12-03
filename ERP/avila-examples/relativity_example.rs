use arxis_quaternions::relativity::{
    LorentzTransform, MinkowskiMetric, RiemannTensor, StressEnergyTensor,
};
use arxis_quaternions::tensor::{Matrix, Vector};
use std::f64::consts::PI;

fn main() {
    println!("=== Exemplos de Relatividade Geral ===\n");

    // ========== MÉTRICA DE MINKOWSKI ==========
    println!("--- Métrica de Minkowski (Espaço-tempo Plano) ---");
    let metric = MinkowskiMetric::new();

    println!("Métrica de Minkowski g_μν (assinatura -,+,+,+):");
    for mu in 0..4 {
        print!("  [");
        for nu in 0..4 {
            print!("{:5.1}", metric.metric.get([mu, nu]).unwrap());
        }
        println!(" ]");
    }

    // ========== INTERVALOS ESPAÇO-TEMPORAIS ==========
    println!("\n--- Intervalos Espaço-temporais ---");

    // Intervalo tipo tempo (futuro)
    let dt_timelike = Vector::from_slice(&[2.0, 1.0, 0.0, 0.0]);
    let ds2_timelike = metric.interval(&dt_timelike);
    println!("Vetor tipo tempo: dx^μ = [2.0, 1.0, 0.0, 0.0]");
    println!("  ds² = {:.4} (negativo → tipo tempo)", ds2_timelike);
    println!(
        "  Classificação: {:?}",
        metric.classify_vector(&dt_timelike)
    );

    // Intervalo tipo luz (nulo)
    let dt_lightlike = Vector::from_slice(&[1.0, 1.0, 0.0, 0.0]);
    let ds2_lightlike = metric.interval(&dt_lightlike);
    println!("\nVetor tipo luz: dx^μ = [1.0, 1.0, 0.0, 0.0]");
    println!("  ds² = {:.4} (zero → tipo luz)", ds2_lightlike);
    println!(
        "  Classificação: {:?}",
        metric.classify_vector(&dt_lightlike)
    );

    // Intervalo tipo espaço
    let dt_spacelike = Vector::from_slice(&[1.0, 2.0, 0.0, 0.0]);
    let ds2_spacelike = metric.interval(&dt_spacelike);
    println!("\nVetor tipo espaço: dx^μ = [1.0, 2.0, 0.0, 0.0]");
    println!("  ds² = {:.4} (positivo → tipo espaço)", ds2_spacelike);
    println!(
        "  Classificação: {:?}",
        metric.classify_vector(&dt_spacelike)
    );

    // ========== TRANSFORMAÇÕES DE LORENTZ ==========
    println!("\n--- Transformações de Lorentz (Boosts) ---");

    // Boost na direção x
    let beta_x = 0.6; // 60% da velocidade da luz
    let boost_x = LorentzTransform::boost_x(beta_x).unwrap();

    println!("\nBoost de Lorentz na direção x (β = {}):", beta_x);
    println!("Matriz de transformação Λ^μ_ν:");
    for mu in 0..4 {
        print!("  [");
        for nu in 0..4 {
            print!("{:8.4}", boost_x.lambda.get([mu, nu]).unwrap());
        }
        println!(" ]");
    }

    // Aplica transformação
    let event = Vector::from_slice(&[1.0, 0.5, 0.0, 0.0]); // (t, x, y, z)
    let transformed = boost_x.transform(&event).unwrap();

    println!(
        "\nEvento original: (t, x, y, z) = ({:.3}, {:.3}, {:.3}, {:.3})",
        event.get([0]).unwrap(),
        event.get([1]).unwrap(),
        event.get([2]).unwrap(),
        event.get([3]).unwrap()
    );
    println!(
        "Após boost: (t', x', y', z') = ({:.3}, {:.3}, {:.3}, {:.3})",
        transformed.get([0]).unwrap(),
        transformed.get([1]).unwrap(),
        transformed.get([2]).unwrap(),
        transformed.get([3]).unwrap()
    );

    // Verifica invariância do intervalo
    let ds2_original = metric.interval(&event);
    let ds2_transformed = metric.interval(&transformed);
    println!("\nInvariância do intervalo:");
    println!("  ds² original = {:.6}", ds2_original);
    println!("  ds² transformado = {:.6}", ds2_transformed);
    println!(
        "  Diferença: {:.2e}",
        (ds2_original - ds2_transformed).abs()
    );

    // ========== BOOST GENÉRICO ==========
    println!("\n--- Boost Genérico (direção arbitrária) ---");
    let velocity = [0.3, 0.4, 0.0]; // velocidade (vx, vy, vz) em unidades de c
    let boost_general = LorentzTransform::boost(velocity).unwrap();

    let v_magnitude =
        (velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2]).sqrt();
    println!(
        "Velocidade: v = ({:.2}, {:.2}, {:.2})c",
        velocity[0], velocity[1], velocity[2]
    );
    println!("|v| = {:.3}c", v_magnitude);
    println!("γ = {:.4}", 1.0 / (1.0 - v_magnitude * v_magnitude).sqrt());

    let particle = Vector::from_slice(&[1.0, 0.0, 0.0, 0.0]);
    let boosted = boost_general.transform(&particle).unwrap();
    println!("\nPartícula em repouso: {:?}", particle.data);
    println!(
        "Após boost: [{:.4}, {:.4}, {:.4}, {:.4}]",
        boosted.get([0]).unwrap(),
        boosted.get([1]).unwrap(),
        boosted.get([2]).unwrap(),
        boosted.get([3]).unwrap()
    );

    // ========== COMPOSIÇÃO DE TRANSFORMAÇÕES ==========
    println!("\n--- Composição de Transformações de Lorentz ---");
    let boost1 = LorentzTransform::boost_x(0.5).unwrap();
    let boost2 = LorentzTransform::boost_y(0.3).unwrap();
    let composed = boost1.compose(&boost2).unwrap();

    println!("Boost1 (x, β=0.5) ∘ Boost2 (y, β=0.3)");
    let test_vec = Vector::from_slice(&[1.0, 0.0, 0.0, 0.0]);
    let result = composed.transform(&test_vec).unwrap();
    println!(
        "Vetor [1, 0, 0, 0] transformado: [{:.4}, {:.4}, {:.4}, {:.4}]",
        result.get([0]).unwrap(),
        result.get([1]).unwrap(),
        result.get([2]).unwrap(),
        result.get([3]).unwrap()
    );

    // ========== ROTAÇÕES ESPACIAIS ==========
    println!("\n--- Rotações Espaciais (não afetam o tempo) ---");
    let rotation_z = LorentzTransform::rotation_z(PI / 4.0); // 45 graus

    println!("Rotação de 45° em torno do eixo z:");
    let space_point = Vector::from_slice(&[0.0, 1.0, 0.0, 0.0]);
    let rotated = rotation_z.transform(&space_point).unwrap();
    println!(
        "Ponto (0, 1, 0, 0) rotacionado: [{:.4}, {:.4}, {:.4}, {:.4}]",
        rotated.get([0]).unwrap(),
        rotated.get([1]).unwrap(),
        rotated.get([2]).unwrap(),
        rotated.get([3]).unwrap()
    );

    // ========== TENSOR ENERGIA-MOMENTO ==========
    println!("\n--- Tensor Energia-Momento ---");

    // Vácuo
    let vacuum = StressEnergyTensor::vacuum();
    println!("\nTensor energia-momento do vácuo:");
    println!("  Densidade de energia: {}", vacuum.energy_density());
    println!("  Pressão: {}", vacuum.pressure());

    // Fluido perfeito
    let density = 1.0; // densidade de energia
    let pressure = 0.3; // pressão
    let four_velocity = Vector::from_slice(&[1.0, 0.0, 0.0, 0.0]); // em repouso

    let perfect_fluid =
        StressEnergyTensor::perfect_fluid(density, pressure, &four_velocity, &metric.metric)
            .unwrap();

    println!("\nTensor energia-momento de fluido perfeito:");
    println!("  ρ (densidade): {}", density);
    println!("  p (pressão): {}", pressure);
    println!("  T^00 = {:.4}", perfect_fluid.energy_density());
    println!("  Pressão média = {:.4}", perfect_fluid.pressure());
    println!("  Traço T = {:.4}", perfect_fluid.trace(&metric.metric));

    // Campo eletromagnético
    println!("\nTensor energia-momento do campo eletromagnético:");
    let mut field_tensor = Matrix::zeros([4, 4]);
    // Campo elétrico na direção x: E_x
    field_tensor.set([0, 1], 1.0).unwrap();
    field_tensor.set([1, 0], -1.0).unwrap();

    let em_tensor = StressEnergyTensor::electromagnetic_field(&field_tensor, &metric.metric);
    println!("  Densidade de energia: {:.4}", em_tensor.energy_density());
    println!("  Pressão: {:.4}", em_tensor.pressure());

    // ========== TENSOR DE RIEMANN ==========
    println!("\n--- Tensor de Riemann (Curvatura) ---");

    let riemann_flat = RiemannTensor::flat_spacetime();
    println!("\nEspaço-tempo plano (Minkowski):");
    println!(
        "  Escalar de Ricci R = {}",
        riemann_flat.ricci_scalar(&metric.metric)
    );
    println!("  (R = 0 indica espaço-tempo plano)");

    // ========== APLICAÇÃO: PARADOXO DOS GÊMEOS ==========
    println!("\n--- Aplicação: Paradoxo dos Gêmeos ---");

    let tau_earth = 10.0; // tempo próprio na Terra (anos)
    let beta_ship: f64 = 0.8; // velocidade da nave (80% de c)
    let gamma_ship = 1.0 / (1.0 - beta_ship * beta_ship).sqrt();

    let tau_ship = tau_earth / gamma_ship; // dilatação do tempo

    println!("Tempo decorrido na Terra: {:.2} anos", tau_earth);
    println!("Velocidade da nave: {:.1}c", beta_ship);
    println!("Fator de Lorentz γ: {:.4}", gamma_ship);
    println!("Tempo próprio na nave: {:.2} anos", tau_ship);
    println!("Diferença: {:.2} anos", tau_earth - tau_ship);

    // ========== TRANSFORMAÇÃO DE VELOCIDADES ==========
    println!("\n--- Adição Relativística de Velocidades ---");

    let v1 = 0.6; // 60% de c
    let v2 = 0.7; // 70% de c

    // Fórmula não-relativística (errada!)
    let v_classical = v1 + v2;
    println!(
        "\nSoma clássica: {:.2}c + {:.2}c = {:.2}c (> c, impossível!)",
        v1, v2, v_classical
    );

    // Fórmula relativística correta
    let v_relativistic = (v1 + v2) / (1.0 + v1 * v2);
    println!(
        "Soma relativística: ({:.2}c + {:.2}c) / (1 + {:.2}×{:.2}) = {:.4}c (< c ✓)",
        v1, v2, v1, v2, v_relativistic
    );

    // ========== ENERGIA E MOMENTO RELATIVÍSTICOS ==========
    println!("\n--- Energia e Momento Relativísticos ---");

    let m0 = 1.0; // massa de repouso (unidades naturais)
    let v: f64 = 0.866; // velocidade (≈ 86.6% de c)
    let gamma = 1.0 / (1.0 - v * v).sqrt();

    let energy = gamma * m0; // E = γmc²
    let momentum = gamma * m0 * v; // p = γmv
    let energy_rest = m0; // E₀ = mc²

    println!("Massa de repouso: {:.2} (unidades naturais c=1)", m0);
    println!("Velocidade: {:.3}c", v);
    println!("Fator γ: {:.4}", gamma);
    println!("Energia total: E = {:.4}", energy);
    println!("Energia de repouso: E₀ = {:.4}", energy_rest);
    println!("Energia cinética: K = {:.4}", energy - energy_rest);
    println!("Momento: p = {:.4}", momentum);

    // Verifica E² = (pc)² + (m₀c²)²
    let e_squared: f64 = energy * energy;
    let invariant: f64 = momentum * momentum + m0 * m0;
    println!("\nInvariante relativístico:");
    println!("  E² = {:.6}", e_squared);
    println!("  p² + m² = {:.6}", invariant);
    println!("  Diferença: {:.2e}", (e_squared - invariant).abs());

    println!("\n=== Fim dos Exemplos de Relatividade ===");
}

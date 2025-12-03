/// Geodésicas e Movimento de Partículas em Espaço-Tempo Curvo
///
/// Este módulo implementa o cálculo de geodésicas (trajetórias de queda livre)
/// em espaço-tempo curvo usando as equações geodésicas:
///
/// d²x^μ/dλ² + Γ^μ_αβ (dx^α/dλ)(dx^β/dλ) = 0
///
/// Inclui:
/// - Integração de geodésicas usando Runge-Kutta de 4ª ordem
/// - Órbitas circulares e estáveis
/// - Órbitas de partículas massivas e fótons
/// - Precessão periélica
/// - Redshift gravitacional
use crate::physics::einstein::ChristoffelSymbols;
use crate::tensor::tensor::Matrix;
use std::f64::consts::PI;

/// Estado completo de uma partícula no espaço-tempo
#[derive(Debug, Clone)]
pub struct ParticleState {
    /// Posição [t, r, θ, φ]
    pub position: [f64; 4],
    /// Velocidade [dt/dλ, dr/dλ, dθ/dλ, dφ/dλ]
    pub velocity: [f64; 4],
    /// Parâmetro afim λ
    pub lambda: f64,
    /// Energia da partícula (conservada)
    pub energy: f64,
    /// Momento angular (conservado em simetrias)
    pub angular_momentum: f64,
}

impl ParticleState {
    /// Cria novo estado de partícula
    pub fn new(position: [f64; 4], velocity: [f64; 4]) -> Self {
        Self {
            position,
            velocity,
            lambda: 0.0,
            energy: 0.0,
            angular_momentum: 0.0,
        }
    }

    /// Calcula energia da partícula E = -p_t (conservada)
    pub fn calculate_energy(&self, metric: &Matrix) -> f64 {
        let mut energy = 0.0;
        for mu in 0..4 {
            let g_mu_0 = metric.get([mu, 0]).unwrap_or(0.0);
            energy -= g_mu_0 * self.velocity[mu];
        }
        energy
    }

    /// Calcula momento angular L_z = p_φ (conservado em simetrias axiais)
    pub fn calculate_angular_momentum(&self, metric: &Matrix) -> f64 {
        let mut l_z = 0.0;
        for mu in 0..4 {
            let g_mu_3 = metric.get([mu, 3]).unwrap_or(0.0);
            l_z += g_mu_3 * self.velocity[mu];
        }
        l_z
    }
}

/// Integrador de geodésicas usando Runge-Kutta 4
pub struct GeodesicIntegrator<F>
where
    F: Fn(&[f64; 4]) -> Matrix,
{
    /// Função que retorna a métrica em um ponto
    metric_func: F,
    /// Passo de integração
    pub step_size: f64,
    /// Epsilon para diferenciação numérica
    pub epsilon: f64,
}

impl<F> GeodesicIntegrator<F>
where
    F: Fn(&[f64; 4]) -> Matrix,
{
    /// Cria novo integrador
    pub fn new(metric_func: F, step_size: f64) -> Self {
        Self {
            metric_func,
            step_size,
            epsilon: 1e-6,
        }
    }

    /// Calcula derivadas das coordenadas usando equação geodésica
    /// d²x^μ/dλ² = -Γ^μ_αβ (dx^α/dλ)(dx^β/dλ)
    fn compute_acceleration(&self, state: &ParticleState) -> [f64; 4] {
        let christoffel =
            ChristoffelSymbols::from_metric(&self.metric_func, &state.position, self.epsilon);

        let mut acceleration = [0.0; 4];

        for mu in 0..4 {
            let mut acc = 0.0;
            for alpha in 0..4 {
                for beta in 0..4 {
                    let gamma = christoffel.get(mu, alpha, beta);
                    acc -= gamma * state.velocity[alpha] * state.velocity[beta];
                }
            }
            acceleration[mu] = acc;
        }

        acceleration
    }

    /// Avança um passo usando Runge-Kutta 4
    pub fn step(&self, state: &ParticleState) -> ParticleState {
        let h = self.step_size;

        // k1
        let acc1 = self.compute_acceleration(state);
        let k1_pos = state.velocity;
        let k1_vel = acc1;

        // k2
        let mut state2 = state.clone();
        for i in 0..4 {
            state2.position[i] += 0.5 * h * k1_pos[i];
            state2.velocity[i] += 0.5 * h * k1_vel[i];
        }
        let acc2 = self.compute_acceleration(&state2);
        let k2_pos = state2.velocity;
        let k2_vel = acc2;

        // k3
        let mut state3 = state.clone();
        for i in 0..4 {
            state3.position[i] += 0.5 * h * k2_pos[i];
            state3.velocity[i] += 0.5 * h * k2_vel[i];
        }
        let acc3 = self.compute_acceleration(&state3);
        let k3_pos = state3.velocity;
        let k3_vel = acc3;

        // k4
        let mut state4 = state.clone();
        for i in 0..4 {
            state4.position[i] += h * k3_pos[i];
            state4.velocity[i] += h * k3_vel[i];
        }
        let acc4 = self.compute_acceleration(&state4);
        let k4_pos = state4.velocity;
        let k4_vel = acc4;

        // Combina resultados
        let mut new_state = state.clone();
        for i in 0..4 {
            new_state.position[i] +=
                (h / 6.0) * (k1_pos[i] + 2.0 * k2_pos[i] + 2.0 * k3_pos[i] + k4_pos[i]);
            new_state.velocity[i] +=
                (h / 6.0) * (k1_vel[i] + 2.0 * k2_vel[i] + 2.0 * k3_vel[i] + k4_vel[i]);
        }
        new_state.lambda += h;

        new_state
    }

    /// Integra geodésica por múltiplos passos
    pub fn integrate(&self, initial_state: ParticleState, num_steps: usize) -> Vec<ParticleState> {
        let mut trajectory = Vec::with_capacity(num_steps + 1);
        trajectory.push(initial_state.clone());

        let mut current_state = initial_state;

        for _ in 0..num_steps {
            current_state = self.step(&current_state);
            trajectory.push(current_state.clone());
        }

        trajectory
    }

    /// Integra até que uma condição seja satisfeita (ex: r < r_min)
    pub fn integrate_until<P>(
        &self,
        initial_state: ParticleState,
        max_steps: usize,
        predicate: P,
    ) -> Vec<ParticleState>
    where
        P: Fn(&ParticleState) -> bool,
    {
        let mut trajectory = Vec::with_capacity(max_steps + 1);
        trajectory.push(initial_state.clone());

        let mut current_state = initial_state;

        for _ in 0..max_steps {
            current_state = self.step(&current_state);
            trajectory.push(current_state.clone());

            if predicate(&current_state) {
                break;
            }
        }

        trajectory
    }
}

/// Tipos de órbitas
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum OrbitType {
    /// Órbita circular estável
    Circular,
    /// Órbita elíptica
    Elliptic,
    /// Órbita hiperbólica (escape)
    Hyperbolic,
    /// Órbita de captura (cai no buraco negro)
    Capture,
    /// Órbita de fóton
    Photon,
}

/// Calculadora de propriedades orbitais
pub struct OrbitCalculator {
    /// Massa do objeto central
    pub mass: f64,
}

impl OrbitCalculator {
    /// Cria novo calculador
    pub fn new(mass: f64) -> Self {
        Self { mass }
    }

    /// Calcula raio da órbita circular mais interna estável (ISCO)
    /// Para Schwarzschild: r_ISCO = 6M
    pub fn isco_radius(&self) -> f64 {
        6.0 * self.mass
    }

    /// Calcula raio da órbita de fótons (esfera de fótons)
    /// Para Schwarzschild: r_ph = 3M
    pub fn photon_sphere_radius(&self) -> f64 {
        3.0 * self.mass
    }

    /// Calcula velocidade angular para órbita circular em raio r
    /// Ω = √(M/r³)
    pub fn circular_angular_velocity(&self, r: f64) -> f64 {
        (self.mass / r.powi(3)).sqrt()
    }

    /// Calcula energia específica para órbita circular
    /// E/m = √(1 - 2M/r) / √(1 - 3M/r)
    pub fn circular_orbit_energy(&self, r: f64) -> f64 {
        let rs = 2.0 * self.mass;
        ((1.0 - rs / r) / (1.0 - 3.0 * self.mass / r)).sqrt()
    }

    /// Calcula momento angular específico para órbita circular
    /// L/m = √(M r²/(r - 3M))
    pub fn circular_orbit_angular_momentum(&self, r: f64) -> f64 {
        (self.mass * r * r / (r - 3.0 * self.mass)).sqrt()
    }

    /// Verifica se órbita é estável
    pub fn is_stable_orbit(&self, r: f64) -> bool {
        r >= self.isco_radius()
    }

    /// Calcula período orbital (tempo coordenado)
    /// T = 2π √(r³/M)
    pub fn orbital_period(&self, r: f64) -> f64 {
        2.0 * PI * (r.powi(3) / self.mass).sqrt()
    }

    /// Calcula precessão periélica por órbita (radianos)
    /// Δφ ≈ 6πM/a(1-e²) para órbitas elípticas
    /// onde a é semi-eixo maior, e é excentricidade
    pub fn perihelion_precession(&self, semi_major_axis: f64, eccentricity: f64) -> f64 {
        let a = semi_major_axis;
        let e = eccentricity;
        6.0 * PI * self.mass / (a * (1.0 - e * e))
    }

    /// Calcula redshift gravitacional
    /// z = 1/√(1 - 2M/r) - 1
    pub fn gravitational_redshift(&self, r: f64) -> f64 {
        let rs = 2.0 * self.mass;
        1.0 / (1.0 - rs / r).sqrt() - 1.0
    }

    /// Determina tipo de órbita baseado em energia e momento angular
    pub fn classify_orbit(&self, energy: f64, angular_momentum: f64, is_photon: bool) -> OrbitType {
        if is_photon {
            return OrbitType::Photon;
        }

        // Energia efetiva para classificar órbitas
        if energy >= 1.0 {
            OrbitType::Hyperbolic
        } else if angular_momentum < self.circular_orbit_angular_momentum(self.isco_radius()) {
            OrbitType::Capture
        } else if energy
            < self.circular_orbit_energy(
                self.isco_radius() + 0.1, // pequena margem
            )
        {
            OrbitType::Elliptic
        } else {
            OrbitType::Circular
        }
    }
}

/// Calculadora de efeitos gravitacionais
pub struct GravitationalEffects {
    /// Massa do objeto central
    pub mass: f64,
}

impl GravitationalEffects {
    /// Cria novo calculador de efeitos
    pub fn new(mass: f64) -> Self {
        Self { mass }
    }

    /// Calcula deflexão da luz por um objeto massivo
    /// Δθ ≈ 4M/b para b >> M (parâmetro de impacto)
    pub fn light_deflection(&self, impact_parameter: f64) -> f64 {
        4.0 * self.mass / impact_parameter
    }

    /// Calcula atraso de Shapiro (time delay)
    /// Δt ≈ 4M ln(r1 r2 / b²)
    pub fn shapiro_delay(&self, r1: f64, r2: f64, impact_parameter: f64) -> f64 {
        4.0 * self.mass * ((r1 * r2) / (impact_parameter * impact_parameter)).ln()
    }

    /// Calcula fator de Lorentz para velocidade em r
    /// γ = 1/√(1 - v²/c² - 2M/r)
    pub fn lorentz_factor(&self, r: f64, velocity: f64) -> f64 {
        let rs = 2.0 * self.mass;
        1.0 / (1.0 - velocity * velocity - rs / r).sqrt()
    }

    /// Calcula velocidade de escape
    /// v_esc = √(2M/r)
    pub fn escape_velocity(&self, r: f64) -> f64 {
        (2.0 * self.mass / r).sqrt()
    }

    /// Calcula raio de Hill (esfera de influência gravitacional)
    /// r_H = a (m/3M)^(1/3)
    pub fn hill_radius(&self, semi_major_axis: f64, satellite_mass: f64) -> f64 {
        semi_major_axis * (satellite_mass / (3.0 * self.mass)).powf(1.0 / 3.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::physics::einstein::MetricTensor;

    #[test]
    fn test_particle_state_energy() {
        let position = [0.0, 10.0, PI / 2.0, 0.0];
        let velocity = [1.0, 0.0, 0.0, 0.1];
        let state = ParticleState::new(position, velocity);

        let metric = MetricTensor::schwarzschild(1.0, 10.0, PI / 2.0);
        let energy = state.calculate_energy(&metric.components);

        assert!(energy.abs() > 0.0);
    }

    #[test]
    fn test_orbit_calculator_isco() {
        let calc = OrbitCalculator::new(1.0);
        assert_eq!(calc.isco_radius(), 6.0);
        assert_eq!(calc.photon_sphere_radius(), 3.0);
    }

    #[test]
    fn test_circular_orbit_properties() {
        let calc = OrbitCalculator::new(1.0);
        let r = 10.0;

        let omega = calc.circular_angular_velocity(r);
        let period = calc.orbital_period(r);

        // Verifica consistência: 2π/Ω = T
        assert!((2.0 * PI / omega - period).abs() < 1e-10);

        assert!(calc.is_stable_orbit(r));
        assert!(!calc.is_stable_orbit(5.0));
    }

    #[test]
    fn test_gravitational_redshift() {
        let calc = OrbitCalculator::new(1.0);
        let z = calc.gravitational_redshift(10.0);

        // Redshift deve ser positivo e pequeno para r >> M
        assert!(z > 0.0 && z < 1.0);
    }

    #[test]
    fn test_light_deflection() {
        let effects = GravitationalEffects::new(1.0);
        let deflection = effects.light_deflection(10.0);

        // Deflexão deve ser pequena para b >> M
        assert!(deflection > 0.0 && deflection < 1.0);
    }

    #[test]
    fn test_escape_velocity() {
        let effects = GravitationalEffects::new(1.0);
        let v_esc = effects.escape_velocity(10.0);

        // Velocidade de escape deve ser < c (=1 em unidades geométricas)
        assert!(v_esc > 0.0 && v_esc < 1.0);
    }

    #[test]
    fn test_geodesic_integration() {
        let mass = 1.0;
        let metric_func = |x: &[f64; 4]| MetricTensor::schwarzschild(mass, x[1], x[2]).components;

        let integrator = GeodesicIntegrator::new(metric_func, 0.1);

        let initial_position = [0.0, 10.0, PI / 2.0, 0.0];
        let initial_velocity = [1.0, 0.0, 0.0, 0.1]; // órbita aproximadamente circular

        let initial_state = ParticleState::new(initial_position, initial_velocity);

        let trajectory = integrator.integrate(initial_state, 10);

        assert_eq!(trajectory.len(), 11); // 10 passos + estado inicial
        assert!(trajectory.last().unwrap().lambda > 0.0);
    }

    #[test]
    fn test_orbit_classification() {
        let calc = OrbitCalculator::new(1.0);

        // Fóton
        assert_eq!(calc.classify_orbit(1.0, 5.0, true), OrbitType::Photon);

        // Órbita hiperbólica (E >= 1)
        assert_eq!(calc.classify_orbit(1.5, 10.0, false), OrbitType::Hyperbolic);
    }
}

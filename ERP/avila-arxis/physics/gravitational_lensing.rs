/// Lentes Gravitacionais - Deflexão de Luz pela Curvatura do Espaço-Tempo
///
/// Este módulo implementa a teoria de lentes gravitacionais, incluindo:
/// - Lentes gravitacionais fortes (strong lensing)
/// - Lentes gravitacionais fracas (weak lensing)
/// - Microlentes gravitacionais
/// - Equações de lentes e magnificação
/// - Anéis de Einstein e arcos gravitacionais
///
/// Baseado na equação de lentes:
/// β = θ - α(θ)
/// onde β é a posição da fonte, θ é a posição da imagem, e α é o ângulo de deflexão
use std::f64::consts::PI;

/// Tipo de lente gravitacional
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum LensType {
    /// Lente pontual (ponto de massa)
    PointMass,
    /// Lente SIS (Singular Isothermal Sphere)
    SIS,
    /// Lente NFW (Navarro-Frenk-White)
    NFW,
}

/// Configuração de lente gravitacional
#[derive(Debug, Clone)]
pub struct GravitationalLens {
    /// Massa da lente (em massas solares)
    pub mass: f64,
    /// Distância do observador à lente (em parsecs)
    pub distance_lens: f64,
    /// Distância do observador à fonte (em parsecs)
    pub distance_source: f64,
    /// Tipo de lente
    pub lens_type: LensType,
    /// Parâmetro de concentração (para NFW)
    pub concentration: f64,
}

impl GravitationalLens {
    /// Cria nova lente gravitacional
    pub fn new(mass: f64, distance_lens: f64, distance_source: f64, lens_type: LensType) -> Self {
        Self {
            mass,
            distance_lens,
            distance_source,
            lens_type,
            concentration: 10.0, // valor típico para NFW
        }
    }

    /// Cria lente pontual
    pub fn point_mass(mass: f64, d_lens: f64, d_source: f64) -> Self {
        Self::new(mass, d_lens, d_source, LensType::PointMass)
    }

    /// Distância entre lente e fonte
    pub fn distance_lens_source(&self) -> f64 {
        self.distance_source - self.distance_lens
    }

    /// Raio de Einstein θ_E = √(4GM/c² · D_LS/(D_L · D_S))
    /// Retorna em radianos
    pub fn einstein_radius(&self) -> f64 {
        let d_l = self.distance_lens * 3.086e16; // pc para metros
        let d_s = self.distance_source * 3.086e16;
        let d_ls = self.distance_lens_source() * 3.086e16;

        // 4GM/c² em unidades geométricas (M em massas solares)
        let r_s = 2.0 * self.mass * 1.477e3; // raio de Schwarzschild em metros

        // θ_E = √(r_s · D_LS / (D_L · D_S))
        (r_s * d_ls / (d_l * d_s)).sqrt()
    }

    /// Raio de Einstein em arcseconds
    pub fn einstein_radius_arcsec(&self) -> f64 {
        self.einstein_radius() * 206265.0
    }

    /// Ângulo de deflexão α(θ) para diferentes tipos de lente
    /// θ em radianos, retorna α em radianos
    pub fn deflection_angle(&self, theta: f64) -> f64 {
        let theta_e = self.einstein_radius();

        match self.lens_type {
            LensType::PointMass => {
                // α(θ) = θ_E² / θ
                if theta.abs() < 1e-20 {
                    return 0.0;
                }
                theta_e * theta_e / theta
            }
            LensType::SIS => {
                // α(θ) = θ_E (constante)
                theta_e
            }
            LensType::NFW => {
                // Aproximação simplificada para NFW
                let x = theta / theta_e;
                if x < 1e-10 {
                    return 0.0;
                }
                let ln_term = if x < 1.0 {
                    (2.0 / (1.0 - x * x).sqrt())
                        * (0.5 * (1.0 - x).ln() - 0.5 * (1.0 + x).ln()).atanh()
                } else {
                    (2.0 / (x * x - 1.0).sqrt())
                        * (0.5 * (x - 1.0).ln() - 0.5 * (x + 1.0).ln()).atan()
                };
                theta_e * ln_term / x
            }
        }
    }

    /// Equação de lentes: β = θ - α(θ)
    /// Calcula posição da fonte dada posição da imagem
    pub fn source_position(&self, image_theta: f64) -> f64 {
        image_theta - self.deflection_angle(image_theta)
    }

    /// Resolve equação de lentes para encontrar posições de imagens
    /// Dado β (posição da fonte), encontra θ (posições das imagens)
    /// Retorna vetor de posições de imagens (pode haver múltiplas)
    pub fn image_positions(&self, source_beta: f64) -> Vec<f64> {
        let theta_e = self.einstein_radius();

        match self.lens_type {
            LensType::PointMass => {
                // Solução analítica: θ = (β ± √(β² + 4θ_E²)) / 2
                let discriminant = source_beta * source_beta + 4.0 * theta_e * theta_e;
                let sqrt_disc = discriminant.sqrt();

                vec![
                    (source_beta + sqrt_disc) / 2.0, // Imagem positiva
                    (source_beta - sqrt_disc) / 2.0, // Imagem negativa
                ]
            }
            LensType::SIS => {
                // θ = β ± θ_E
                if source_beta.abs() < theta_e {
                    // Dentro do raio de Einstein: apenas uma imagem
                    vec![source_beta + theta_e]
                } else {
                    // Fora: duas imagens
                    vec![source_beta + theta_e, source_beta - theta_e]
                }
            }
            LensType::NFW => {
                // Solução numérica (simplificada)
                // Para NFW completo, seria necessário método iterativo
                let theta_guess = source_beta + theta_e;
                vec![theta_guess]
            }
        }
    }

    /// Magnificação μ = |dθ/dβ|⁻¹
    /// Para lente axialmente simétrica: μ = [1 - (θ_E/θ)²]⁻¹
    pub fn magnification(&self, theta: f64) -> f64 {
        if theta.abs() < 1e-20 {
            return f64::INFINITY;
        }

        let theta_e = self.einstein_radius();

        match self.lens_type {
            LensType::PointMass | LensType::SIS => {
                let ratio = theta_e / theta;
                1.0 / (1.0 - ratio * ratio).abs()
            }
            LensType::NFW => {
                // Aproximação simplificada
                let x = theta / theta_e;
                if x < 0.1 {
                    return 100.0; // Alta magnificação próximo ao centro
                }
                1.0 / (1.0 - 1.0 / (x * x)).abs()
            }
        }
    }

    /// Magnificação total do sistema (soma de todas as imagens)
    pub fn total_magnification(&self, source_beta: f64) -> f64 {
        let images = self.image_positions(source_beta);
        images.iter().map(|&theta| self.magnification(theta)).sum()
    }

    /// Verifica se forma anel de Einstein (fonte perfeitamente alinhada)
    pub fn forms_einstein_ring(&self, source_beta: f64, tolerance: f64) -> bool {
        source_beta.abs() < tolerance
    }

    /// Calcula separação angular entre imagens múltiplas
    pub fn image_separation(&self, source_beta: f64) -> f64 {
        let images = self.image_positions(source_beta);
        if images.len() < 2 {
            return 0.0;
        }
        (images[0] - images[1]).abs()
    }

    /// Tempo de atraso (time delay) entre imagens
    /// Δt = (D_L D_S / c D_LS) [(θ - β)² / 2 - ψ(θ)]
    /// onde ψ é o potencial gravitacional projetado
    pub fn time_delay(&self, theta: f64, source_beta: f64) -> f64 {
        let d_l = self.distance_lens * 3.086e16;
        let d_s = self.distance_source * 3.086e16;
        let d_ls = self.distance_lens_source() * 3.086e16;

        // Fator geométrico
        let geometric_factor = (d_l * d_s) / (3e8 * d_ls);

        // Termo geométrico
        let geometric_term = (theta - source_beta).powi(2) / 2.0;

        // Potencial de Fermat (simplificado para lente pontual)
        let theta_e = self.einstein_radius();
        let shapiro_term = theta_e * theta_e * (theta / theta_e).abs().ln();

        geometric_factor * (geometric_term - shapiro_term)
    }
}

/// Lente gravitacional fraca (weak lensing)
#[derive(Debug, Clone)]
pub struct WeakLensing {
    /// Convergência κ (densidade de massa projetada)
    pub convergence: f64,
    /// Shear γ₁ (cisalhamento na direção x)
    pub shear_1: f64,
    /// Shear γ₂ (cisalhamento a 45°)
    pub shear_2: f64,
}

impl WeakLensing {
    /// Cria novo sistema de lente fraca
    pub fn new(convergence: f64, shear_1: f64, shear_2: f64) -> Self {
        Self {
            convergence,
            shear_1,
            shear_2,
        }
    }

    /// Shear total γ = √(γ₁² + γ₂²)
    pub fn total_shear(&self) -> f64 {
        (self.shear_1 * self.shear_1 + self.shear_2 * self.shear_2).sqrt()
    }

    /// Ângulo do shear φ_γ = arctan(γ₂/γ₁) / 2
    pub fn shear_angle(&self) -> f64 {
        0.5 * self.shear_2.atan2(self.shear_1)
    }

    /// Elipticidade induzida e = γ / (1 - κ)
    pub fn induced_ellipticity(&self) -> f64 {
        let gamma = self.total_shear();
        gamma / (1.0 - self.convergence)
    }

    /// Magnificação em lente fraca μ ≈ 1 / [(1-κ)² - γ²]
    pub fn magnification(&self) -> f64 {
        let kappa_term = 1.0 - self.convergence;
        let gamma = self.total_shear();
        1.0 / (kappa_term * kappa_term - gamma * gamma).abs()
    }

    /// Distorção de forma de galáxia de fundo
    /// Transforma elipticidade intrínseca em observada
    pub fn distort_galaxy_shape(&self, intrinsic_e1: f64, intrinsic_e2: f64) -> (f64, f64) {
        let factor = 1.0 - self.convergence;
        let e1_obs = (intrinsic_e1 + self.shear_1) / factor;
        let e2_obs = (intrinsic_e2 + self.shear_2) / factor;
        (e1_obs, e2_obs)
    }
}

/// Evento de microlente gravitacional
#[derive(Debug, Clone)]
pub struct MicrolensingEvent {
    /// Massa da lente (em massas solares)
    pub lens_mass: f64,
    /// Parâmetro de impacto u₀ (em unidades de θ_E)
    pub impact_parameter: f64,
    /// Tempo de Einstein t_E (tempo para cruzar θ_E)
    pub einstein_time: f64,
    /// Tempo do pico t₀
    pub peak_time: f64,
}

impl MicrolensingEvent {
    /// Cria novo evento de microlente
    pub fn new(lens_mass: f64, impact_parameter: f64, einstein_time: f64, peak_time: f64) -> Self {
        Self {
            lens_mass,
            impact_parameter,
            einstein_time,
            peak_time,
        }
    }

    /// Parâmetro u(t) = √(u₀² + [(t-t₀)/t_E]²)
    pub fn separation_parameter(&self, time: f64) -> f64 {
        let t_normalized = (time - self.peak_time) / self.einstein_time;
        (self.impact_parameter * self.impact_parameter + t_normalized * t_normalized).sqrt()
    }

    /// Magnificação A(t) = (u² + 2) / [u√(u² + 4)]
    /// onde u = u(t)
    pub fn magnification_at_time(&self, time: f64) -> f64 {
        let u = self.separation_parameter(time);
        let u2 = u * u;
        (u2 + 2.0) / (u * (u2 + 4.0).sqrt())
    }

    /// Magnificação no pico (t = t₀)
    pub fn peak_magnification(&self) -> f64 {
        let u0 = self.impact_parameter;
        let u02 = u0 * u0;
        (u02 + 2.0) / (u0 * (u02 + 4.0).sqrt())
    }

    /// Duração do evento (FWHM - Full Width at Half Maximum)
    pub fn event_duration(&self) -> f64 {
        // Aproximação: Δt ≈ 2t_E√(2 + u₀²)
        2.0 * self.einstein_time * (2.0 + self.impact_parameter * self.impact_parameter).sqrt()
    }

    /// Verifica se o evento é detectável (magnificação > threshold)
    pub fn is_detectable(&self, threshold: f64) -> bool {
        self.peak_magnification() > threshold
    }

    /// Curva de luz completa (magnificação vs tempo)
    pub fn light_curve(&self, time_points: &[f64]) -> Vec<(f64, f64)> {
        time_points
            .iter()
            .map(|&t| (t, self.magnification_at_time(t)))
            .collect()
    }
}

/// Calculadora de estatísticas de lentes
pub struct LensingStatistics;

impl LensingStatistics {
    /// Profundidade óptica τ para microlentes
    /// Probabilidade de uma fonte estar magnificada
    pub fn optical_depth(number_density: f64, distance: f64, einstein_radius: f64) -> f64 {
        // τ = π θ_E² n_L D
        PI * einstein_radius * einstein_radius * number_density * distance
    }

    /// Taxa de eventos de microlente (eventos por ano)
    pub fn event_rate(optical_depth: f64, einstein_time: f64, number_of_sources: f64) -> f64 {
        // Γ = (τ / t_E) N_sources
        (optical_depth / einstein_time) * number_of_sources
    }

    /// Seção de choque geométrica para lente forte
    pub fn strong_lensing_cross_section(einstein_radius: f64) -> f64 {
        PI * einstein_radius * einstein_radius
    }

    /// Probabilidade de multiple imaging
    pub fn multiple_image_probability(
        _source_density: f64,
        lens_density: f64,
        einstein_radius: f64,
        survey_area: f64,
    ) -> f64 {
        let cross_section = Self::strong_lensing_cross_section(einstein_radius);
        lens_density * cross_section * survey_area
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_einstein_radius() {
        // Lente com 1 M☉ a 1000 pc da fonte a 2000 pc
        let lens = GravitationalLens::point_mass(1.0, 1000.0, 2000.0);
        let theta_e = lens.einstein_radius_arcsec();

        // Ordem de grandeza: ~0.001 arcsec para massas solares
        assert!(theta_e > 0.0 && theta_e < 0.01);
    }

    #[test]
    fn test_point_mass_deflection() {
        let lens = GravitationalLens::point_mass(1e10, 1e6, 2e6);
        let theta = 1e-5;
        let alpha = lens.deflection_angle(theta);

        // Deflexão deve ser positiva e finita
        assert!(alpha > 0.0);
        assert!(alpha.is_finite());
    }

    #[test]
    fn test_image_positions() {
        let lens = GravitationalLens::point_mass(1e10, 1e6, 2e6);
        let source_beta = 1e-6;
        let images = lens.image_positions(source_beta);

        // Lente pontual sempre produz 2 imagens
        assert_eq!(images.len(), 2);
        // Imagens em lados opostos
        assert!(images[0] > 0.0);
        assert!(images[1] < 0.0);
    }

    #[test]
    fn test_magnification() {
        let lens = GravitationalLens::point_mass(1e10, 1e6, 2e6);
        let theta = lens.einstein_radius() * 2.0;
        let mag = lens.magnification(theta);

        // Magnificação deve ser > 1
        assert!(mag > 1.0);
        assert!(mag.is_finite());
    }

    #[test]
    fn test_einstein_ring() {
        let lens = GravitationalLens::point_mass(1e10, 1e6, 2e6);

        // Alinhamento perfeito forma anel
        assert!(lens.forms_einstein_ring(0.0, 1e-10));

        // Desalinhamento não forma anel
        assert!(!lens.forms_einstein_ring(1e-5, 1e-10));
    }

    #[test]
    fn test_weak_lensing_shear() {
        let wl = WeakLensing::new(0.1, 0.02, 0.03);
        let gamma = wl.total_shear();

        // γ = √(γ₁² + γ₂²)
        let expected = (0.02_f64.powi(2) + 0.03_f64.powi(2)).sqrt();
        assert!((gamma - expected).abs() < 1e-10);
    }

    #[test]
    fn test_weak_lensing_magnification() {
        let wl = WeakLensing::new(0.05, 0.01, 0.01);
        let mag = wl.magnification();

        // μ ≈ 1 / [(1-κ)² - γ²] > 1
        assert!(mag > 1.0);
        assert!(mag < 1.2); // Pequena magnificação para weak lensing
    }

    #[test]
    fn test_microlensing_peak_magnification() {
        let event = MicrolensingEvent::new(1.0, 0.1, 30.0, 100.0);
        let mag_peak = event.peak_magnification();

        // Para u₀ = 0.1, magnificação alta
        assert!(mag_peak > 10.0);
    }

    #[test]
    fn test_microlensing_symmetry() {
        let event = MicrolensingEvent::new(1.0, 0.5, 20.0, 50.0);

        // Curva de luz simétrica em torno do pico
        let mag_before = event.magnification_at_time(40.0); // 10 dias antes
        let mag_after = event.magnification_at_time(60.0); // 10 dias depois

        assert!((mag_before - mag_after).abs() < 1e-10);
    }

    #[test]
    fn test_microlensing_detectability() {
        let event_strong = MicrolensingEvent::new(1.0, 0.1, 20.0, 50.0);
        let event_weak = MicrolensingEvent::new(1.0, 2.0, 20.0, 50.0);

        // u₀ = 0.1 → detectável, u₀ = 2.0 → não detectável
        assert!(event_strong.is_detectable(1.34)); // threshold típico
        assert!(!event_weak.is_detectable(1.34));
    }

    #[test]
    fn test_optical_depth() {
        let tau = LensingStatistics::optical_depth(1e8, 1e3, 1e-6);

        // Profundidade óptica deve ser pequena mas positiva
        assert!(tau > 0.0);
        assert!(tau < 1.0);
    }
}

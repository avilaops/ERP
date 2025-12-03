/// Cosmologia - Evolução e Estrutura do Universo
///
/// Este módulo implementa modelos cosmológicos baseados na Relatividade Geral:
/// - Métrica FLRW (Friedmann-Lemaître-Robertson-Walker)
/// - Equações de Friedmann
/// - Parâmetros cosmológicos (H₀, Ω_m, Ω_Λ, etc.)
/// - Distâncias cosmológicas (luminosidade, angular, comóvel)
/// - Evolução do universo
/// - Idade e horizonte do universo
///
/// Baseado nas equações de Friedmann:
/// H² = (8πG/3)ρ - k/a² + Λ/3
/// onde H = ȧ/a é o parâmetro de Hubble
use std::f64::consts::PI;

/// Parâmetros cosmológicos padrão (Planck 2018)
#[derive(Debug, Clone)]
pub struct CosmologicalParameters {
    /// Constante de Hubble H₀ em km/s/Mpc
    pub h0: f64,
    /// Densidade de matéria Ω_m
    pub omega_matter: f64,
    /// Densidade de energia escura Ω_Λ
    pub omega_lambda: f64,
    /// Densidade de radiação Ω_r
    pub omega_radiation: f64,
    /// Densidade de curvatura Ω_k
    pub omega_curvature: f64,
    /// Temperatura do CMB em Kelvin
    pub cmb_temperature: f64,
}

impl CosmologicalParameters {
    /// Cria parâmetros cosmológicos padrão (Planck 2018)
    pub fn planck_2018() -> Self {
        Self {
            h0: 67.4,                 // km/s/Mpc
            omega_matter: 0.315,      // Matéria (escura + bariônica)
            omega_lambda: 0.685,      // Energia escura
            omega_radiation: 9.24e-5, // Radiação
            omega_curvature: 0.0,     // Universo plano
            cmb_temperature: 2.7255,  // K
        }
    }

    /// Cria parâmetros personalizados
    pub fn new(
        h0: f64,
        omega_matter: f64,
        omega_lambda: f64,
        omega_radiation: f64,
        cmb_temperature: f64,
    ) -> Self {
        let omega_curvature = 1.0 - omega_matter - omega_lambda - omega_radiation;
        Self {
            h0,
            omega_matter,
            omega_lambda,
            omega_radiation,
            omega_curvature,
            cmb_temperature,
        }
    }

    /// Universo Einstein-de Sitter (Ω_m = 1, plano, sem Λ)
    pub fn einstein_de_sitter() -> Self {
        Self {
            h0: 70.0,
            omega_matter: 1.0,
            omega_lambda: 0.0,
            omega_radiation: 0.0,
            omega_curvature: 0.0,
            cmb_temperature: 2.725,
        }
    }

    /// h = H₀/(100 km/s/Mpc)
    pub fn little_h(&self) -> f64 {
        self.h0 / 100.0
    }

    /// Parâmetro de Hubble em 1/s
    pub fn hubble_parameter_si(&self) -> f64 {
        // H₀ em km/s/Mpc → 1/s
        self.h0 * 1000.0 / (3.086e22)
    }

    /// Tempo de Hubble t_H = 1/H₀
    pub fn hubble_time(&self) -> f64 {
        1.0 / self.hubble_parameter_si()
    }

    /// Distância de Hubble d_H = c/H₀
    pub fn hubble_distance(&self) -> f64 {
        3e8 / self.hubble_parameter_si()
    }

    /// Densidade crítica ρ_c = 3H₀²/(8πG)
    pub fn critical_density(&self) -> f64 {
        let h_si = self.hubble_parameter_si();
        3.0 * h_si * h_si / (8.0 * PI * 6.674e-11)
    }

    /// Verifica se o universo é plano
    pub fn is_flat(&self) -> bool {
        let total =
            self.omega_matter + self.omega_lambda + self.omega_radiation + self.omega_curvature;
        (total - 1.0).abs() < 1e-3
    }

    /// Tipo de universo baseado em curvatura
    pub fn universe_type(&self) -> &str {
        if self.omega_curvature.abs() < 1e-6 {
            "Plano (k=0)"
        } else if self.omega_curvature < 0.0 {
            "Aberto (k=-1)"
        } else {
            "Fechado (k=+1)"
        }
    }
}

/// Modelo FLRW (Friedmann-Lemaître-Robertson-Walker)
#[derive(Debug, Clone)]
pub struct FLRWUniverse {
    /// Parâmetros cosmológicos
    pub params: CosmologicalParameters,
}

impl FLRWUniverse {
    /// Cria novo universo FLRW com parâmetros padrão
    pub fn new(params: CosmologicalParameters) -> Self {
        Self { params }
    }

    /// Universo padrão (Planck 2018)
    pub fn standard() -> Self {
        Self::new(CosmologicalParameters::planck_2018())
    }

    /// Parâmetro de Hubble H(z) = H₀ E(z)
    /// E(z) = √[Ω_m(1+z)³ + Ω_r(1+z)⁴ + Ω_k(1+z)² + Ω_Λ]
    pub fn hubble_parameter(&self, redshift: f64) -> f64 {
        let z1 = 1.0 + redshift;
        let e_z = (self.params.omega_matter * z1.powi(3)
            + self.params.omega_radiation * z1.powi(4)
            + self.params.omega_curvature * z1.powi(2)
            + self.params.omega_lambda)
            .sqrt();

        self.params.h0 * e_z
    }

    /// E(z) = H(z)/H₀
    pub fn dimensionless_hubble(&self, redshift: f64) -> f64 {
        self.hubble_parameter(redshift) / self.params.h0
    }

    /// Fator de escala a(t) relativo ao presente (a₀ = 1)
    /// a = 1/(1+z)
    pub fn scale_factor(&self, redshift: f64) -> f64 {
        1.0 / (1.0 + redshift)
    }

    /// Distância comóvel χ(z) = c ∫₀^z dz'/H(z')
    /// Usa integração numérica (regra do trapézio)
    pub fn comoving_distance(&self, redshift: f64) -> f64 {
        let n_steps = 1000;
        let dz = redshift / n_steps as f64;
        let c = 3e8; // m/s

        let mut integral = 0.0;
        for i in 0..n_steps {
            let z1 = i as f64 * dz;
            let z2 = (i + 1) as f64 * dz;

            let h1 = self.hubble_parameter(z1) * 1000.0 / 3.086e22; // para 1/s
            let h2 = self.hubble_parameter(z2) * 1000.0 / 3.086e22;

            integral += (1.0 / h1 + 1.0 / h2) * dz / 2.0;
        }

        c * integral
    }

    /// Distância de luminosidade d_L = (1+z) χ(z)
    pub fn luminosity_distance(&self, redshift: f64) -> f64 {
        (1.0 + redshift) * self.comoving_distance(redshift)
    }

    /// Distância de diâmetro angular d_A = χ(z)/(1+z)
    pub fn angular_diameter_distance(&self, redshift: f64) -> f64 {
        self.comoving_distance(redshift) / (1.0 + redshift)
    }

    /// Módulo de distância μ = 5 log₁₀(d_L/10pc)
    pub fn distance_modulus(&self, redshift: f64) -> f64 {
        let d_l_pc = self.luminosity_distance(redshift) / 3.086e16;
        5.0 * (d_l_pc / 10.0).log10()
    }

    /// Tempo de lookback t_L(z) = ∫₀^z dt/dz' dz'
    /// onde dt/dz = -1/[(1+z)H(z)]
    pub fn lookback_time(&self, redshift: f64) -> f64 {
        let n_steps = 1000;
        let dz = redshift / n_steps as f64;

        let mut integral = 0.0;
        for i in 0..n_steps {
            let z = i as f64 * dz + dz / 2.0;
            let h = self.hubble_parameter(z) * 1000.0 / 3.086e22;
            integral += 1.0 / ((1.0 + z) * h) * dz;
        }

        integral
    }

    /// Idade do universo t₀ (tempo desde Big Bang até hoje)
    pub fn age_of_universe(&self) -> f64 {
        // Idade ≈ tempo de lookback para z → ∞
        // Para z grande, aproximamos
        self.lookback_time(1000.0) + self.lookback_time_high_z(1000.0, 1e10)
    }

    /// Tempo de lookback para z muito alto (aproximação)
    fn lookback_time_high_z(&self, z_start: f64, z_end: f64) -> f64 {
        // Para z alto, Ω_r domina: H(z) ∝ (1+z)²
        let h0_si = self.params.hubble_parameter_si();
        let omega_r_sqrt = self.params.omega_radiation.sqrt();

        1.0 / (2.0 * h0_si * omega_r_sqrt) * (1.0 / (1.0 + z_start) - 1.0 / (1.0 + z_end))
    }

    /// Horizonte de partícula (tamanho da região causalmente conectada)
    pub fn particle_horizon(&self, redshift: f64) -> f64 {
        // χ_p(z) = c ∫_z^∞ dz'/[(1+z')H(z')]
        // Aproximação: usamos lookback time para z grande
        let c = 3e8;
        c * self.lookback_time(redshift)
    }

    /// Tamanho angular de um objeto
    /// θ = D / d_A, onde D é o tamanho físico
    pub fn angular_size(&self, physical_size: f64, redshift: f64) -> f64 {
        physical_size / self.angular_diameter_distance(redshift)
    }

    /// Densidade de energia ρ(z) = ρ_c [Ω_m(1+z)³ + Ω_r(1+z)⁴ + Ω_Λ]
    pub fn energy_density(&self, redshift: f64) -> f64 {
        let rho_c = self.params.critical_density();
        let z1 = 1.0 + redshift;

        rho_c
            * (self.params.omega_matter * z1.powi(3)
                + self.params.omega_radiation * z1.powi(4)
                + self.params.omega_lambda)
    }

    /// Taxa de expansão ȧ/a = H(z)
    pub fn expansion_rate(&self, redshift: f64) -> f64 {
        self.hubble_parameter(redshift)
    }

    /// Parâmetro de desaceleração q(z) = -ä/(aH²)
    pub fn deceleration_parameter(&self, redshift: f64) -> f64 {
        let z1 = 1.0 + redshift;
        let om = self.params.omega_matter * z1.powi(3);
        let or = self.params.omega_radiation * z1.powi(4);
        let ol = self.params.omega_lambda;
        let e2 = om + or + ol;

        (om + 2.0 * or - 2.0 * ol) / (2.0 * e2)
    }
}

/// Estatísticas cosmológicas e observáveis
pub struct CosmologicalObservables;

impl CosmologicalObservables {
    /// Redshift a partir de fator de escala
    pub fn redshift_from_scale_factor(a: f64) -> f64 {
        1.0 / a - 1.0
    }

    /// Temperatura do CMB em função do redshift
    /// T(z) = T₀(1+z)
    pub fn cmb_temperature(t0: f64, redshift: f64) -> f64 {
        t0 * (1.0 + redshift)
    }

    /// Redshift de igualdade matéria-radiação
    pub fn matter_radiation_equality(omega_m: f64, omega_r: f64) -> f64 {
        omega_m / omega_r - 1.0
    }

    /// Redshift de recombinação (aproximado)
    pub fn recombination_redshift() -> f64 {
        1090.0 // z ≈ 1100
    }

    /// Comprimento de onda observado a partir do emitido
    /// λ_obs = λ_em (1+z)
    pub fn observed_wavelength(lambda_emitted: f64, redshift: f64) -> f64 {
        lambda_emitted * (1.0 + redshift)
    }

    /// Brilho superficial com redshift
    /// SB ∝ (1+z)⁻⁴
    pub fn surface_brightness_dimming(redshift: f64) -> f64 {
        1.0 / (1.0 + redshift).powi(4)
    }

    /// Volume comóvel por redshift
    /// dV/dz = 4π c χ²(z) / H(z)
    pub fn comoving_volume_element(universe: &FLRWUniverse, redshift: f64) -> f64 {
        let c = 3e8;
        let chi = universe.comoving_distance(redshift);
        let h = universe.hubble_parameter(redshift) * 1000.0 / 3.086e22;

        4.0 * PI * c * chi * chi / h
    }

    /// Taxa de formação estelar cósmica (aproximação)
    /// SFR(z) ∝ (1+z)^2.7 para z < 1.9
    /// SFR(z) ∝ (1+z)^-2.9 para z > 1.9
    pub fn cosmic_star_formation_rate(redshift: f64) -> f64 {
        if redshift < 1.9 {
            (1.0 + redshift).powf(2.7)
        } else {
            let peak = (1.0_f64 + 1.9).powf(2.7);
            peak * ((1.0 + redshift) / (1.0 + 1.9)).powf(-2.9)
        }
    }
}

/// Estrutura de larga escala e perturbações
#[derive(Debug, Clone)]
pub struct CosmicStructure {
    /// Parâmetros cosmológicos
    _params: CosmologicalParameters,
}

impl CosmicStructure {
    /// Cria nova instância
    pub fn new(params: CosmologicalParameters) -> Self {
        Self { _params: params }
    }

    /// Escala de Jeans (escala mínima para colapso gravitacional)
    /// λ_J = c_s √(π/(Gρ))
    pub fn jeans_length(&self, sound_speed: f64, density: f64) -> f64 {
        sound_speed * (PI / (6.674e-11 * density)).sqrt()
    }

    /// Massa de Jeans
    /// M_J = (4π/3) ρ (λ_J/2)³
    pub fn jeans_mass(&self, sound_speed: f64, density: f64) -> f64 {
        let lambda_j = self.jeans_length(sound_speed, density);
        (4.0 * PI / 3.0) * density * (lambda_j / 2.0).powi(3)
    }

    /// Horizonte sonoro no desacoplamento
    pub fn sound_horizon_decoupling(&self) -> f64 {
        // Aproximação: r_s ≈ 150 Mpc
        150.0 * 3.086e22
    }

    /// Espectro de potência inicial (Harrison-Zel'dovich)
    /// P(k) ∝ k^n_s com n_s ≈ 0.96
    pub fn primordial_power_spectrum(&self, k: f64, n_s: f64) -> f64 {
        k.powf(n_s)
    }

    /// Função de crescimento linear δ(a) ∝ a durante domínio de matéria
    pub fn linear_growth_factor(&self, scale_factor: f64) -> f64 {
        // Aproximação simplificada para Ω_m ≈ 1 no passado
        scale_factor
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_planck_parameters() {
        let params = CosmologicalParameters::planck_2018();

        assert!((params.h0 - 67.4).abs() < 0.1);
        assert!((params.omega_matter - 0.315).abs() < 0.01);
        assert!(params.is_flat());
    }

    #[test]
    fn test_hubble_parameter() {
        let universe = FLRWUniverse::standard();

        // H(z=0) = H₀
        let h0 = universe.hubble_parameter(0.0);
        assert!((h0 - universe.params.h0).abs() < 0.01);

        // H(z) aumenta com z
        let h1 = universe.hubble_parameter(1.0);
        let h2 = universe.hubble_parameter(2.0);
        assert!(h2 > h1);
    }

    #[test]
    fn test_scale_factor() {
        let universe = FLRWUniverse::standard();

        // a(z=0) = 1
        assert!((universe.scale_factor(0.0) - 1.0).abs() < 1e-10);

        // a(z=1) = 0.5
        assert!((universe.scale_factor(1.0) - 0.5).abs() < 1e-10);
    }

    #[test]
    fn test_distance_relations() {
        let universe = FLRWUniverse::standard();
        let z = 0.5;

        let d_c = universe.comoving_distance(z);
        let d_l = universe.luminosity_distance(z);
        let d_a = universe.angular_diameter_distance(z);

        // d_L = (1+z) d_c
        assert!((d_l - (1.0 + z) * d_c).abs() / d_l < 0.01);

        // d_A = d_c / (1+z)
        assert!((d_a - d_c / (1.0 + z)).abs() / d_a < 0.01);

        // d_L = (1+z)² d_A
        assert!((d_l - (1.0 + z).powi(2) * d_a).abs() / d_l < 0.01);
    }

    #[test]
    fn test_lookback_time() {
        let universe = FLRWUniverse::standard();

        // t_L(z=0) = 0
        let t0 = universe.lookback_time(0.0);
        assert!(t0.abs() < 1e-6);

        // t_L aumenta com z
        let t1 = universe.lookback_time(1.0);
        let t2 = universe.lookback_time(2.0);
        assert!(t2 > t1);
    }

    #[test]
    fn test_age_of_universe() {
        let universe = FLRWUniverse::standard();
        let age = universe.age_of_universe();

        // Idade deve ser ~13.8 bilhões de anos
        let age_gyr = age / (365.25 * 24.0 * 3600.0 * 1e9);
        assert!(age_gyr > 10.0 && age_gyr < 20.0);
    }

    #[test]
    fn test_cmb_temperature() {
        let t0 = 2.725;
        let z = 1100.0; // recombinação
        let t_rec = CosmologicalObservables::cmb_temperature(t0, z);

        // T ≈ 3000 K na recombinação
        assert!(t_rec > 2000.0 && t_rec < 4000.0);
    }

    #[test]
    fn test_deceleration_parameter() {
        let universe = FLRWUniverse::standard();

        // q hoje deve ser negativo (expansão acelerada)
        let q0 = universe.deceleration_parameter(0.0);
        assert!(q0 < 0.0);

        // q no passado deve ser positivo (domínio de matéria)
        let q_past = universe.deceleration_parameter(5.0);
        assert!(q_past > 0.0);
    }

    #[test]
    fn test_observed_wavelength() {
        let lambda_em = 500.0; // nm (verde)
        let z = 1.0;
        let lambda_obs = CosmologicalObservables::observed_wavelength(lambda_em, z);

        // λ_obs = λ_em (1+z) = 1000 nm (infravermelho)
        assert!((lambda_obs - 1000.0).abs() < 0.01);
    }

    #[test]
    fn test_einstein_de_sitter() {
        let params = CosmologicalParameters::einstein_de_sitter();

        assert!((params.omega_matter - 1.0).abs() < 1e-10);
        assert!((params.omega_lambda).abs() < 1e-10);
        assert!(params.is_flat());
    }
}

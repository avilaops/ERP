/// Ondas Gravitacionais - Propagação de Perturbações no Espaço-Tempo
///
/// Este módulo implementa a teoria de ondas gravitacionais, incluindo:
/// - Geração de ondas por sistemas binários
/// - Propagação de ondas gravitacionais
/// - Amplitude e frequência de ondas
/// - Energia irradiada por ondas gravitacionais
/// - Detecção e análise de sinais
///
/// Baseado nas equações de Einstein linearizadas:
/// □h_μν = -16πG T_μν (gauge TT - transverse traceless)
use std::f64::consts::PI;

/// Polarização de onda gravitacional
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Polarization {
    /// Polarização + (plus)
    Plus,
    /// Polarização × (cross)
    Cross,
}

/// Onda gravitacional em gauge TT (transverse-traceless)
#[derive(Debug, Clone)]
pub struct GravitationalWave {
    /// Amplitude h+ (polarização +)
    pub h_plus: f64,
    /// Amplitude h× (polarização ×)
    pub h_cross: f64,
    /// Frequência angular ω = 2πf
    pub omega: f64,
    /// Fase inicial φ₀
    pub phase: f64,
    /// Distância da fonte (luminosity distance)
    pub distance: f64,
}

impl GravitationalWave {
    /// Cria nova onda gravitacional
    pub fn new(h_plus: f64, h_cross: f64, frequency: f64, phase: f64, distance: f64) -> Self {
        Self {
            h_plus,
            h_cross,
            omega: 2.0 * PI * frequency,
            phase,
            distance,
        }
    }

    /// Amplitude da onda no tempo t
    pub fn amplitude_at(&self, t: f64, polarization: Polarization) -> f64 {
        let phase_t = self.omega * t + self.phase;

        match polarization {
            Polarization::Plus => self.h_plus * phase_t.cos(),
            Polarization::Cross => self.h_cross * phase_t.sin(),
        }
    }

    /// Strain total (deformação) no tempo t
    /// h(t) = h+ cos(ωt + φ) + h× sin(ωt + φ)
    pub fn strain(&self, t: f64) -> f64 {
        let phase_t = self.omega * t + self.phase;
        self.h_plus * phase_t.cos() + self.h_cross * phase_t.sin()
    }

    /// Frequência em Hz
    pub fn frequency(&self) -> f64 {
        self.omega / (2.0 * PI)
    }

    /// Amplitude característica h_c = h × √(N_cycles)
    /// onde N_cycles é o número de ciclos observados
    pub fn characteristic_amplitude(&self, observation_time: f64) -> f64 {
        let n_cycles = self.frequency() * observation_time;
        self.h_plus.hypot(self.h_cross) * n_cycles.sqrt()
    }

    /// Densidade espectral de energia
    /// dE/df ∝ f² h²
    pub fn energy_spectral_density(&self) -> f64 {
        let h = self.h_plus.hypot(self.h_cross);
        self.frequency().powi(2) * h * h
    }
}

/// Sistema binário compacto (buracos negros ou estrelas de nêutrons)
#[derive(Debug, Clone)]
pub struct CompactBinary {
    /// Massa do primeiro objeto
    pub mass1: f64,
    /// Massa do segundo objeto
    pub mass2: f64,
    /// Separação orbital
    pub separation: f64,
    /// Distância do observador
    pub distance: f64,
    /// Inclinação da órbita (0 = face-on, π/2 = edge-on)
    pub inclination: f64,
}

impl CompactBinary {
    /// Cria novo sistema binário
    pub fn new(mass1: f64, mass2: f64, separation: f64, distance: f64, inclination: f64) -> Self {
        Self {
            mass1,
            mass2,
            separation,
            distance,
            inclination,
        }
    }

    /// Massa total M = m1 + m2
    pub fn total_mass(&self) -> f64 {
        self.mass1 + self.mass2
    }

    /// Massa reduzida μ = m1·m2/(m1+m2)
    pub fn reduced_mass(&self) -> f64 {
        (self.mass1 * self.mass2) / self.total_mass()
    }

    /// Massa de chirp M = μ^(3/5) M^(2/5)
    /// Governa a evolução temporal da frequência
    pub fn chirp_mass(&self) -> f64 {
        let mu = self.reduced_mass();
        let m = self.total_mass();
        mu.powf(3.0 / 5.0) * m.powf(2.0 / 5.0)
    }

    /// Frequência orbital f_orb = √(M/r³) / (2π)
    pub fn orbital_frequency(&self) -> f64 {
        let m = self.total_mass();
        let r = self.separation;
        (m / r.powi(3)).sqrt() / (2.0 * PI)
    }

    /// Frequência da onda gravitacional f_GW = 2 f_orb
    pub fn gravitational_wave_frequency(&self) -> f64 {
        2.0 * self.orbital_frequency()
    }

    /// Velocidade orbital v = √(M/r)
    pub fn orbital_velocity(&self) -> f64 {
        (self.total_mass() / self.separation).sqrt()
    }

    /// Parâmetro pós-newtoniano v/c
    pub fn post_newtonian_parameter(&self) -> f64 {
        self.orbital_velocity() // Em unidades onde c=1
    }

    /// Amplitude da onda gravitacional h ~ (M_chirp/r) (πf M_chirp)^(2/3)
    /// Aproximação quadrupolar
    pub fn wave_amplitude(&self) -> f64 {
        let m_chirp = self.chirp_mass();
        let f = self.gravitational_wave_frequency();
        let d = self.distance;

        // Fator de inclinação
        let iota = self.inclination;
        let amplitude_factor = (1.0 + iota.cos().powi(2)) / 2.0;

        4.0 * amplitude_factor * (m_chirp / d) * (PI * f * m_chirp).powf(2.0 / 3.0)
    }

    /// Amplitudes h+ e h× separadas
    pub fn polarization_amplitudes(&self) -> (f64, f64) {
        let h_0 = self.wave_amplitude();
        let iota = self.inclination;

        let h_plus = h_0 * (1.0 + iota.cos().powi(2));
        let h_cross = -2.0 * h_0 * iota.cos();

        (h_plus, h_cross)
    }

    /// Luminosidade em ondas gravitacionais L_GW = dE/dt
    /// Fórmula de quadrupolo: L_GW = (32/5) μ² M³ / r⁵
    pub fn gravitational_luminosity(&self) -> f64 {
        let mu = self.reduced_mass();
        let m = self.total_mass();
        let r = self.separation;

        (32.0 / 5.0) * mu * mu * m.powi(3) / r.powi(5)
    }

    /// Taxa de decaimento orbital dr/dt devido à radiação gravitacional
    /// dr/dt = -64/5 μM²/r³
    pub fn orbital_decay_rate(&self) -> f64 {
        let mu = self.reduced_mass();
        let m = self.total_mass();
        let r = self.separation;

        -(64.0 / 5.0) * mu * m.powi(2) / r.powi(3)
    }

    /// Tempo até coalescência τ = (5/256) r⁴/(μM²)
    pub fn time_to_coalescence(&self) -> f64 {
        let mu = self.reduced_mass();
        let m = self.total_mass();
        let r = self.separation;

        (5.0 / 256.0) * r.powi(4) / (mu * m.powi(2))
    }

    /// Frequência de chirp df/dt = (96/5) π^(8/3) (M_chirp)^(5/3) f^(11/3)
    pub fn chirp_rate(&self, frequency: f64) -> f64 {
        let m_chirp = self.chirp_mass();
        (96.0 / 5.0) * PI.powf(8.0 / 3.0) * m_chirp.powf(5.0 / 3.0) * frequency.powf(11.0 / 3.0)
    }

    /// Gera onda gravitacional do sistema
    pub fn generate_wave(&self) -> GravitationalWave {
        let (h_plus, h_cross) = self.polarization_amplitudes();
        let frequency = self.gravitational_wave_frequency();

        GravitationalWave::new(h_plus, h_cross, frequency, 0.0, self.distance)
    }
}

/// Detector de ondas gravitacionais (ex: LIGO, Virgo)
#[derive(Debug, Clone)]
pub struct Detector {
    /// Nome do detector
    pub name: String,
    /// Sensibilidade (strain noise) em Hz^(-1/2)
    pub sensitivity: f64,
    /// Banda de frequência mínima (Hz)
    pub min_frequency: f64,
    /// Banda de frequência máxima (Hz)
    pub max_frequency: f64,
}

impl Detector {
    /// Cria novo detector
    pub fn new(name: String, sensitivity: f64, min_freq: f64, max_freq: f64) -> Self {
        Self {
            name,
            sensitivity,
            min_frequency: min_freq,
            max_frequency: max_freq,
        }
    }

    /// Detector LIGO (Laser Interferometer Gravitational-Wave Observatory)
    pub fn ligo() -> Self {
        Self::new(
            "LIGO".to_string(),
            1e-23,  // Sensibilidade ~10^-23 /√Hz
            10.0,   // 10 Hz
            5000.0, // 5 kHz
        )
    }

    /// Detector Virgo
    pub fn virgo() -> Self {
        Self::new("Virgo".to_string(), 2e-23, 10.0, 10000.0)
    }

    /// LISA (Laser Interferometer Space Antenna) - detector espacial
    pub fn lisa() -> Self {
        Self::new(
            "LISA".to_string(),
            1e-20,
            1e-4, // 0.1 mHz
            1.0,  // 1 Hz
        )
    }

    /// Verifica se frequência está na banda do detector
    pub fn in_band(&self, frequency: f64) -> bool {
        frequency >= self.min_frequency && frequency <= self.max_frequency
    }

    /// SNR (Signal-to-Noise Ratio) para uma onda
    /// SNR = h_c / (S_n(f))^(1/2)
    pub fn signal_to_noise_ratio(&self, wave: &GravitationalWave, observation_time: f64) -> f64 {
        if !self.in_band(wave.frequency()) {
            return 0.0;
        }

        let h_c = wave.characteristic_amplitude(observation_time);
        h_c / self.sensitivity
    }

    /// Detectabilidade: SNR > 8 geralmente considerado detectável
    pub fn is_detectable(&self, wave: &GravitationalWave, observation_time: f64) -> bool {
        self.signal_to_noise_ratio(wave, observation_time) > 8.0
    }

    /// Alcance do detector (distância máxima detectável)
    /// para sistema com SNR = 8
    pub fn detection_range(&self, binary: &CompactBinary, observation_time: f64) -> f64 {
        let wave = binary.generate_wave();
        let snr_at_current_distance = self.signal_to_noise_ratio(&wave, observation_time);

        // Escalar distância para SNR = 8
        binary.distance * (snr_at_current_distance / 8.0)
    }
}

/// Análise de sinal de onda gravitacional
pub struct WaveformAnalysis;

impl WaveformAnalysis {
    /// Match filtering: correlação entre template e sinal
    /// ⟨h₁|h₂⟩ = 4 Re ∫ h₁*(f) h₂(f) / S_n(f) df
    pub fn matched_filter_snr(
        signal: &GravitationalWave,
        template: &GravitationalWave,
        detector_sensitivity: f64,
        observation_time: f64,
    ) -> f64 {
        // Aproximação simplificada
        let h_signal = signal.characteristic_amplitude(observation_time);
        let h_template = template.characteristic_amplitude(observation_time);

        let overlap = (h_signal * h_template) / (detector_sensitivity * detector_sensitivity);
        overlap.abs()
    }

    /// Estima massa de chirp a partir de frequência e chirp rate
    /// M = (5/96) π^(-8/3) (df/dt) f^(-11/3)
    pub fn estimate_chirp_mass(frequency: f64, chirp_rate: f64) -> f64 {
        (5.0 / 96.0) * PI.powf(-8.0 / 3.0) * chirp_rate * frequency.powf(-11.0 / 3.0)
    }

    /// Estima distância a partir da amplitude observada
    /// d ~ M_chirp / h × (πf M_chirp)^(2/3)
    pub fn estimate_distance(observed_amplitude: f64, frequency: f64, chirp_mass: f64) -> f64 {
        4.0 * chirp_mass * (PI * frequency * chirp_mass).powf(2.0 / 3.0) / observed_amplitude
    }

    /// Calcula energia total irradiada durante coalescência
    /// E_rad ~ 0.04 M c² para binários iguais (q=1)
    /// Fração maior para binários assimétricos
    pub fn radiated_energy(mass1: f64, mass2: f64) -> f64 {
        let total_mass = mass1 + mass2;
        let mass_ratio = mass1.min(mass2) / mass1.max(mass2);

        // Eficiência de radiação (fração de massa convertida)
        let efficiency = if (mass_ratio - 1.0).abs() < 0.1 {
            0.04 // ~4% para massas iguais
        } else {
            0.04 * (1.0 + 0.5 * (1.0 - mass_ratio)) // Mais para assimétricas
        };

        efficiency * total_mass // Em unidades c=1
    }

    /// Pico de luminosidade durante merger
    /// L_peak ~ 10^23 L_☉ para BH binário típico
    pub fn peak_luminosity(mass1: f64, mass2: f64) -> f64 {
        let total_mass = mass1 + mass2;
        let reduced_mass = (mass1 * mass2) / total_mass;

        // Fórmula empírica ajustada
        0.5 * reduced_mass * total_mass.powi(2)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gravitational_wave_creation() {
        let wave = GravitationalWave::new(1e-21, 5e-22, 100.0, 0.0, 1e6);

        assert_eq!(wave.h_plus, 1e-21);
        assert_eq!(wave.h_cross, 5e-22);
        assert_eq!(wave.frequency(), 100.0);
    }

    #[test]
    fn test_wave_strain() {
        let wave = GravitationalWave::new(1e-21, 0.0, 100.0, 0.0, 1e6);

        let strain_0 = wave.strain(0.0);
        assert!((strain_0 - 1e-21).abs() < 1e-25);
    }

    #[test]
    fn test_compact_binary_masses() {
        let binary = CompactBinary::new(30.0, 30.0, 100.0, 1e6, PI / 4.0);

        assert_eq!(binary.total_mass(), 60.0);
        assert_eq!(binary.reduced_mass(), 15.0);

        let chirp_mass = binary.chirp_mass();
        assert!(chirp_mass > 0.0 && chirp_mass < binary.total_mass());
    }

    #[test]
    fn test_orbital_frequency() {
        let binary = CompactBinary::new(30.0, 30.0, 100.0, 1e6, 0.0);

        let f_orb = binary.orbital_frequency();
        let f_gw = binary.gravitational_wave_frequency();

        // Frequência GW é o dobro da orbital
        assert!((f_gw - 2.0 * f_orb).abs() < 1e-10);
    }

    #[test]
    fn test_gravitational_luminosity() {
        let binary = CompactBinary::new(30.0, 30.0, 100.0, 1e6, 0.0);

        let luminosity = binary.gravitational_luminosity();

        // Luminosidade deve ser positiva
        assert!(luminosity > 0.0);

        // Decaimento orbital deve ser negativo
        let decay = binary.orbital_decay_rate();
        assert!(decay < 0.0);
    }

    #[test]
    fn test_time_to_coalescence() {
        let binary = CompactBinary::new(30.0, 30.0, 100.0, 1e6, 0.0);

        let tau = binary.time_to_coalescence();

        // Tempo deve ser positivo
        assert!(tau > 0.0);
    }

    #[test]
    fn test_ligo_detector() {
        let ligo = Detector::ligo();

        assert_eq!(ligo.name, "LIGO");
        assert!(ligo.in_band(100.0));
        assert!(!ligo.in_band(1.0)); // Abaixo da banda
        assert!(!ligo.in_band(10000.0)); // Acima da banda
    }

    #[test]
    fn test_detector_snr() {
        let ligo = Detector::ligo();
        let wave = GravitationalWave::new(1e-21, 5e-22, 100.0, 0.0, 1e6);

        let snr = ligo.signal_to_noise_ratio(&wave, 1.0);

        // SNR deve ser positivo
        assert!(snr > 0.0);
    }

    #[test]
    fn test_wave_generation() {
        let binary = CompactBinary::new(30.0, 30.0, 100.0, 1e6, 0.0);
        let wave = binary.generate_wave();

        assert!(wave.h_plus != 0.0);
        assert!(wave.frequency() > 0.0);
    }

    #[test]
    fn test_chirp_rate() {
        let binary = CompactBinary::new(30.0, 30.0, 100.0, 1e6, 0.0);
        let f = binary.gravitational_wave_frequency();

        let df_dt = binary.chirp_rate(f);

        // Taxa de chirp deve ser positiva (frequência aumenta)
        assert!(df_dt > 0.0);
    }

    #[test]
    fn test_radiated_energy() {
        let energy = WaveformAnalysis::radiated_energy(30.0, 30.0);

        // Energia irradiada ~4% da massa total para massas iguais
        assert!(energy > 0.0 && energy < 60.0);
    }
}

/// LISA Mission Module - NASA/ESA Space-Based Gravitational Wave Observatory
///
/// This module provides specialized tools for the LISA (Laser Interferometer Space Antenna)
/// mission, including supermassive black hole binaries (SMBHs), extreme mass ratio inspirals
/// (EMRIs), and galactic verification binaries.
///
/// # References
/// - LISA Mission Proposal: arXiv:1702.00786
/// - LISA Science Requirements: ESA-L3-EST-SCI-RS-001
/// - NASA LISA Page: https://lisa.nasa.gov/
use std::f64::consts::PI;

use crate::physics::CompactBinary;

/// Speed of light in m/s
const C: f64 = 299792458.0;

/// Gravitational constant in m³/(kg·s²)
const G: f64 = 6.67430e-11;

/// Solar mass in kg
const M_SUN: f64 = 1.98847e30;

/// Parsec in meters
const PC: f64 = 3.0857e16;

/// LISA frequency band: 0.1 mHz to 1 Hz
const LISA_F_MIN: f64 = 1e-4; // Hz
const LISA_F_MAX: f64 = 1.0; // Hz

/// Types of sources detectable by LISA
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum LISASourceType {
    /// Supermassive black hole binary (10⁵ - 10⁷ M☉)
    SMBH,
    /// Extreme mass ratio inspiral (stellar mass around SMBH)
    EMRI,
    /// Galactic binary (white dwarfs, neutron stars)
    GalacticBinary,
    /// Stochastic gravitational wave background
    Background,
}

/// A gravitational wave source optimized for LISA detection
#[derive(Debug, Clone)]
pub struct LISASource {
    /// Type of source
    pub source_type: LISASourceType,
    /// Primary mass (M☉)
    pub mass_1: f64,
    /// Secondary mass (M☉)
    pub mass_2: f64,
    /// Redshift
    pub redshift: f64,
    /// Luminosity distance (meters)
    pub distance: f64,
    /// Orbital separation (meters)
    pub separation: f64,
    /// Eccentricity
    pub eccentricity: f64,
    /// Observation time (years)
    pub observation_time: f64,
}

impl LISASource {
    /// Create a supermassive black hole binary
    ///
    /// # Arguments
    /// * `m1` - Primary mass in solar masses (10⁵ - 10⁷ M☉)
    /// * `m2` - Secondary mass in solar masses
    /// * `z` - Redshift (typical: 0.1 - 20)
    /// * `separation_au` - Separation in AU
    ///
    /// # Example
    /// ```
    /// use arxis_quaternions::physics::lisa::LISASource;
    ///
    /// // SMBH binary at z=1, masses 1e6 and 5e5 solar masses
    /// let smbh = LISASource::smbh(1e6, 5e5, 1.0, 0.1);
    /// ```
    pub fn smbh(m1: f64, m2: f64, z: f64, separation_au: f64) -> Self {
        // Approximate luminosity distance (more accurate: use cosmology module)
        let d_l = z * C / 70e3 * 1e6 * PC; // Mpc to meters, H0=70

        let separation = separation_au * 1.496e11; // AU to meters

        Self {
            source_type: LISASourceType::SMBH,
            mass_1: m1,
            mass_2: m2,
            redshift: z,
            distance: d_l,
            separation,
            eccentricity: 0.0,
            observation_time: 4.0, // LISA mission lifetime
        }
    }

    /// Create an extreme mass ratio inspiral
    ///
    /// # Arguments
    /// * `m_smbh` - Supermassive black hole mass (10⁵ - 10⁷ M☉)
    /// * `m_co` - Compact object mass (1-100 M☉)
    /// * `z` - Redshift
    /// * `semi_major_axis` - Semi-major axis in units of Schwarzschild radius
    ///
    /// # Example
    /// ```
    /// use arxis_quaternions::physics::lisa::LISASource;
    ///
    /// // 10 M☉ object around 1e6 M☉ SMBH
    /// let emri = LISASource::emri(1e6, 10.0, 0.5, 100.0);
    /// ```
    pub fn emri(m_smbh: f64, m_co: f64, z: f64, semi_major_axis_rs: f64) -> Self {
        let d_l = z * C / 70e3 * 1e6 * PC;

        // Schwarzschild radius
        let r_s = 2.0 * G * m_smbh * M_SUN / (C * C);
        let separation = semi_major_axis_rs * r_s;

        Self {
            source_type: LISASourceType::EMRI,
            mass_1: m_smbh,
            mass_2: m_co,
            redshift: z,
            distance: d_l,
            separation,
            eccentricity: 0.0,
            observation_time: 1.0,
        }
    }

    /// Create a galactic verification binary
    ///
    /// # Arguments
    /// * `m1` - Primary mass (0.2-1.4 M☉ for white dwarfs)
    /// * `m2` - Secondary mass
    /// * `period_minutes` - Orbital period in minutes
    ///
    /// # Example
    /// ```
    /// use arxis_quaternions::physics::lisa::LISASource;
    ///
    /// // White dwarf binary with 10 minute period
    /// let galactic = LISASource::galactic_binary(0.6, 0.5, 10.0);
    /// ```
    pub fn galactic_binary(m1: f64, m2: f64, period_minutes: f64) -> Self {
        let period = period_minutes * 60.0; // seconds
        let total_mass = (m1 + m2) * M_SUN;

        // Kepler's third law: a³ = G*M*T²/(4π²)
        let separation = ((G * total_mass * period * period) / (4.0 * PI * PI)).powf(1.0 / 3.0);

        // Galactic distance (assume in Milky Way)
        let distance = 10e3 * PC; // 10 kpc typical

        Self {
            source_type: LISASourceType::GalacticBinary,
            mass_1: m1,
            mass_2: m2,
            redshift: 0.0,
            distance,
            separation,
            eccentricity: 0.0,
            observation_time: 4.0,
        }
    }

    /// Calculate gravitational wave frequency in LISA band
    ///
    /// Returns frequency in Hz, accounting for redshift for cosmological sources
    pub fn gw_frequency(&self) -> f64 {
        let m_total = (self.mass_1 + self.mass_2) * M_SUN;

        // Orbital frequency from Kepler's third law
        let f_orb = (1.0 / (2.0 * PI)) * (G * m_total / (self.separation.powi(3))).sqrt();

        // GW frequency is twice orbital frequency
        let f_gw = 2.0 * f_orb;

        // Redshift to observer frame
        f_gw / (1.0 + self.redshift)
    }

    /// Check if source is in LISA band
    pub fn in_lisa_band(&self) -> bool {
        let f = self.gw_frequency();
        f >= LISA_F_MIN && f <= LISA_F_MAX
    }

    /// Calculate characteristic strain in LISA
    ///
    /// Returns dimensionless strain h_c = 2 * f * h(f)
    pub fn characteristic_strain(&self) -> f64 {
        let m_chirp = self.chirp_mass();
        let f = self.gw_frequency();

        // Characteristic strain for circular binaries
        let h_c = (G * m_chirp * M_SUN / C.powi(2)).powf(5.0 / 3.0) * (PI * f).powf(2.0 / 3.0)
            / self.distance;

        h_c * 2.0
    }

    /// Calculate chirp mass
    ///
    /// M_c = (m1*m2)^(3/5) / (m1+m2)^(1/5)
    pub fn chirp_mass(&self) -> f64 {
        let m1 = self.mass_1;
        let m2 = self.mass_2;

        (m1 * m2).powf(3.0 / 5.0) / (m1 + m2).powf(1.0 / 5.0)
    }

    /// Estimate signal-to-noise ratio (SNR) in LISA
    ///
    /// Simplified calculation using characteristic strain and LISA sensitivity
    pub fn lisa_snr(&self) -> f64 {
        if !self.in_lisa_band() {
            return 0.0;
        }

        let h_c = self.characteristic_strain();
        let f = self.gw_frequency();

        // LISA sensitivity curve (simplified)
        let s_n = self.lisa_noise_strain(f);

        // SNR ≈ h_c / sqrt(S_n) * sqrt(T_obs)
        let t_obs = self.observation_time * 365.25 * 24.0 * 3600.0; // years to seconds

        h_c / s_n.sqrt() * t_obs.sqrt()
    }

    /// LISA noise spectral density (simplified)
    ///
    /// Based on LISA sensitivity curve
    fn lisa_noise_strain(&self, f: f64) -> f64 {
        // Simplified LISA noise model
        // Full model: arXiv:1803.01944

        // Acceleration noise
        let s_a = 9e-30; // m²/s⁴/Hz at 1 mHz

        // Position noise
        let s_x = 2.25e-22; // m²/Hz at 1 mHz

        // Arm length
        let l: f64 = 2.5e9; // meters

        // Combined noise
        let f_hz: f64 = f.max(1e-5); // Avoid division by zero

        let s_acc: f64 = s_a / (2.0 * PI * f_hz).powi(4) / l.powi(2);
        let s_pos: f64 = s_x * (2.0 * PI * f_hz / C).powi(2);

        (s_acc + s_pos) * (1.0 + (2.0e-3 / f_hz).powi(4))
    }

    /// Time until coalescence (inspiral timescale)
    ///
    /// Returns time in years
    pub fn time_to_coalescence(&self) -> f64 {
        let m1 = self.mass_1 * M_SUN;
        let m2 = self.mass_2 * M_SUN;
        let a = self.separation;

        let mu = m1 * m2 / (m1 + m2); // Reduced mass
        let m_total = m1 + m2;

        // Peters formula (quadrupole approximation)
        let t_coal = 5.0 * C.powi(5) * a.powi(4) / (256.0 * G.powi(3) * m_total.powi(2) * mu);

        // Convert to years
        t_coal / (365.25 * 24.0 * 3600.0)
    }

    /// Estimate number of cycles observable by LISA
    pub fn observable_cycles(&self) -> f64 {
        let f = self.gw_frequency();
        let t_obs = self.observation_time * 365.25 * 24.0 * 3600.0; // seconds
        let t_coal = self.time_to_coalescence() * 365.25 * 24.0 * 3600.0;

        // Observable time is minimum of observation time and coalescence time
        let t_observable = t_obs.min(t_coal);

        f * t_observable
    }

    /// Generate simplified waveform for LISA analysis
    ///
    /// Returns a CompactBinary for compatibility with existing physics module
    pub fn to_compact_binary(&self) -> CompactBinary {
        CompactBinary::new(
            self.mass_1,
            self.mass_2,
            self.separation / 1000.0, // meters to km
            self.distance,
            self.eccentricity,
        )
    }

    /// Create summary report of source properties
    pub fn summary(&self) -> String {
        format!(
            "LISA Source: {:?}\n\
             Masses: {:.2e} M☉ + {:.2e} M☉\n\
             Redshift: z = {:.3}\n\
             Distance: {:.1} Mpc\n\
             GW Frequency: {:.4} mHz\n\
             In LISA band: {}\n\
             Chirp Mass: {:.2e} M☉\n\
             Characteristic Strain: {:.2e}\n\
             SNR (LISA): {:.1}\n\
             Time to coalescence: {:.2e} years\n\
             Observable cycles: {:.2e}",
            self.source_type,
            self.mass_1,
            self.mass_2,
            self.redshift,
            self.distance / (1e6 * PC),
            self.gw_frequency() * 1000.0, // Hz to mHz
            if self.in_lisa_band() { "YES" } else { "NO" },
            self.chirp_mass(),
            self.characteristic_strain(),
            self.lisa_snr(),
            self.time_to_coalescence(),
            self.observable_cycles()
        )
    }
}

/// LISA mission parameters and utilities
pub struct LISAMission {
    /// Mission lifetime in years
    pub lifetime: f64,
    /// Arm length in meters
    pub arm_length: f64,
    /// Minimum detectable SNR
    pub snr_threshold: f64,
}

impl LISAMission {
    /// Create standard LISA mission configuration
    pub fn standard() -> Self {
        Self {
            lifetime: 4.0,
            arm_length: 2.5e9,
            snr_threshold: 7.0,
        }
    }

    /// Check if source is detectable by LISA
    pub fn is_detectable(&self, source: &LISASource) -> bool {
        source.in_lisa_band() && source.lisa_snr() >= self.snr_threshold
    }

    /// Estimate detection rate for population of sources
    ///
    /// # Arguments
    /// * `rate_per_year` - Intrinsic merger rate (Gpc⁻³ yr⁻¹)
    /// * `redshift_max` - Maximum redshift to consider
    ///
    /// Returns expected number of detections during mission
    pub fn expected_detections(&self, rate_per_year: f64, redshift_max: f64) -> f64 {
        // Simplified calculation
        // Full calculation requires cosmological volume integration

        // Comoving volume out to z_max (rough approximation)
        let volume_gpc3 = 4.0 * PI / 3.0 * (redshift_max * C / 70e3 / 1e3).powi(3);

        rate_per_year * volume_gpc3 * self.lifetime
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_smbh_creation() {
        let smbh = LISASource::smbh(1e6, 5e5, 1.0, 0.1);

        assert_eq!(smbh.source_type, LISASourceType::SMBH);
        assert_eq!(smbh.mass_1, 1e6);
        assert_eq!(smbh.mass_2, 5e5);
        assert_eq!(smbh.redshift, 1.0);
    }

    #[test]
    fn test_gw_frequency() {
        let smbh = LISASource::smbh(1e6, 5e5, 0.5, 0.05);
        let f = smbh.gw_frequency();

        // Should be in mHz range for SMBHs
        assert!(f > 1e-4 && f < 0.1);
    }

    #[test]
    fn test_lisa_band() {
        let smbh = LISASource::smbh(1e6, 5e5, 1.0, 0.1);
        assert!(smbh.in_lisa_band());

        // Stellar mass binary (too high frequency)
        let stellar = LISASource::galactic_binary(1.0, 1.0, 0.1);
        let f = stellar.gw_frequency();
        // May or may not be in band depending on period
        println!("Stellar binary frequency: {} Hz", f);
    }

    #[test]
    fn test_chirp_mass() {
        let smbh = LISASource::smbh(1e6, 5e5, 1.0, 0.1);
        let m_c = smbh.chirp_mass();

        // Chirp mass should be between individual masses
        assert!(m_c > smbh.mass_2 && m_c < smbh.mass_1);

        // For equal masses, M_c = M * 2^(-1/5)
        let equal_mass = LISASource::smbh(1e6, 1e6, 1.0, 0.1);
        let m_c_equal = equal_mass.chirp_mass();
        let expected = 1e6 * 2.0_f64.powf(-1.0 / 5.0);

        assert!((m_c_equal - expected).abs() / expected < 1e-10);
    }

    #[test]
    fn test_lisa_snr() {
        let smbh = LISASource::smbh(1e6, 5e5, 1.0, 0.05);
        let snr = smbh.lisa_snr();

        // Typical SMBH should have high SNR
        println!("SMBH SNR: {}", snr);
        assert!(snr > 10.0);
    }

    #[test]
    fn test_emri() {
        let emri = LISASource::emri(1e6, 10.0, 0.5, 10.0);

        assert_eq!(emri.source_type, LISASourceType::EMRI);
        assert!(emri.mass_1 > emri.mass_2 * 1000.0); // Extreme mass ratio
    }

    #[test]
    fn test_galactic_binary() {
        let galactic = LISASource::galactic_binary(0.6, 0.5, 10.0);

        assert_eq!(galactic.source_type, LISASourceType::GalacticBinary);
        assert_eq!(galactic.redshift, 0.0);
    }

    #[test]
    fn test_coalescence_time() {
        let smbh = LISASource::smbh(1e6, 5e5, 1.0, 0.05);
        let t_coal = smbh.time_to_coalescence();

        // Should be measurable (years to centuries for close SMBHs)
        println!("Time to coalescence: {} years", t_coal);
        assert!(t_coal > 0.0);
    }

    #[test]
    fn test_observable_cycles() {
        // Use an EMRI which has higher frequency and more observable cycles
        let emri = LISASource::emri(1e6, 10.0, 0.5, 10.0); // 10 Rs separation
        let cycles = emri.observable_cycles();

        // Should observe multiple cycles over mission lifetime
        println!("Observable cycles: {:.2e}", cycles);
        assert!(cycles > 100.0); // EMRIs complete many cycles
    }

    #[test]
    fn test_lisa_mission() {
        let mission = LISAMission::standard();

        assert_eq!(mission.lifetime, 4.0);
        assert_eq!(mission.arm_length, 2.5e9);

        let smbh = LISASource::smbh(1e6, 5e5, 1.0, 0.05);
        assert!(mission.is_detectable(&smbh));
    }

    #[test]
    fn test_detection_rate() {
        let mission = LISAMission::standard();

        // SMBH merger rate: ~10 Gpc⁻³ yr⁻¹
        let detections = mission.expected_detections(10.0, 5.0);

        println!("Expected SMBH detections: {:.1}", detections);
        assert!(detections > 0.0);
    }
}

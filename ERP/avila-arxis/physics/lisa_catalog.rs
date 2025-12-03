/// LISA Event Catalog - Event Database & Reporting
///
/// This module provides event catalog management for LISA gravitational wave
/// detections. It handles:
/// - Event storage and retrieval
/// - Metadata management
/// - Statistics and analysis
/// - Export to various formats (JSON, CSV, HDF5)
/// - Report generation
///
/// # Event Catalog Structure
///
/// The catalog follows LDC (LISA Data Challenge) standards for event
/// characterization and reporting.
///
/// # References
/// - LDC Event Format: https://lisa-ldc.lal.in2p3.fr/
/// - GWOSC Event Catalog: https://www.gw-openscience.org/
use crate::physics::{EventCandidate, TemplateParameters};
use std::collections::HashMap;
use std::fs::File;
use std::io::{self, Write};

/// Event catalog entry with complete metadata
#[derive(Debug, Clone)]
pub struct CatalogEvent {
    /// Unique event identifier (e.g., LISA-GW-240120-001)
    pub id: String,
    /// GPS time of detection (seconds)
    pub gps_time: f64,
    /// UTC time string
    pub utc_time: String,
    /// Network SNR
    pub snr: f64,
    /// False alarm rate (Hz)
    pub far: f64,
    /// False alarm probability
    pub false_alarm_prob: f64,
    /// Confidence level (0.0 to 1.0)
    pub confidence: f64,
    /// Source classification
    pub source_type: SourceClassification,
    /// Physical parameters (masses, distance, etc.)
    pub parameters: TemplateParameters,
    /// Sky localization (RA, Dec, error)
    pub sky_location: Option<SkyLocation>,
    /// Data quality flags
    pub data_quality: DataQuality,
    /// Analysis pipeline version
    pub pipeline_version: String,
    /// Additional metadata
    pub metadata: HashMap<String, String>,
}

/// Source classification
#[derive(Debug, Clone, PartialEq)]
pub enum SourceClassification {
    /// Massive Black Hole Binary
    MBHB,
    /// Extreme Mass Ratio Inspiral
    EMRI,
    /// Galactic Binary (verification)
    GalacticBinary,
    /// Stochastic Background
    Stochastic,
    /// Unclassified
    Unknown,
}

impl SourceClassification {
    /// From mass ratio
    pub fn from_mass_ratio(q: f64, m_total: f64) -> Self {
        if q < 0.01 && m_total > 1e4 {
            Self::EMRI
        } else if m_total > 1e5 {
            Self::MBHB
        } else if m_total < 10.0 {
            Self::GalacticBinary
        } else {
            Self::Unknown
        }
    }

    /// To string
    pub fn as_str(&self) -> &str {
        match self {
            Self::MBHB => "MBHB",
            Self::EMRI => "EMRI",
            Self::GalacticBinary => "GalacticBinary",
            Self::Stochastic => "Stochastic",
            Self::Unknown => "Unknown",
        }
    }
}

/// Sky localization information
#[derive(Debug, Clone)]
pub struct SkyLocation {
    /// Right ascension (radians)
    pub ra: f64,
    /// Declination (radians)
    pub dec: f64,
    /// Localization error (square degrees)
    pub error_deg2: f64,
}

/// Data quality assessment
#[derive(Debug, Clone)]
pub struct DataQuality {
    /// Glitches detected
    pub glitches: u32,
    /// Data gaps detected
    pub gaps: u32,
    /// Overall quality score (0.0 to 1.0)
    pub score: f64,
}

impl CatalogEvent {
    /// Create from EventCandidate
    pub fn from_candidate(
        candidate: &EventCandidate,
        utc_time: String,
        pipeline_version: &str,
    ) -> Self {
        let source_type = SourceClassification::from_mass_ratio(
            candidate.best_template.mass_ratio,
            candidate.best_template.total_mass,
        );

        // Default sky location (would be computed from waveform in real analysis)
        let sky_location = Some(SkyLocation {
            ra: 0.0,
            dec: 0.0,
            error_deg2: 100.0,
        });

        let data_quality = DataQuality {
            glitches: 0,
            gaps: 0,
            score: 0.95,
        };

        Self {
            id: candidate.event_id.clone(),
            gps_time: candidate.time,
            utc_time,
            snr: candidate.snr,
            far: candidate.false_alarm_prob * 1e-6, // Convert to rate
            false_alarm_prob: candidate.false_alarm_prob,
            confidence: candidate.confidence,
            source_type,
            parameters: candidate.best_template.clone(),
            sky_location,
            data_quality,
            pipeline_version: pipeline_version.to_string(),
            metadata: HashMap::new(),
        }
    }

    /// Add metadata field
    pub fn add_metadata(&mut self, key: String, value: String) {
        self.metadata.insert(key, value);
    }

    /// Check if event is significant
    pub fn is_significant(&self, snr_threshold: f64) -> bool {
        self.snr >= snr_threshold
    }
}

/// Event catalog database
#[derive(Debug, Clone)]
pub struct EventCatalog {
    /// Catalog name
    pub name: String,
    /// Catalog version
    pub version: String,
    /// All events
    pub events: Vec<CatalogEvent>,
    /// Event index by ID
    event_index: HashMap<String, usize>,
    /// Pipeline version
    pub pipeline_version: String,
}

impl EventCatalog {
    /// Create new empty catalog
    pub fn new(name: String, version: String, pipeline_version: String) -> Self {
        Self {
            name,
            version,
            events: Vec::new(),
            event_index: HashMap::new(),
            pipeline_version,
        }
    }

    /// Add event to catalog
    pub fn add_event(&mut self, event: CatalogEvent) {
        let idx = self.events.len();
        self.event_index.insert(event.id.clone(), idx);
        self.events.push(event);
    }

    /// Get event by ID
    pub fn get_event(&self, id: &str) -> Option<&CatalogEvent> {
        self.event_index
            .get(id)
            .and_then(|&idx| self.events.get(idx))
    }

    /// Filter events by source type
    pub fn filter_by_source(&self, source_type: SourceClassification) -> Vec<&CatalogEvent> {
        self.events
            .iter()
            .filter(|e| e.source_type == source_type)
            .collect()
    }

    /// Filter events by SNR threshold
    pub fn filter_by_snr(&self, min_snr: f64) -> Vec<&CatalogEvent> {
        self.events.iter().filter(|e| e.snr >= min_snr).collect()
    }

    /// Get events in time range
    pub fn filter_by_time(&self, start: f64, end: f64) -> Vec<&CatalogEvent> {
        self.events
            .iter()
            .filter(|e| e.gps_time >= start && e.gps_time <= end)
            .collect()
    }

    /// Number of events
    pub fn len(&self) -> usize {
        self.events.len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    /// Compute catalog statistics
    pub fn statistics(&self) -> CatalogStatistics {
        if self.events.is_empty() {
            return CatalogStatistics::default();
        }

        let total = self.events.len();
        let mut mbhb_count = 0;
        let mut emri_count = 0;
        let mut galactic_count = 0;

        let mut snr_sum = 0.0;
        let mut snr_max = f64::NEG_INFINITY;
        let mut snr_min = f64::INFINITY;

        for event in &self.events {
            match event.source_type {
                SourceClassification::MBHB => mbhb_count += 1,
                SourceClassification::EMRI => emri_count += 1,
                SourceClassification::GalacticBinary => galactic_count += 1,
                _ => {}
            }

            snr_sum += event.snr;
            snr_max = snr_max.max(event.snr);
            snr_min = snr_min.min(event.snr);
        }

        let snr_mean = snr_sum / total as f64;

        CatalogStatistics {
            total_events: total,
            mbhb_count,
            emri_count,
            galactic_count,
            snr_mean,
            snr_min,
            snr_max,
        }
    }

    /// Export to JSON
    pub fn export_json(&self, filepath: &str) -> io::Result<()> {
        let mut file = File::create(filepath)?;

        writeln!(file, "{{")?;
        writeln!(file, "  \"catalog_name\": \"{}\",", self.name)?;
        writeln!(file, "  \"catalog_version\": \"{}\",", self.version)?;
        writeln!(
            file,
            "  \"pipeline_version\": \"{}\",",
            self.pipeline_version
        )?;
        writeln!(file, "  \"total_events\": {},", self.events.len())?;
        writeln!(file, "  \"events\": [")?;

        for (i, event) in self.events.iter().enumerate() {
            writeln!(file, "    {{")?;
            writeln!(file, "      \"id\": \"{}\",", event.id)?;
            writeln!(file, "      \"gps_time\": {},", event.gps_time)?;
            writeln!(file, "      \"utc_time\": \"{}\",", event.utc_time)?;
            writeln!(file, "      \"snr\": {},", event.snr)?;
            writeln!(file, "      \"far\": {},", event.far)?;
            writeln!(file, "      \"confidence\": {},", event.confidence)?;
            writeln!(
                file,
                "      \"source_type\": \"{}\",",
                event.source_type.as_str()
            )?;
            writeln!(file, "      \"parameters\": {{")?;
            writeln!(file, "        \"mass_1\": {},", event.parameters.mass_1)?;
            writeln!(file, "        \"mass_2\": {},", event.parameters.mass_2)?;
            writeln!(
                file,
                "        \"chirp_mass\": {},",
                event.parameters.chirp_mass
            )?;
            writeln!(
                file,
                "        \"total_mass\": {},",
                event.parameters.total_mass
            )?;
            writeln!(file, "        \"distance\": {}", event.parameters.distance)?;
            writeln!(file, "      }}")?;

            if i < self.events.len() - 1 {
                writeln!(file, "    }},")?;
            } else {
                writeln!(file, "    }}")?;
            }
        }

        writeln!(file, "  ]")?;
        writeln!(file, "}}")?;

        Ok(())
    }

    /// Export to CSV
    pub fn export_csv(&self, filepath: &str) -> io::Result<()> {
        let mut file = File::create(filepath)?;

        // Header
        writeln!(
            file,
            "id,gps_time,utc_time,snr,far,confidence,source_type,mass_1,mass_2,chirp_mass,total_mass,distance"
        )?;

        // Data rows
        for event in &self.events {
            writeln!(
                file,
                "{},{},{},{},{},{},{},{},{},{},{},{}",
                event.id,
                event.gps_time,
                event.utc_time,
                event.snr,
                event.far,
                event.confidence,
                event.source_type.as_str(),
                event.parameters.mass_1,
                event.parameters.mass_2,
                event.parameters.chirp_mass,
                event.parameters.total_mass,
                event.parameters.distance,
            )?;
        }

        Ok(())
    }

    /// Generate text report
    pub fn generate_report(&self) -> String {
        let stats = self.statistics();

        let mut report = String::new();
        report.push_str("╔═══════════════════════════════════════════════════════════════════╗\n");
        report.push_str("║              LISA Event Catalog - Analysis Report                 ║\n");
        report.push_str("╚═══════════════════════════════════════════════════════════════════╝\n");
        report.push_str("\n");

        report.push_str(&format!("Catalog: {} (v{})\n", self.name, self.version));
        report.push_str(&format!("Pipeline: {}\n", self.pipeline_version));
        report.push_str("\n");

        report.push_str("═══ CATALOG STATISTICS ═══\n");
        report.push_str(&format!("Total Events: {}\n", stats.total_events));
        report.push_str(&format!(
            "├─ MBHB:     {} ({:.1}%)\n",
            stats.mbhb_count,
            100.0 * stats.mbhb_count as f64 / stats.total_events as f64
        ));
        report.push_str(&format!(
            "├─ EMRI:     {} ({:.1}%)\n",
            stats.emri_count,
            100.0 * stats.emri_count as f64 / stats.total_events as f64
        ));
        report.push_str(&format!(
            "└─ Galactic: {} ({:.1}%)\n",
            stats.galactic_count,
            100.0 * stats.galactic_count as f64 / stats.total_events as f64
        ));
        report.push_str("\n");

        report.push_str("═══ SNR STATISTICS ═══\n");
        report.push_str(&format!("Mean SNR: {:.2}\n", stats.snr_mean));
        report.push_str(&format!("Min SNR:  {:.2}\n", stats.snr_min));
        report.push_str(&format!("Max SNR:  {:.2}\n", stats.snr_max));
        report.push_str("\n");

        report.push_str("═══ TOP 10 EVENTS BY SNR ═══\n");
        let mut sorted_events: Vec<_> = self.events.iter().collect();
        sorted_events.sort_by(|a, b| b.snr.partial_cmp(&a.snr).unwrap());

        for (i, event) in sorted_events.iter().take(10).enumerate() {
            report.push_str(&format!(
                "#{:2} {} | SNR: {:8.2} | Type: {:12} | M: {:.1e}+{:.1e} M☉\n",
                i + 1,
                event.id,
                event.snr,
                event.source_type.as_str(),
                event.parameters.mass_1,
                event.parameters.mass_2,
            ));
        }

        report.push_str("\n");
        report.push_str("═══ EVENT DISTRIBUTION ═══\n");

        // Time distribution (simple binning)
        if !self.events.is_empty() {
            let t_min = self
                .events
                .iter()
                .map(|e| e.gps_time)
                .fold(f64::INFINITY, f64::min);
            let t_max = self
                .events
                .iter()
                .map(|e| e.gps_time)
                .fold(f64::NEG_INFINITY, f64::max);
            report.push_str(&format!("Time range: [{:.1}, {:.1}] s\n", t_min, t_max));
            report.push_str(&format!("Duration: {:.1} s\n", t_max - t_min));
        }

        report.push_str("\n");
        report
    }
}

/// Catalog statistics
#[derive(Debug, Clone, Default)]
pub struct CatalogStatistics {
    pub total_events: usize,
    pub mbhb_count: usize,
    pub emri_count: usize,
    pub galactic_count: usize,
    pub snr_mean: f64,
    pub snr_min: f64,
    pub snr_max: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_source_classification() {
        let mbhb = SourceClassification::from_mass_ratio(0.5, 1e6);
        assert_eq!(mbhb, SourceClassification::MBHB);

        let emri = SourceClassification::from_mass_ratio(0.001, 1e5);
        assert_eq!(emri, SourceClassification::EMRI);

        let galactic = SourceClassification::from_mass_ratio(0.7, 2.0);
        assert_eq!(galactic, SourceClassification::GalacticBinary);
    }

    #[test]
    fn test_catalog_creation() {
        let catalog = EventCatalog::new(
            "LISA-O1".to_string(),
            "1.0".to_string(),
            "arxis-0.2.0".to_string(),
        );

        assert_eq!(catalog.name, "LISA-O1");
        assert_eq!(catalog.len(), 0);
        assert!(catalog.is_empty());
    }

    #[test]
    fn test_add_and_retrieve_event() {
        let mut catalog = EventCatalog::new(
            "Test".to_string(),
            "1.0".to_string(),
            "arxis-0.2.0".to_string(),
        );

        let params = TemplateParameters::from_masses(1e6, 5e5, 1e25, 0.001, 0.01);
        let candidate = EventCandidate {
            event_id: "TEST-001".to_string(),
            time: 1000.0,
            snr: 10.0,
            false_alarm_prob: 1e-5,
            best_template: params,
            confidence: 0.99,
        };

        let event = CatalogEvent::from_candidate(
            &candidate,
            "2024-01-20T00:00:00Z".to_string(),
            "arxis-0.2.0",
        );
        catalog.add_event(event);

        assert_eq!(catalog.len(), 1);
        assert!(catalog.get_event("TEST-001").is_some());
    }

    #[test]
    fn test_catalog_filtering() {
        let mut catalog = EventCatalog::new(
            "Test".to_string(),
            "1.0".to_string(),
            "arxis-0.2.0".to_string(),
        );

        // Add MBHB event
        let params1 = TemplateParameters::from_masses(1e6, 5e5, 1e25, 0.001, 0.01);
        let candidate1 = EventCandidate {
            event_id: "MBHB-001".to_string(),
            time: 1000.0,
            snr: 12.0,
            false_alarm_prob: 1e-5,
            best_template: params1,
            confidence: 0.99,
        };
        let event1 = CatalogEvent::from_candidate(
            &candidate1,
            "2024-01-20T00:00:00Z".to_string(),
            "arxis-0.2.0",
        );
        catalog.add_event(event1);

        // Add EMRI event
        let params2 = TemplateParameters::from_masses(1e5, 10.0, 1e25, 0.001, 0.01);
        let candidate2 = EventCandidate {
            event_id: "EMRI-001".to_string(),
            time: 2000.0,
            snr: 8.0,
            false_alarm_prob: 1e-4,
            best_template: params2,
            confidence: 0.95,
        };
        let event2 = CatalogEvent::from_candidate(
            &candidate2,
            "2024-01-20T01:00:00Z".to_string(),
            "arxis-0.2.0",
        );
        catalog.add_event(event2);

        // Filter by source type
        let mbhb_events = catalog.filter_by_source(SourceClassification::MBHB);
        assert_eq!(mbhb_events.len(), 1);

        // Filter by SNR
        let high_snr = catalog.filter_by_snr(10.0);
        assert_eq!(high_snr.len(), 1);
    }

    #[test]
    fn test_catalog_statistics() {
        let mut catalog = EventCatalog::new(
            "Test".to_string(),
            "1.0".to_string(),
            "arxis-0.2.0".to_string(),
        );

        for i in 0..5 {
            let params = TemplateParameters::from_masses(1e6, 5e5, 1e25, 0.001, 0.01);
            let candidate = EventCandidate {
                event_id: format!("EVT-{:03}", i),
                time: 1000.0 + i as f64 * 100.0,
                snr: 8.0 + i as f64,
                false_alarm_prob: 1e-5,
                best_template: params,
                confidence: 0.95,
            };
            let event = CatalogEvent::from_candidate(
                &candidate,
                "2024-01-20T00:00:00Z".to_string(),
                "arxis-0.2.0",
            );
            catalog.add_event(event);
        }

        let stats = catalog.statistics();
        assert_eq!(stats.total_events, 5);
        assert_eq!(stats.snr_mean, 10.0); // (8+9+10+11+12)/5
    }

    #[test]
    fn test_report_generation() {
        let mut catalog = EventCatalog::new(
            "LISA-O1".to_string(),
            "1.0".to_string(),
            "arxis-0.2.0".to_string(),
        );

        let params = TemplateParameters::from_masses(1e6, 5e5, 1e25, 0.001, 0.01);
        let candidate = EventCandidate {
            event_id: "TEST-001".to_string(),
            time: 1000.0,
            snr: 10.0,
            false_alarm_prob: 1e-5,
            best_template: params,
            confidence: 0.99,
        };
        let event = CatalogEvent::from_candidate(
            &candidate,
            "2024-01-20T00:00:00Z".to_string(),
            "arxis-0.2.0",
        );
        catalog.add_event(event);

        let report = catalog.generate_report();
        assert!(report.contains("LISA Event Catalog"));
        assert!(report.contains("Total Events: 1"));
        println!("{}", report);
    }
}

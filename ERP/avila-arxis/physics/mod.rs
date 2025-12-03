/// Módulo de Física - Relatividade Geral e Física Teórica
///
/// Este módulo contém implementações de conceitos de física teórica,
/// incluindo relatividade geral, transformações de Lorentz e tensores físicos.
pub mod cosmology;
pub mod einstein;
pub mod geodesic;
pub mod gravitational_lensing;
pub mod gravitational_waves;
pub mod lisa;
pub mod lisa_analysis;
pub mod lisa_binary;
pub mod lisa_catalog;
pub mod lisa_data;
pub mod lisa_inference;
pub mod lisa_processing;
pub mod lisa_telemetry;
pub mod lisa_visualization;
pub mod relativity;

pub use cosmology::{
    CosmicStructure, CosmologicalObservables, CosmologicalParameters, FLRWUniverse,
};
pub use einstein::{BlackHoleProperties, ChristoffelSymbols, EinsteinTensor, MetricTensor};
pub use geodesic::{
    GeodesicIntegrator, GravitationalEffects, OrbitCalculator, OrbitType, ParticleState,
};
pub use gravitational_lensing::{
    GravitationalLens, LensType, LensingStatistics, MicrolensingEvent, WeakLensing,
};
pub use gravitational_waves::{
    CompactBinary, Detector, GravitationalWave, Polarization, WaveformAnalysis,
};
pub use lisa::{LISAMission, LISASource, LISASourceType};
pub use lisa_analysis::{
    EventCandidate, MatchedFilter, MatchedFilterResult, TemplateBank, TemplateParameters,
    WaveformTemplate,
};
pub use lisa_binary::LisaBinaryFile;
pub use lisa_catalog::{
    CatalogEvent, CatalogStatistics, DataQuality, EventCatalog, SkyLocation, SourceClassification,
};
pub use lisa_data::{
    DataValidator, LDCData, LDCMetadata, StrainTimeSeries, SyntheticDataGenerator,
};
pub use lisa_inference::{MCMCSampler, ParameterEstimation, Prior};
pub use lisa_processing::{
    DataProcessor, FrequencySpectrum, GlitchDetector, GlitchEvent, PowerSpectralDensity,
    TDIChannels, WindowFunction,
};
pub use lisa_visualization::{SNRPlot, SkyMap, Spectrogram, TemplateBankPlot, TimeSeriesPlot};
pub use relativity::{LorentzTransform, MinkowskiMetric, RiemannTensor, StressEnergyTensor};

//! Vector search operations

use crate::error::{AvilaError, Result};

/// Vector index configuration
#[derive(Debug, Clone)]
pub struct VectorIndex {
    pub field: String,
    pub dimension: usize,
    pub metric: DistanceMetric,
}

/// Distance metric for vector search
#[derive(Debug, Clone, Copy)]
pub enum DistanceMetric {
    Cosine,
    Euclidean,
    DotProduct,
}

impl DistanceMetric {
    pub fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "cosine" => Ok(Self::Cosine),
            "euclidean" => Ok(Self::Euclidean),
            "dot" | "dotproduct" => Ok(Self::DotProduct),
            _ => Err(AvilaError::Query(format!("Unknown distance metric: {}", s))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_distance_metric() {
        assert!(matches!(
            DistanceMetric::from_str("cosine").unwrap(),
            DistanceMetric::Cosine
        ));
        assert!(matches!(
            DistanceMetric::from_str("euclidean").unwrap(),
            DistanceMetric::Euclidean
        ));
    }
}

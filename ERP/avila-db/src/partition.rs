//! Advanced partitioning with Hierarchical Partition Keys (HPK)
//!
//! AvilaDB supports hierarchical partition keys to overcome the 50 GB single partition limit
//! and enable more flexible query patterns.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Hierarchical Partition Key component
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum PartitionKeyComponent {
    String(String),
    Number(i64),
    Boolean(bool),
}

impl From<&str> for PartitionKeyComponent {
    fn from(s: &str) -> Self {
        Self::String(s.to_string())
    }
}

impl From<i64> for PartitionKeyComponent {
    fn from(n: i64) -> Self {
        Self::Number(n)
    }
}

impl From<bool> for PartitionKeyComponent {
    fn from(b: bool) -> Self {
        Self::Boolean(b)
    }
}

/// Hierarchical Partition Key (HPK)
///
/// Enables partition keys like: [tenantId, userId, sessionId]
/// This allows:
/// - Breaking 50 GB limit per logical partition
/// - Efficient cross-partition queries with prefix matching
/// - Natural data hierarchy modeling
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct HierarchicalPartitionKey {
    components: Vec<PartitionKeyComponent>,
}

impl HierarchicalPartitionKey {
    /// Create a new HPK with components
    pub fn new(components: Vec<PartitionKeyComponent>) -> Self {
        Self { components }
    }

    /// Create HPK from a single component
    pub fn single<T: Into<PartitionKeyComponent>>(value: T) -> Self {
        Self {
            components: vec![value.into()],
        }
    }

    /// Create HPK from two components
    pub fn double<T1, T2>(c1: T1, c2: T2) -> Self
    where
        T1: Into<PartitionKeyComponent>,
        T2: Into<PartitionKeyComponent>,
    {
        Self {
            components: vec![c1.into(), c2.into()],
        }
    }

    /// Create HPK from three components
    pub fn triple<T1, T2, T3>(c1: T1, c2: T2, c3: T3) -> Self
    where
        T1: Into<PartitionKeyComponent>,
        T2: Into<PartitionKeyComponent>,
        T3: Into<PartitionKeyComponent>,
    {
        Self {
            components: vec![c1.into(), c2.into(), c3.into()],
        }
    }

    /// Get the components
    pub fn components(&self) -> &[PartitionKeyComponent] {
        &self.components
    }

    /// Check if this HPK is a prefix of another
    pub fn is_prefix_of(&self, other: &HierarchicalPartitionKey) -> bool {
        if self.components.len() > other.components.len() {
            return false;
        }
        self.components
            .iter()
            .zip(other.components.iter())
            .all(|(a, b)| a == b)
    }

    /// Generate partition hash for routing
    pub fn hash(&self) -> u64 {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        self.components.hash(&mut hasher);
        hasher.finish()
    }

    /// Serialize to string representation
    pub fn to_string(&self) -> String {
        self.components
            .iter()
            .map(|c| match c {
                PartitionKeyComponent::String(s) => format!("\"{}\"", s),
                PartitionKeyComponent::Number(n) => n.to_string(),
                PartitionKeyComponent::Boolean(b) => b.to_string(),
            })
            .collect::<Vec<_>>()
            .join("/")
    }
}

/// Partition key strategy for a collection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PartitionStrategy {
    /// Single partition key (e.g., userId)
    Single { field: String },

    /// Hierarchical partition key (e.g., [tenantId, userId, sessionId])
    Hierarchical { fields: Vec<String> },

    /// Synthetic partition key (auto-generated for even distribution)
    Synthetic { num_partitions: usize },
}

impl PartitionStrategy {
    /// Extract partition key from document
    pub fn extract(&self, doc: &serde_json::Value) -> Result<HierarchicalPartitionKey, String> {
        match self {
            Self::Single { field } => {
                let value = doc
                    .get(field)
                    .ok_or_else(|| format!("Missing partition key field: {}", field))?;

                let component = match value {
                    serde_json::Value::String(s) => PartitionKeyComponent::String(s.clone()),
                    serde_json::Value::Number(n) => {
                        PartitionKeyComponent::Number(n.as_i64().unwrap_or(0))
                    }
                    serde_json::Value::Bool(b) => PartitionKeyComponent::Boolean(*b),
                    _ => {
                        return Err(format!("Invalid partition key type for field: {}", field));
                    }
                };

                Ok(HierarchicalPartitionKey::new(vec![component]))
            }

            Self::Hierarchical { fields } => {
                let mut components = Vec::new();

                for field in fields {
                    let value = doc
                        .get(field)
                        .ok_or_else(|| format!("Missing partition key field: {}", field))?;

                    let component = match value {
                        serde_json::Value::String(s) => PartitionKeyComponent::String(s.clone()),
                        serde_json::Value::Number(n) => {
                            PartitionKeyComponent::Number(n.as_i64().unwrap_or(0))
                        }
                        serde_json::Value::Bool(b) => PartitionKeyComponent::Boolean(*b),
                        _ => {
                            return Err(format!("Invalid partition key type for field: {}", field));
                        }
                    };

                    components.push(component);
                }

                Ok(HierarchicalPartitionKey::new(components))
            }

            Self::Synthetic { num_partitions } => {
                // Generate synthetic partition based on document hash
                let doc_str = serde_json::to_string(doc).unwrap_or_default();
                let hash = {
                    use std::hash::{Hash, Hasher};
                    let mut hasher = std::collections::hash_map::DefaultHasher::new();
                    doc_str.hash(&mut hasher);
                    hasher.finish()
                };

                let partition_id = (hash % *num_partitions as u64) as i64;
                Ok(HierarchicalPartitionKey::single(partition_id))
            }
        }
    }

    /// Validate partition strategy configuration
    pub fn validate(&self) -> Result<(), String> {
        match self {
            Self::Single { field } => {
                if field.is_empty() {
                    return Err("Partition key field cannot be empty".to_string());
                }
                Ok(())
            }
            Self::Hierarchical { fields } => {
                if fields.is_empty() {
                    return Err("Hierarchical partition key must have at least one field".to_string());
                }
                if fields.len() > 5 {
                    return Err("Hierarchical partition key cannot exceed 5 levels".to_string());
                }
                for field in fields {
                    if field.is_empty() {
                        return Err("Partition key field cannot be empty".to_string());
                    }
                }
                Ok(())
            }
            Self::Synthetic { num_partitions } => {
                if *num_partitions == 0 {
                    return Err("Number of synthetic partitions must be greater than 0".to_string());
                }
                if *num_partitions > 10000 {
                    return Err("Number of synthetic partitions cannot exceed 10000".to_string());
                }
                Ok(())
            }
        }
    }
}

/// Partition router for query optimization
pub struct PartitionRouter {
    strategy: PartitionStrategy,
    partition_map: HashMap<u64, Vec<String>>, // Maps partition hash to node addresses
}

impl PartitionRouter {
    /// Create a new partition router
    pub fn new(strategy: PartitionStrategy) -> Self {
        Self {
            strategy,
            partition_map: HashMap::new(),
        }
    }

    /// Route a document to the appropriate partition
    pub fn route(&self, doc: &serde_json::Value) -> Result<u64, String> {
        let partition_key = self.strategy.extract(doc)?;
        Ok(partition_key.hash())
    }

    /// Get target nodes for a partition key
    pub fn get_nodes(&self, partition_hash: u64) -> Option<&Vec<String>> {
        self.partition_map.get(&partition_hash)
    }

    /// Update partition topology
    pub fn update_topology(&mut self, partition_hash: u64, nodes: Vec<String>) {
        self.partition_map.insert(partition_hash, nodes);
    }

    /// Estimate query cost (number of partitions to scan)
    pub fn estimate_query_cost(&self, _query_predicates: &[String]) -> usize {
        // TODO: Analyze query predicates to determine partition pruning
        // For now, return total partitions (worst case)
        self.partition_map.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_single_partition_key() {
        let strategy = PartitionStrategy::Single {
            field: "userId".to_string(),
        };

        let doc = json!({
            "userId": "user123",
            "name": "Test User"
        });

        let pk = strategy.extract(&doc).unwrap();
        assert_eq!(pk.components().len(), 1);
        assert_eq!(
            pk.components()[0],
            PartitionKeyComponent::String("user123".to_string())
        );
    }

    #[test]
    fn test_hierarchical_partition_key() {
        let strategy = PartitionStrategy::Hierarchical {
            fields: vec!["tenantId".to_string(), "userId".to_string()],
        };

        let doc = json!({
            "tenantId": "tenant1",
            "userId": "user123",
            "name": "Test User"
        });

        let pk = strategy.extract(&doc).unwrap();
        assert_eq!(pk.components().len(), 2);
        assert_eq!(
            pk.components()[0],
            PartitionKeyComponent::String("tenant1".to_string())
        );
        assert_eq!(
            pk.components()[1],
            PartitionKeyComponent::String("user123".to_string())
        );
    }

    #[test]
    fn test_synthetic_partition_key() {
        let strategy = PartitionStrategy::Synthetic { num_partitions: 10 };

        let doc = json!({
            "userId": "user123",
            "name": "Test User"
        });

        let pk = strategy.extract(&doc).unwrap();
        assert_eq!(pk.components().len(), 1);

        // Should be consistent
        let pk2 = strategy.extract(&doc).unwrap();
        assert_eq!(pk.hash(), pk2.hash());
    }

    #[test]
    fn test_hpk_prefix() {
        let pk1 = HierarchicalPartitionKey::double("tenant1", "user123");
        let pk2 = HierarchicalPartitionKey::triple("tenant1", "user123", "session1");

        assert!(pk1.is_prefix_of(&pk2));
        assert!(!pk2.is_prefix_of(&pk1));
    }

    #[test]
    fn test_partition_strategy_validation() {
        // Valid single
        let strategy = PartitionStrategy::Single {
            field: "userId".to_string(),
        };
        assert!(strategy.validate().is_ok());

        // Invalid single (empty field)
        let strategy = PartitionStrategy::Single {
            field: "".to_string(),
        };
        assert!(strategy.validate().is_err());

        // Valid hierarchical
        let strategy = PartitionStrategy::Hierarchical {
            fields: vec!["tenantId".to_string(), "userId".to_string()],
        };
        assert!(strategy.validate().is_ok());

        // Invalid hierarchical (too many levels)
        let strategy = PartitionStrategy::Hierarchical {
            fields: vec![
                "a".to_string(),
                "b".to_string(),
                "c".to_string(),
                "d".to_string(),
                "e".to_string(),
                "f".to_string(),
            ],
        };
        assert!(strategy.validate().is_err());
    }
}

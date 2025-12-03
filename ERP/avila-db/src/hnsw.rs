//! HNSW (Hierarchical Navigable Small World) implementation for vector search
//!
//! This module provides an efficient approximate nearest neighbor search algorithm
//! optimized for high-dimensional vector spaces.

use std::collections::{BinaryHeap, HashMap, HashSet};
use std::cmp::Ordering;

/// Distance metric for vector similarity
#[derive(Debug, Clone, Copy)]
pub enum DistanceMetric {
    /// Cosine similarity (1 - cosine distance)
    Cosine,
    /// Euclidean distance (L2)
    Euclidean,
    /// Dot product (inner product)
    DotProduct,
}

/// A node in the HNSW graph
#[derive(Debug, Clone)]
struct HnswNode {
    id: usize,
    vector: Vec<f32>,
    level: usize,
    neighbors: Vec<Vec<usize>>, // Neighbors at each level
}

/// Result from vector search with distance
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub id: usize,
    pub distance: f32,
    pub vector: Vec<f32>,
}

impl PartialEq for SearchResult {
    fn eq(&self, other: &Self) -> bool {
        self.distance == other.distance
    }
}

impl Eq for SearchResult {}

impl PartialOrd for SearchResult {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        // Reverse ordering for min-heap (BinaryHeap is max-heap by default)
        other.distance.partial_cmp(&self.distance)
    }
}

impl Ord for SearchResult {
    fn cmp(&self, other: &Self) -> Ordering {
        self.partial_cmp(other).unwrap_or(Ordering::Equal)
    }
}

/// HNSW index for efficient vector search
pub struct HnswIndex {
    nodes: HashMap<usize, HnswNode>,
    entry_point: Option<usize>,
    dimension: usize,
    m: usize,              // Max connections per layer
    m_max: usize,          // Max connections at layer 0
    ef_construction: usize, // Size of dynamic candidate list during construction
    ml: f64,               // Normalization factor for level generation
    metric: DistanceMetric,
}

impl HnswIndex {
    /// Create a new HNSW index
    pub fn new(dimension: usize, metric: DistanceMetric) -> Self {
        let m = 16; // Default M parameter
        let m_max = m * 2; // Max connections at layer 0
        let ef_construction = 200; // Default efConstruction
        let ml = 1.0 / (m as f64).ln(); // Normalization factor

        Self {
            nodes: HashMap::new(),
            entry_point: None,
            dimension,
            m,
            m_max,
            ef_construction,
            ml,
            metric,
        }
    }

    /// Set M parameter (connections per layer)
    pub fn with_m(mut self, m: usize) -> Self {
        self.m = m;
        self.m_max = m * 2;
        self.ml = 1.0 / (m as f64).ln();
        self
    }

    /// Set efConstruction parameter
    pub fn with_ef_construction(mut self, ef: usize) -> Self {
        self.ef_construction = ef;
        self
    }

    /// Calculate distance between two vectors
    fn distance(&self, a: &[f32], b: &[f32]) -> f32 {
        match self.metric {
            DistanceMetric::Cosine => {
                let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
                let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
                let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
                1.0 - (dot / (norm_a * norm_b))
            }
            DistanceMetric::Euclidean => {
                a.iter()
                    .zip(b.iter())
                    .map(|(x, y)| (x - y) * (x - y))
                    .sum::<f32>()
                    .sqrt()
            }
            DistanceMetric::DotProduct => {
                -a.iter().zip(b.iter()).map(|(x, y)| x * y).sum::<f32>()
            }
        }
    }

    /// Generate random level for new node
    fn random_level(&self) -> usize {
        let mut level = 0;
        let mut rng = rand::random::<f64>();
        while rng < 0.5 && level < 16 {
            level += 1;
            rng = rand::random::<f64>();
        }
        level
    }

    /// Insert a vector into the index
    pub fn insert(&mut self, id: usize, vector: Vec<f32>) -> Result<(), String> {
        if vector.len() != self.dimension {
            return Err(format!(
                "Vector dimension mismatch: expected {}, got {}",
                self.dimension,
                vector.len()
            ));
        }

        let level = self.random_level();
        let neighbors = vec![Vec::new(); level + 1];

        let node = HnswNode {
            id,
            vector: vector.clone(),
            level,
            neighbors,
        };

        // If this is the first node, make it the entry point
        if self.entry_point.is_none() {
            self.nodes.insert(id, node);
            self.entry_point = Some(id);
            return Ok(());
        }

        // Find nearest neighbors at each level
        let entry_id = self.entry_point.unwrap();
        let mut current_nearest = vec![entry_id];

        // Top-down search
        for lc in (level + 1..=self.nodes[&entry_id].level).rev() {
            current_nearest = self.search_layer(&vector, &current_nearest, 1, lc);
        }

        // Insert at each level
        for lc in (0..=level).rev() {
            let candidates = self.search_layer(&vector, &current_nearest, self.ef_construction, lc);

            // Select M nearest neighbors
            let m = if lc == 0 { self.m_max } else { self.m };
            let neighbors_at_level: Vec<usize> = candidates.iter().take(m).cloned().collect();

            // Add bidirectional links
            for &neighbor_id in &neighbors_at_level {
                if let Some(neighbor_node) = self.nodes.get_mut(&neighbor_id) {
                    if neighbor_node.neighbors.len() > lc {
                        neighbor_node.neighbors[lc].push(id);
                    }
                }
            }

            if let Some(node) = self.nodes.get_mut(&id) {
                if node.neighbors.len() > lc {
                    node.neighbors[lc] = neighbors_at_level;
                }
            }

            current_nearest = candidates;
        }

        self.nodes.insert(id, node);

        // Update entry point if new node has higher level
        if level > self.nodes[&entry_id].level {
            self.entry_point = Some(id);
        }

        Ok(())
    }

    /// Search for k nearest neighbors at a specific layer
    fn search_layer(&self, query: &[f32], entry_points: &[usize], num_to_return: usize, layer: usize) -> Vec<usize> {
        let mut visited = HashSet::new();
        let mut candidates = BinaryHeap::new();
        let mut results = BinaryHeap::new();

        // Initialize with entry points
        for &ep in entry_points {
            if let Some(node) = self.nodes.get(&ep) {
                let dist = self.distance(query, &node.vector);
                candidates.push(SearchResult {
                    id: ep,
                    distance: dist,
                    vector: node.vector.clone(),
                });
                results.push(SearchResult {
                    id: ep,
                    distance: dist,
                    vector: node.vector.clone(),
                });
                visited.insert(ep);
            }
        }

        // Greedy search
        while let Some(current) = candidates.pop() {
            if current.distance > results.peek().map(|r| r.distance).unwrap_or(f32::MAX) {
                break;
            }

            // Check neighbors
            if let Some(node) = self.nodes.get(&current.id) {
                if node.neighbors.len() > layer {
                    for &neighbor_id in &node.neighbors[layer] {
                        if visited.contains(&neighbor_id) {
                            continue;
                        }
                        visited.insert(neighbor_id);

                        if let Some(neighbor_node) = self.nodes.get(&neighbor_id) {
                            let dist = self.distance(query, &neighbor_node.vector);

                            if results.len() < num_to_return || dist < results.peek().unwrap().distance {
                                candidates.push(SearchResult {
                                    id: neighbor_id,
                                    distance: dist,
                                    vector: neighbor_node.vector.clone(),
                                });
                                results.push(SearchResult {
                                    id: neighbor_id,
                                    distance: dist,
                                    vector: neighbor_node.vector.clone(),
                                });

                                if results.len() > num_to_return {
                                    results.pop();
                                }
                            }
                        }
                    }
                }
            }
        }

        results.into_sorted_vec().iter().map(|r| r.id).collect()
    }

    /// Search for k nearest neighbors
    pub fn search(&self, query: &[f32], k: usize, ef: Option<usize>) -> Result<Vec<SearchResult>, String> {
        if query.len() != self.dimension {
            return Err(format!(
                "Query dimension mismatch: expected {}, got {}",
                self.dimension,
                query.len()
            ));
        }

        if self.entry_point.is_none() {
            return Ok(Vec::new());
        }

        let ef_search = ef.unwrap_or(k.max(50));
        let entry_id = self.entry_point.unwrap();
        let entry_level = self.nodes[&entry_id].level;

        // Top-down search to layer 0
        let mut current_nearest = vec![entry_id];
        for lc in (1..=entry_level).rev() {
            current_nearest = self.search_layer(query, &current_nearest, 1, lc);
        }

        // Search at layer 0
        let result_ids = self.search_layer(query, &current_nearest, ef_search, 0);

        // Convert to SearchResults
        let mut results = Vec::new();
        for id in result_ids.iter().take(k) {
            if let Some(node) = self.nodes.get(id) {
                let dist = self.distance(query, &node.vector);
                results.push(SearchResult {
                    id: *id,
                    distance: dist,
                    vector: node.vector.clone(),
                });
            }
        }

        // Sort by distance
        results.sort_by(|a, b| a.distance.partial_cmp(&b.distance).unwrap_or(Ordering::Equal));

        Ok(results)
    }

    /// Get the number of vectors in the index
    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    /// Check if the index is empty
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hnsw_insert_and_search() {
        let mut index = HnswIndex::new(3, DistanceMetric::Euclidean);

        // Insert vectors
        index.insert(0, vec![1.0, 0.0, 0.0]).unwrap();
        index.insert(1, vec![0.0, 1.0, 0.0]).unwrap();
        index.insert(2, vec![0.0, 0.0, 1.0]).unwrap();
        index.insert(3, vec![1.0, 1.0, 0.0]).unwrap();

        // Search
        let query = vec![1.0, 0.5, 0.0];
        let results = index.search(&query, 2, None).unwrap();

        assert_eq!(results.len(), 2);
        assert!(results[0].distance < results[1].distance);
    }

    #[test]
    fn test_cosine_distance() {
        let index = HnswIndex::new(3, DistanceMetric::Cosine);

        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        let distance = index.distance(&a, &b);

        assert!(distance < 0.001); // Should be very close to 0
    }
}

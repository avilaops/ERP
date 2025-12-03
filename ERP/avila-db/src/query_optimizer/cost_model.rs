//! AvilaDB Query Optimizer - Cost-Based Optimization Engine
//!
//! Competing with PostgreSQL's optimizer, Oracle CBO, SQL Server's Query Optimizer
//!
//! Core Features:
//! - Cost-based query planning
//! - Statistics-driven optimization
//! - Index selection
//! - Join ordering
//! - Predicate pushdown

use core::cmp::Ordering;

/// Cost model for query operations
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Cost {
    /// CPU cost (operations)
    pub cpu: f64,
    /// I/O cost (page reads)
    pub io: f64,
    /// Network cost (bytes transferred)
    pub network: f64,
    /// Memory cost (bytes allocated)
    pub memory: u64,
}

impl Cost {
    pub const ZERO: Self = Self {
        cpu: 0.0,
        io: 0.0,
        network: 0.0,
        memory: 0,
    };

    #[inline]
    pub const fn new(cpu: f64, io: f64, network: f64, memory: u64) -> Self {
        Self { cpu, io, network, memory }
    }

    /// Total cost with configurable weights
    #[inline]
    pub fn total(&self, weights: &CostWeights) -> f64 {
        self.cpu * weights.cpu_weight
            + self.io * weights.io_weight
            + self.network * weights.network_weight
            + self.memory as f64 * weights.memory_weight
    }

    #[inline]
    pub fn add(self, other: Self) -> Self {
        Self {
            cpu: self.cpu + other.cpu,
            io: self.io + other.io,
            network: self.network + other.network,
            memory: self.memory + other.memory,
        }
    }
}

impl PartialOrd for Cost {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        let default_weights = CostWeights::default();
        self.total(&default_weights).partial_cmp(&other.total(&default_weights))
    }
}

/// Configurable cost weights
#[derive(Debug, Clone, Copy)]
pub struct CostWeights {
    pub cpu_weight: f64,
    pub io_weight: f64,
    pub network_weight: f64,
    pub memory_weight: f64,
}

impl Default for CostWeights {
    fn default() -> Self {
        Self {
            cpu_weight: 0.001,      // CPU is cheap
            io_weight: 1.0,         // I/O is expensive
            network_weight: 0.5,    // Network is moderate
            memory_weight: 0.0001,  // Memory is cheap
        }
    }
}

/// Table statistics for cost estimation
#[derive(Debug, Clone)]
pub struct TableStats {
    /// Number of rows
    pub row_count: u64,
    /// Average row size in bytes
    pub avg_row_size: u32,
    /// Number of pages
    pub page_count: u64,
    /// Columns statistics
    pub columns: Vec<ColumnStats>,
}

impl TableStats {
    #[inline]
    pub fn total_size_bytes(&self) -> u64 {
        self.row_count * self.avg_row_size as u64
    }

    #[inline]
    pub fn find_column(&self, name: &str) -> Option<&ColumnStats> {
        self.columns.iter().find(|c| c.name == name)
    }
}

/// Column statistics for selectivity estimation
#[derive(Debug, Clone)]
pub struct ColumnStats {
    pub name: String,
    /// Number of distinct values
    pub n_distinct: u64,
    /// Number of null values
    pub n_nulls: u64,
    /// Most common values with frequencies
    pub most_common_values: Vec<(String, f64)>,
    /// Histogram for range queries
    pub histogram: Histogram,
}

impl ColumnStats {
    /// Estimate selectivity for equality predicate
    #[inline]
    pub fn selectivity_eq(&self, total_rows: u64) -> f64 {
        if self.n_distinct == 0 {
            return 0.0;
        }
        1.0 / self.n_distinct as f64
    }

    /// Estimate selectivity for range predicate
    #[inline]
    pub fn selectivity_range(&self, low: f64, high: f64) -> f64 {
        self.histogram.selectivity_range(low, high)
    }
}

/// Histogram for numeric columns
#[derive(Debug, Clone)]
pub struct Histogram {
    pub buckets: Vec<HistogramBucket>,
}

impl Histogram {
    pub fn empty() -> Self {
        Self { buckets: Vec::new() }
    }

    /// Estimate selectivity for range [low, high]
    pub fn selectivity_range(&self, low: f64, high: f64) -> f64 {
        if self.buckets.is_empty() {
            return 0.1; // Default guess
        }

        let mut selectivity = 0.0;
        for bucket in &self.buckets {
            if bucket.upper_bound < low {
                continue;
            }
            if bucket.lower_bound > high {
                break;
            }

            // Bucket overlaps with range
            let overlap_start = bucket.lower_bound.max(low);
            let overlap_end = bucket.upper_bound.min(high);
            let overlap_ratio = (overlap_end - overlap_start) / (bucket.upper_bound - bucket.lower_bound);

            selectivity += bucket.frequency * overlap_ratio;
        }

        selectivity.clamp(0.0, 1.0)
    }
}

#[derive(Debug, Clone)]
pub struct HistogramBucket {
    pub lower_bound: f64,
    pub upper_bound: f64,
    pub frequency: f64, // Fraction of rows in this bucket
}

/// Cost estimator for different query operations
pub struct CostEstimator;

impl CostEstimator {
    /// Sequential scan cost
    pub fn seq_scan_cost(stats: &TableStats) -> Cost {
        Cost {
            cpu: stats.row_count as f64 * 0.01,  // Cost per row
            io: stats.page_count as f64,          // Read all pages
            network: 0.0,
            memory: stats.avg_row_size as u64 * 1000, // Buffer some rows
        }
    }

    /// Index scan cost
    pub fn index_scan_cost(
        stats: &TableStats,
        selectivity: f64,
        index_pages: u64,
    ) -> Cost {
        let rows_fetched = (stats.row_count as f64 * selectivity).ceil() as u64;

        Cost {
            cpu: rows_fetched as f64 * 0.02,     // Index lookup is slightly more expensive
            io: index_pages as f64 + rows_fetched as f64 * 0.8, // Index + random page reads
            network: 0.0,
            memory: stats.avg_row_size as u64 * rows_fetched.min(1000),
        }
    }

    /// Nested loop join cost
    pub fn nested_loop_join_cost(
        outer_rows: u64,
        inner_rows: u64,
        inner_cost: Cost,
    ) -> Cost {
        Cost {
            cpu: (outer_rows * inner_rows) as f64 * 0.001,
            io: inner_cost.io * outer_rows as f64,
            network: 0.0,
            memory: inner_cost.memory,
        }
    }

    /// Hash join cost
    pub fn hash_join_cost(
        build_rows: u64,
        probe_rows: u64,
        avg_row_size: u32,
    ) -> Cost {
        let hash_table_size = build_rows * avg_row_size as u64;

        Cost {
            cpu: (build_rows + probe_rows) as f64 * 0.02, // Hash computation + probing
            io: 0.0,  // Assuming in-memory
            network: 0.0,
            memory: hash_table_size,
        }
    }

    /// Merge join cost (requires sorted inputs)
    pub fn merge_join_cost(
        left_rows: u64,
        right_rows: u64,
        sort_cost_left: Cost,
        sort_cost_right: Cost,
    ) -> Cost {
        let scan_cost = Cost {
            cpu: (left_rows + right_rows) as f64 * 0.01,
            io: 0.0,
            network: 0.0,
            memory: 0,
        };

        sort_cost_left.add(sort_cost_right).add(scan_cost)
    }

    /// Sort cost
    pub fn sort_cost(rows: u64, avg_row_size: u32) -> Cost {
        let comparisons = if rows > 0 {
            rows as f64 * (rows as f64).log2()
        } else {
            0.0
        };

        Cost {
            cpu: comparisons * 0.001,
            io: rows as f64 * 0.01, // May spill to disk
            network: 0.0,
            memory: rows * avg_row_size as u64,
        }
    }

    /// Aggregation cost
    pub fn aggregate_cost(rows: u64, groups: u64, avg_row_size: u32) -> Cost {
        Cost {
            cpu: rows as f64 * 0.01, // Hash aggregation
            io: 0.0,
            network: 0.0,
            memory: groups * avg_row_size as u64,
        }
    }
}

/// Index selection helper
#[derive(Debug, Clone)]
pub struct IndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub unique: bool,
    pub pages: u64,
}

impl IndexInfo {
    /// Check if index covers the given columns
    pub fn covers(&self, columns: &[String]) -> bool {
        columns.iter().all(|col| self.columns.contains(col))
    }

    /// Check if index is a prefix match for columns
    pub fn prefix_match(&self, columns: &[String]) -> usize {
        let mut matched = 0;
        for (i, col) in columns.iter().enumerate() {
            if self.columns.get(i) == Some(col) {
                matched += 1;
            } else {
                break;
            }
        }
        matched
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cost_comparison() {
        let cost1 = Cost::new(100.0, 10.0, 0.0, 1024);
        let cost2 = Cost::new(50.0, 20.0, 0.0, 2048);

        // cost2 has higher I/O, should be more expensive with default weights
        assert!(cost2 > cost1);
    }

    #[test]
    fn test_selectivity_eq() {
        let stats = ColumnStats {
            name: "id".to_string(),
            n_distinct: 1000,
            n_nulls: 0,
            most_common_values: vec![],
            histogram: Histogram::empty(),
        };

        let selectivity = stats.selectivity_eq(10000);
        assert!((selectivity - 0.001).abs() < 0.0001);
    }

    #[test]
    fn test_seq_scan_vs_index_scan() {
        let stats = TableStats {
            row_count: 1_000_000,
            avg_row_size: 100,
            page_count: 10_000,
            columns: vec![],
        };

        let seq_cost = CostEstimator::seq_scan_cost(&stats);
        let index_cost = CostEstimator::index_scan_cost(&stats, 0.01, 100);

        // For 1% selectivity, index should be cheaper
        assert!(index_cost < seq_cost);
    }

    #[test]
    fn test_histogram_selectivity() {
        let histogram = Histogram {
            buckets: vec![
                HistogramBucket { lower_bound: 0.0, upper_bound: 100.0, frequency: 0.5 },
                HistogramBucket { lower_bound: 100.0, upper_bound: 200.0, frequency: 0.5 },
            ],
        };

        // Range [50, 150] spans both buckets
        let sel = histogram.selectivity_range(50.0, 150.0);
        assert!(sel > 0.4 && sel < 0.6);
    }
}

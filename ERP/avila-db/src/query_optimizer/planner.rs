//! Query Planner - Generates optimal execution plans
//!
//! Uses dynamic programming and heuristics to explore the plan space

use super::cost_model::{Cost, CostEstimator, TableStats, IndexInfo};
use alloc::vec::Vec;
use alloc::string::String;
use alloc::collections::BTreeMap;

/// Query plan node
#[derive(Debug, Clone)]
pub enum PlanNode {
    SeqScan {
        table: String,
        filter: Option<String>,
        cost: Cost,
        row_estimate: u64,
    },
    IndexScan {
        table: String,
        index: String,
        filter: Option<String>,
        cost: Cost,
        row_estimate: u64,
    },
    NestedLoopJoin {
        left: Box<PlanNode>,
        right: Box<PlanNode>,
        condition: String,
        cost: Cost,
        row_estimate: u64,
    },
    HashJoin {
        left: Box<PlanNode>,
        right: Box<PlanNode>,
        condition: String,
        build_side: BuildSide,
        cost: Cost,
        row_estimate: u64,
    },
    MergeJoin {
        left: Box<PlanNode>,
        right: Box<PlanNode>,
        condition: String,
        cost: Cost,
        row_estimate: u64,
    },
    Sort {
        input: Box<PlanNode>,
        columns: Vec<String>,
        cost: Cost,
        row_estimate: u64,
    },
    Aggregate {
        input: Box<PlanNode>,
        group_by: Vec<String>,
        aggregates: Vec<String>,
        cost: Cost,
        row_estimate: u64,
    },
}

#[derive(Debug, Clone, Copy)]
pub enum BuildSide {
    Left,
    Right,
}

impl PlanNode {
    pub fn cost(&self) -> Cost {
        match self {
            Self::SeqScan { cost, .. } => *cost,
            Self::IndexScan { cost, .. } => *cost,
            Self::NestedLoopJoin { cost, .. } => *cost,
            Self::HashJoin { cost, .. } => *cost,
            Self::MergeJoin { cost, .. } => *cost,
            Self::Sort { cost, .. } => *cost,
            Self::Aggregate { cost, .. } => *cost,
        }
    }

    pub fn row_estimate(&self) -> u64 {
        match self {
            Self::SeqScan { row_estimate, .. } => *row_estimate,
            Self::IndexScan { row_estimate, .. } => *row_estimate,
            Self::NestedLoopJoin { row_estimate, .. } => *row_estimate,
            Self::HashJoin { row_estimate, .. } => *row_estimate,
            Self::MergeJoin { row_estimate, .. } => *row_estimate,
            Self::Sort { row_estimate, .. } => *row_estimate,
            Self::Aggregate { row_estimate, .. } => *row_estimate,
        }
    }
}

/// Query optimizer - finds the best execution plan
pub struct QueryOptimizer {
    pub tables: BTreeMap<String, TableStats>,
    pub indexes: BTreeMap<String, Vec<IndexInfo>>,
}

impl QueryOptimizer {
    pub fn new() -> Self {
        Self {
            tables: BTreeMap::new(),
            indexes: BTreeMap::new(),
        }
    }

    pub fn add_table(&mut self, name: String, stats: TableStats) {
        self.tables.insert(name, stats);
    }

    pub fn add_index(&mut self, table: String, index: IndexInfo) {
        self.indexes.entry(table).or_insert_with(Vec::new).push(index);
    }

    /// Plan a single table scan
    pub fn plan_table_scan(
        &self,
        table: &str,
        filter: Option<String>,
        filter_selectivity: f64,
    ) -> PlanNode {
        let stats = match self.tables.get(table) {
            Some(s) => s,
            None => {
                // Fallback for unknown table
                return PlanNode::SeqScan {
                    table: table.to_string(),
                    filter,
                    cost: Cost::ZERO,
                    row_estimate: 0,
                };
            }
        };

        let seq_scan_cost = CostEstimator::seq_scan_cost(stats);
        let seq_scan_rows = (stats.row_count as f64 * filter_selectivity) as u64;

        let mut best_plan = PlanNode::SeqScan {
            table: table.to_string(),
            filter: filter.clone(),
            cost: seq_scan_cost,
            row_estimate: seq_scan_rows,
        };

        // Consider index scans
        if let Some(indexes) = self.indexes.get(table) {
            for index in indexes {
                let index_cost = CostEstimator::index_scan_cost(
                    stats,
                    filter_selectivity,
                    index.pages,
                );

                if index_cost < best_plan.cost() {
                    best_plan = PlanNode::IndexScan {
                        table: table.to_string(),
                        index: index.name.clone(),
                        filter: filter.clone(),
                        cost: index_cost,
                        row_estimate: seq_scan_rows,
                    };
                }
            }
        }

        best_plan
    }

    /// Plan a join between two tables
    pub fn plan_join(
        &self,
        left: PlanNode,
        right: PlanNode,
        condition: String,
    ) -> PlanNode {
        let left_rows = left.row_estimate();
        let right_rows = right.row_estimate();
        let left_cost = left.cost();
        let right_cost = right.cost();

        // Estimate join output cardinality (simplified)
        let join_rows = (left_rows as f64 * right_rows as f64).sqrt() as u64;

        // Get average row size for cost estimation
        let avg_row_size = 100u32; // Simplified

        // Cost of different join algorithms
        let nested_loop_cost = CostEstimator::nested_loop_join_cost(
            left_rows,
            right_rows,
            right_cost,
        ).add(left_cost);

        let hash_join_cost_left_build = CostEstimator::hash_join_cost(
            left_rows,
            right_rows,
            avg_row_size,
        ).add(left_cost).add(right_cost);

        let hash_join_cost_right_build = CostEstimator::hash_join_cost(
            right_rows,
            left_rows,
            avg_row_size,
        ).add(left_cost).add(right_cost);

        // Choose best join algorithm
        let mut best_cost = nested_loop_cost;
        let mut best_plan = PlanNode::NestedLoopJoin {
            left: Box::new(left.clone()),
            right: Box::new(right.clone()),
            condition: condition.clone(),
            cost: nested_loop_cost,
            row_estimate: join_rows,
        };

        if hash_join_cost_left_build < best_cost {
            best_cost = hash_join_cost_left_build;
            best_plan = PlanNode::HashJoin {
                left: Box::new(left.clone()),
                right: Box::new(right.clone()),
                condition: condition.clone(),
                build_side: BuildSide::Left,
                cost: hash_join_cost_left_build,
                row_estimate: join_rows,
            };
        }

        if hash_join_cost_right_build < best_cost {
            best_plan = PlanNode::HashJoin {
                left: Box::new(left),
                right: Box::new(right),
                condition,
                build_side: BuildSide::Right,
                cost: hash_join_cost_right_build,
                row_estimate: join_rows,
            };
        }

        best_plan
    }

    /// Plan sort operation
    pub fn plan_sort(&self, input: PlanNode, columns: Vec<String>) -> PlanNode {
        let rows = input.row_estimate();
        let avg_row_size = 100u32; // Simplified
        let sort_cost = CostEstimator::sort_cost(rows, avg_row_size);
        let total_cost = input.cost().add(sort_cost);

        PlanNode::Sort {
            input: Box::new(input),
            columns,
            cost: total_cost,
            row_estimate: rows,
        }
    }

    /// Plan aggregation
    pub fn plan_aggregate(
        &self,
        input: PlanNode,
        group_by: Vec<String>,
        aggregates: Vec<String>,
        groups_estimate: u64,
    ) -> PlanNode {
        let rows = input.row_estimate();
        let avg_row_size = 100u32; // Simplified
        let agg_cost = CostEstimator::aggregate_cost(rows, groups_estimate, avg_row_size);
        let total_cost = input.cost().add(agg_cost);

        PlanNode::Aggregate {
            input: Box::new(input),
            group_by,
            aggregates,
            cost: total_cost,
            row_estimate: groups_estimate,
        }
    }

    /// Optimize join order for multiple tables (simplified DP)
    pub fn optimize_join_order(
        &self,
        tables: Vec<&str>,
        joins: Vec<(usize, usize, String)>, // (left_idx, right_idx, condition)
    ) -> Option<PlanNode> {
        if tables.is_empty() {
            return None;
        }

        // Build initial table scans
        let mut best_plans: BTreeMap<u64, PlanNode> = BTreeMap::new();

        for (idx, table) in tables.iter().enumerate() {
            let plan = self.plan_table_scan(table, None, 1.0);
            best_plans.insert(1u64 << idx, plan);
        }

        // Dynamic programming: build plans for increasing subsets
        for subset_size in 2..=tables.len() {
            let subsets = generate_subsets(tables.len(), subset_size);

            for subset in subsets {
                let mut best_cost = Cost::new(f64::MAX, f64::MAX, 0.0, 0);
                let mut best_plan_for_subset = None;

                // Try splitting subset into two parts
                for left_subset in 1..subset {
                    if (left_subset & subset) != left_subset {
                        continue; // Not a subset
                    }

                    let right_subset = subset ^ left_subset;
                    if right_subset == 0 {
                        continue;
                    }

                    // Check if there's a join condition between left and right
                    let join_condition = self.find_join_condition(
                        left_subset,
                        right_subset,
                        &joins,
                    );

                    if join_condition.is_none() {
                        continue; // No join possible
                    }

                    if let (Some(left_plan), Some(right_plan)) = (
                        best_plans.get(&left_subset),
                        best_plans.get(&right_subset),
                    ) {
                        let joined = self.plan_join(
                            left_plan.clone(),
                            right_plan.clone(),
                            join_condition.unwrap(),
                        );

                        if joined.cost() < best_cost {
                            best_cost = joined.cost();
                            best_plan_for_subset = Some(joined);
                        }
                    }
                }

                if let Some(plan) = best_plan_for_subset {
                    best_plans.insert(subset, plan);
                }
            }
        }

        // Return plan for all tables
        let all_tables_mask = (1u64 << tables.len()) - 1;
        best_plans.remove(&all_tables_mask)
    }

    fn find_join_condition(
        &self,
        left: u64,
        right: u64,
        joins: &[(usize, usize, String)],
    ) -> Option<String> {
        for (left_idx, right_idx, condition) in joins {
            let left_bit = 1u64 << left_idx;
            let right_bit = 1u64 << right_idx;

            if (left & left_bit) != 0 && (right & right_bit) != 0 {
                return Some(condition.clone());
            }
        }
        None
    }
}

fn generate_subsets(n: usize, size: usize) -> Vec<u64> {
    let mut subsets = Vec::new();
    generate_subsets_recursive(n, size, 0, 0, &mut subsets);
    subsets
}

fn generate_subsets_recursive(
    n: usize,
    size: usize,
    start: usize,
    current: u64,
    result: &mut Vec<u64>,
) {
    if size == 0 {
        result.push(current);
        return;
    }

    for i in start..n {
        generate_subsets_recursive(n, size - 1, i + 1, current | (1u64 << i), result);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plan_table_scan() {
        let mut optimizer = QueryOptimizer::new();
        optimizer.add_table("users".to_string(), TableStats {
            row_count: 10000,
            avg_row_size: 100,
            page_count: 100,
            columns: vec![],
        });

        let plan = optimizer.plan_table_scan("users", None, 1.0);
        assert!(plan.row_estimate() == 10000);
    }

    #[test]
    fn test_generate_subsets() {
        let subsets = generate_subsets(3, 2);
        assert_eq!(subsets.len(), 3); // C(3,2) = 3
        assert!(subsets.contains(&0b011)); // {0, 1}
        assert!(subsets.contains(&0b101)); // {0, 2}
        assert!(subsets.contains(&0b110)); // {1, 2}
    }
}

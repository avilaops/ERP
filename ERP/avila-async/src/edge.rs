//! Edge Computing - Distributed runtime capabilities
//!
//! Provides edge computing features for distributed async runtime execution

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::collections::HashMap;

/// Edge Computing Manager
#[derive(Clone)]
pub struct EdgeManager {
    nodes: Arc<Mutex<HashMap<String, EdgeNode>>>,
    local_node_id: String,
}

#[derive(Clone, Debug)]
pub struct EdgeNode {
    pub node_id: String,
    pub region: String,
    pub location: String,
    pub last_seen: Instant,
    pub latency_ms: u64,
    pub is_healthy: bool,

    // Capacity
    pub max_threads: usize,
    pub available_threads: usize,
    pub queue_capacity: usize,
    pub current_load: f64,

    // Statistics
    pub tasks_processed: u64,
    pub total_uptime: Duration,
    pub avg_response_time: Duration,
}

#[derive(Debug, Clone)]
pub struct TaskDistribution {
    pub local_tasks: usize,
    pub remote_tasks: Vec<RemoteTask>,
}

#[derive(Debug, Clone)]
pub struct RemoteTask {
    pub node_id: String,
    pub task_count: usize,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum DistributionStrategy {
    /// Process tasks locally only
    LocalOnly,
    /// Distribute based on latency
    LatencyBased,
    /// Distribute based on node load
    LoadBased,
    /// Balance across all nodes
    RoundRobin,
    /// Smart distribution based on multiple factors
    Adaptive,
}

impl EdgeManager {
    pub fn new(node_id: impl Into<String>, region: impl Into<String>) -> Self {
        let local_id = node_id.into();
        let mut nodes = HashMap::new();

        // Register local node
        nodes.insert(local_id.clone(), EdgeNode {
            node_id: local_id.clone(),
            region: region.into(),
            location: "local".to_string(),
            last_seen: Instant::now(),
            latency_ms: 0,
            is_healthy: true,
            max_threads: 8,
            available_threads: 8,
            queue_capacity: 1024,
            current_load: 0.0,
            tasks_processed: 0,
            total_uptime: Duration::ZERO,
            avg_response_time: Duration::ZERO,
        });

        Self {
            nodes: Arc::new(Mutex::new(nodes)),
            local_node_id: local_id,
        }
    }

    /// Register a remote edge node
    pub fn register_node(&self, node: EdgeNode) {
        let mut nodes = self.nodes.lock().unwrap();
        nodes.insert(node.node_id.clone(), node);
    }

    /// Unregister an edge node
    pub fn unregister_node(&self, node_id: &str) {
        let mut nodes = self.nodes.lock().unwrap();
        nodes.remove(node_id);
    }

    /// Update node health status
    pub fn update_node_health(&self, node_id: &str, is_healthy: bool) {
        let mut nodes = self.nodes.lock().unwrap();
        if let Some(node) = nodes.get_mut(node_id) {
            node.is_healthy = is_healthy;
            node.last_seen = Instant::now();
        }
    }

    /// Update node load
    pub fn update_node_load(&self, node_id: &str, load: f64) {
        let mut nodes = self.nodes.lock().unwrap();
        if let Some(node) = nodes.get_mut(node_id) {
            node.current_load = load;
            node.last_seen = Instant::now();
        }
    }

    /// Get all healthy nodes
    pub fn healthy_nodes(&self) -> Vec<EdgeNode> {
        let nodes = self.nodes.lock().unwrap();
        nodes.values()
            .filter(|n| n.is_healthy && n.last_seen.elapsed() < Duration::from_secs(30))
            .cloned()
            .collect()
    }

    /// Find best node for task execution
    pub fn find_best_node(&self, strategy: DistributionStrategy) -> Option<String> {
        let nodes = self.nodes.lock().unwrap();
        let healthy: Vec<_> = nodes.values()
            .filter(|n| n.is_healthy && n.last_seen.elapsed() < Duration::from_secs(30))
            .collect();

        if healthy.is_empty() {
            return None;
        }

        match strategy {
            DistributionStrategy::LocalOnly => {
                Some(self.local_node_id.clone())
            }
            DistributionStrategy::LatencyBased => {
                healthy.iter()
                    .min_by_key(|n| n.latency_ms)
                    .map(|n| n.node_id.clone())
            }
            DistributionStrategy::LoadBased => {
                healthy.iter()
                    .min_by(|a, b| a.current_load.partial_cmp(&b.current_load).unwrap())
                    .map(|n| n.node_id.clone())
            }
            DistributionStrategy::RoundRobin => {
                // Simple round-robin: pick node with least processed tasks
                healthy.iter()
                    .min_by_key(|n| n.tasks_processed)
                    .map(|n| n.node_id.clone())
            }
            DistributionStrategy::Adaptive => {
                // Score based on latency, load, and response time
                healthy.iter()
                    .min_by(|a, b| {
                        let score_a = self.adaptive_score(a);
                        let score_b = self.adaptive_score(b);
                        score_a.partial_cmp(&score_b).unwrap()
                    })
                    .map(|n| n.node_id.clone())
            }
        }
    }

    /// Distribute tasks across nodes
    pub fn distribute_tasks(
        &self,
        task_count: usize,
        strategy: DistributionStrategy,
    ) -> TaskDistribution {
        if strategy == DistributionStrategy::LocalOnly {
            return TaskDistribution {
                local_tasks: task_count,
                remote_tasks: vec![],
            };
        }

        let nodes = self.nodes.lock().unwrap();
        let healthy: Vec<_> = nodes.values()
            .filter(|n| n.is_healthy && n.last_seen.elapsed() < Duration::from_secs(30))
            .collect();

        if healthy.len() <= 1 {
            return TaskDistribution {
                local_tasks: task_count,
                remote_tasks: vec![],
            };
        }

        let mut distribution = TaskDistribution {
            local_tasks: 0,
            remote_tasks: vec![],
        };

        match strategy {
            DistributionStrategy::LoadBased => {
                // Distribute inversely proportional to load
                let total_capacity: f64 = healthy.iter()
                    .map(|n| 1.0 - n.current_load)
                    .sum();

                for node in healthy {
                    let capacity_ratio = (1.0 - node.current_load) / total_capacity;
                    let node_tasks = (task_count as f64 * capacity_ratio).round() as usize;

                    if node.node_id == self.local_node_id {
                        distribution.local_tasks = node_tasks;
                    } else {
                        distribution.remote_tasks.push(RemoteTask {
                            node_id: node.node_id.clone(),
                            task_count: node_tasks,
                            reason: format!("Load-based: {:.1}% load", node.current_load * 100.0),
                        });
                    }
                }
            }
            DistributionStrategy::RoundRobin => {
                // Evenly distribute
                let per_node = task_count / healthy.len();
                let remainder = task_count % healthy.len();

                for (i, node) in healthy.iter().enumerate() {
                    let node_tasks = per_node + if i < remainder { 1 } else { 0 };

                    if node.node_id == self.local_node_id {
                        distribution.local_tasks = node_tasks;
                    } else {
                        distribution.remote_tasks.push(RemoteTask {
                            node_id: node.node_id.clone(),
                            task_count: node_tasks,
                            reason: "Round-robin".to_string(),
                        });
                    }
                }
            }
            _ => {
                // Default: local only
                distribution.local_tasks = task_count;
            }
        }

        distribution
    }

    /// Get node statistics
    pub fn node_stats(&self, node_id: &str) -> Option<EdgeNode> {
        let nodes = self.nodes.lock().unwrap();
        nodes.get(node_id).cloned()
    }

    /// Export edge topology as JSON
    pub fn to_json(&self) -> String {
        let nodes = self.nodes.lock().unwrap();
        let node_list: Vec<String> = nodes.values()
            .map(|n| format!(
                r#"    {{
      "node_id": "{}",
      "region": "{}",
      "healthy": {},
      "latency_ms": {},
      "load": {:.2},
      "available_threads": {}
    }}"#,
                n.node_id,
                n.region,
                n.is_healthy,
                n.latency_ms,
                n.current_load,
                n.available_threads
            ))
            .collect();

        format!(
            r#"{{
  "local_node": "{}",
  "node_count": {},
  "nodes": [
{}
  ]
}}"#,
            self.local_node_id,
            nodes.len(),
            node_list.join(",\n")
        )
    }

    fn adaptive_score(&self, node: &EdgeNode) -> f64 {
        // Lower score is better
        let latency_factor = node.latency_ms as f64 / 100.0;
        let load_factor = node.current_load * 10.0;
        let response_factor = node.avg_response_time.as_millis() as f64 / 10.0;

        latency_factor + load_factor + response_factor
    }
}

impl std::fmt::Display for EdgeNode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "EdgeNode[id={}, region={}, latency={}ms, load={:.1}%, healthy={}]",
            self.node_id,
            self.region,
            self.latency_ms,
            self.current_load * 100.0,
            self.is_healthy
        )
    }
}

impl std::fmt::Display for TaskDistribution {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Distribution[local={}, remote={}]",
            self.local_tasks,
            self.remote_tasks.len()
        )
    }
}

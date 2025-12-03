//! # avila-monitor - System Monitoring
extern crate alloc;
use alloc::collections::BTreeMap;

pub struct Monitor {
    pub metrics: BTreeMap<u64, f64>,
}

impl Monitor {
    pub fn new() -> Self {
        Self { metrics: BTreeMap::new() }
    }
    
    pub fn record(&mut self, metric_id: u64, value: f64) {
        self.metrics.insert(metric_id, value);
    }
    
    pub fn get(&self, metric_id: u64) -> Option<f64> {
        self.metrics.get(&metric_id).copied()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_monitor() {
        let mut mon = Monitor::new();
        mon.record(1, 99.5);
        assert_eq!(mon.get(1), Some(99.5));
    }
}

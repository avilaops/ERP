//! # avila-alert - Alert Management
extern crate alloc;
use alloc::vec::Vec;
use alloc::string::String;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Severity { Info, Warning, Error, Critical }

#[derive(Clone, Debug)]
pub struct Alert {
    pub id: u64,
    pub severity: Severity,
    pub message: String,
}

pub struct AlertManager {
    pub alerts: Vec<Alert>,
}

impl AlertManager {
    pub fn new() -> Self {
        Self { alerts: Vec::new() }
    }
    
    pub fn trigger(&mut self, id: u64, severity: Severity, message: String) {
        self.alerts.push(Alert { id, severity, message });
    }
    
    pub fn count_by_severity(&self, sev: Severity) -> usize {
        self.alerts.iter().filter(|a| a.severity == sev).count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_alert() {
        let mut am = AlertManager::new();
        am.trigger(1, Severity::Error, "Error occurred".into());
        assert_eq!(am.count_by_severity(Severity::Error), 1);
    }
}

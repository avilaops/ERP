//! Cell lifecycle management

use crate::{Error, ErrorKind, Result};

#[cfg(not(feature = "std"))]
use alloc::string::String;

#[cfg(feature = "std")]
use std::string::String;

/// Cell lifecycle stages
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LifecycleStage {
    /// Before initialization
    Created,
    /// Initialization phase
    Initializing,
    /// Active and running
    Active,
    /// Graceful shutdown
    Stopping,
    /// Fully stopped
    Stopped,
}

impl LifecycleStage {
    /// Get stage name
    pub fn name(&self) -> &'static str {
        match self {
            LifecycleStage::Created => "created",
            LifecycleStage::Initializing => "initializing",
            LifecycleStage::Active => "active",
            LifecycleStage::Stopping => "stopping",
            LifecycleStage::Stopped => "stopped",
        }
    }
}

/// Lifecycle management
#[derive(Debug, Clone)]
pub struct Lifecycle {
    /// Current stage
    pub stage: LifecycleStage,
}

impl Lifecycle {
    /// Create new lifecycle
    pub fn new() -> Self {
        Self {
            stage: LifecycleStage::Created,
        }
    }

    /// Initialize
    pub fn initialize(&mut self) -> Result<()> {
        if self.stage != LifecycleStage::Created {
            return Err(Error::new(
                ErrorKind::InvalidState,
                "Can only initialize from Created state",
            ));
        }
        self.stage = LifecycleStage::Initializing;
        Ok(())
    }

    /// Activate
    pub fn activate(&mut self) -> Result<()> {
        if self.stage != LifecycleStage::Initializing {
            return Err(Error::new(
                ErrorKind::InvalidState,
                "Can only activate from Initializing state",
            ));
        }
        self.stage = LifecycleStage::Active;
        Ok(())
    }

    /// Stop
    pub fn stop(&mut self) -> Result<()> {
        match self.stage {
            LifecycleStage::Stopped => Ok(()),
            LifecycleStage::Stopping => Ok(()),
            _ => {
                self.stage = LifecycleStage::Stopping;
                Ok(())
            }
        }
    }

    /// Complete stop
    pub fn complete_stop(&mut self) -> Result<()> {
        if self.stage != LifecycleStage::Stopping {
            return Err(Error::new(
                ErrorKind::InvalidState,
                "Must be in Stopping state to complete stop",
            ));
        }
        self.stage = LifecycleStage::Stopped;
        Ok(())
    }

    /// Check if active
    pub fn is_active(&self) -> bool {
        self.stage == LifecycleStage::Active
    }
}

impl Default for Lifecycle {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lifecycle() {
        let mut lc = Lifecycle::new();
        assert_eq!(lc.stage, LifecycleStage::Created);

        lc.initialize().unwrap();
        assert_eq!(lc.stage, LifecycleStage::Initializing);

        lc.activate().unwrap();
        assert_eq!(lc.stage, LifecycleStage::Active);
        assert!(lc.is_active());

        lc.stop().unwrap();
        assert_eq!(lc.stage, LifecycleStage::Stopping);

        lc.complete_stop().unwrap();
        assert_eq!(lc.stage, LifecycleStage::Stopped);
    }
}

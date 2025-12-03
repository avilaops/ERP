//! State management for cells

use crate::{Error, ErrorKind, Result};

#[cfg(not(feature = "std"))]
use alloc::{string::String, format};

#[cfg(feature = "std")]
use std::string::String;

/// Trait for cell state
pub trait StateTrait {
    /// Validate state
    fn is_valid(&self) -> bool;

    /// Transition to new state
    fn transition(&mut self, new_state: &str) -> Result<()>;

    /// Get current state name
    fn current_state(&self) -> &str;
}

/// Basic state enum
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum State {
    /// Cell is initializing
    Initializing,
    /// Cell is ready to process
    Ready,
    /// Cell is actively processing
    Processing,
    /// Cell is paused
    Paused,
    /// Cell is shutting down
    ShuttingDown,
    /// Cell is terminated
    Terminated,
}

impl State {
    /// Check if transition is valid
    pub fn can_transition_to(&self, next: State) -> bool {
        use State::*;
        matches!(
            (self, next),
            (Initializing, Ready)
                | (Ready, Processing)
                | (Processing, Ready)
                | (Processing, Paused)
                | (Paused, Processing)
                | (Ready, ShuttingDown)
                | (Paused, ShuttingDown)
                | (Processing, ShuttingDown)
                | (ShuttingDown, Terminated)
        )
    }

    /// Get state name
    pub fn name(&self) -> &'static str {
        match self {
            State::Initializing => "initializing",
            State::Ready => "ready",
            State::Processing => "processing",
            State::Paused => "paused",
            State::ShuttingDown => "shutting_down",
            State::Terminated => "terminated",
        }
    }
}

impl StateTrait for State {
    fn is_valid(&self) -> bool {
        true
    }

    fn transition(&mut self, new_state: &str) -> Result<()> {
        let next = match new_state {
            "initializing" => State::Initializing,
            "ready" => State::Ready,
            "processing" => State::Processing,
            "paused" => State::Paused,
            "shutting_down" => State::ShuttingDown,
            "terminated" => State::Terminated,
            _ => {
                return Err(Error::new(
                    ErrorKind::InvalidInput,
                    format!("Unknown state: {}", new_state),
                ))
            }
        };

        if !self.can_transition_to(next) {
            return Err(Error::new(
                ErrorKind::InvalidState,
                format!("Cannot transition from {} to {}", self.name(), new_state),
            ));
        }

        *self = next;
        Ok(())
    }

    fn current_state(&self) -> &str {
        self.name()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_state_transitions() {
        let mut state = State::Initializing;
        assert!(state.transition("ready").is_ok());
        assert_eq!(state, State::Ready);

        assert!(state.transition("processing").is_ok());
        assert_eq!(state, State::Processing);

        // Invalid transition
        assert!(state.transition("initializing").is_err());
    }
}

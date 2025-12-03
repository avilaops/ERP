//! Cell trait and basic implementation

use crate::{Error, ErrorKind, Result, Id};

#[cfg(not(feature = "std"))]
use alloc::{string::String, vec::Vec, boxed::Box};

#[cfg(feature = "std")]
use std::{string::String, vec::Vec, boxed::Box};

/// Trait for cell-like entities
pub trait CellTrait {
    /// Get cell unique identifier
    fn id(&self) -> Id;

    /// Get cell type
    fn cell_type(&self) -> &str;

    /// Process incoming message
    fn process(&mut self, message: Box<dyn crate::message::MessageTrait>) -> Result<()>;

    /// Check if cell is alive
    fn is_alive(&self) -> bool;

    /// Shutdown cell gracefully
    fn shutdown(&mut self) -> Result<()>;
}

/// Basic cell structure
#[derive(Debug, Clone)]
pub struct Cell {
    /// Unique identifier
    pub id: Id,
    /// Cell type descriptor
    pub cell_type: String,
    /// Whether cell is alive
    pub alive: bool,
}

impl Cell {
    /// Create new cell
    pub fn new(cell_type: impl Into<String>) -> Self {
        Self {
            id: Id::new(),
            cell_type: cell_type.into(),
            alive: true,
        }
    }

    /// Create cell with specific ID
    pub fn with_id(id: Id, cell_type: impl Into<String>) -> Self {
        Self {
            id,
            cell_type: cell_type.into(),
            alive: true,
        }
    }
}

impl CellTrait for Cell {
    fn id(&self) -> Id {
        self.id
    }

    fn cell_type(&self) -> &str {
        &self.cell_type
    }

    fn process(&mut self, _message: Box<dyn crate::message::MessageTrait>) -> Result<()> {
        if !self.alive {
            return Err(Error::new(
                ErrorKind::InvalidState,
                "Cannot process message on dead cell"
            ));
        }
        // Base implementation does nothing
        Ok(())
    }

    fn is_alive(&self) -> bool {
        self.alive
    }

    fn shutdown(&mut self) -> Result<()> {
        self.alive = false;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cell_creation() {
        let cell = Cell::new("test-cell");
        assert!(cell.is_alive());
        assert_eq!(cell.cell_type(), "test-cell");
    }

    #[test]
    fn test_cell_shutdown() {
        let mut cell = Cell::new("test-cell");
        assert!(cell.shutdown().is_ok());
        assert!(!cell.is_alive());
    }
}

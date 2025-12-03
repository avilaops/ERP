//! Variable type for automatic differentiation

use std::cell::RefCell;
use std::rc::Rc;

/// A variable in the computational graph
#[derive(Debug, Clone)]
pub struct Variable {
    pub(crate) id: usize,
    pub(crate) value: Rc<RefCell<f64>>,
}

impl Variable {
    pub(crate) fn new(id: usize, value: f64) -> Self {
        Self {
            id,
            value: Rc::new(RefCell::new(value)),
        }
    }

    /// Get the current value
    pub fn value(&self) -> f64 {
        *self.value.borrow()
    }

    /// Get the variable ID
    pub fn id(&self) -> usize {
        self.id
    }

    /// Set the value (for tape operations)
    #[allow(dead_code)]
    pub(crate) fn set_value(&self, val: f64) {
        *self.value.borrow_mut() = val;
    }
}

impl PartialEq for Variable {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl Eq for Variable {}

impl std::hash::Hash for Variable {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.id.hash(state);
    }
}

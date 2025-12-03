//! Python bindings for Autograd

#![cfg(feature = "python")]

use crate::autograd::{Tape, Variable};
use pyo3::prelude::*;
use std::cell::RefCell;
use std::rc::Rc;

/// Python wrapper for Tape
#[pyclass(name = "Tape")]
pub struct PyTape {
    inner: Rc<RefCell<Tape>>,
}

#[pymethods]
impl PyTape {
    /// Create a new tape
    #[new]
    fn new() -> Self {
        Self {
            inner: Rc::new(RefCell::new(Tape::new())),
        }
    }

    /// Create a variable
    fn var(&mut self, value: f64) -> PyVariable {
        let var = self.inner.borrow_mut().var(value);
        PyVariable {
            inner: var,
            tape: self.inner.clone(),
        }
    }

    /// Get gradient
    fn grad(&self, var: &PyVariable) -> f64 {
        self.inner.borrow().grad(&var.inner)
    }

    /// Clear gradients
    fn zero_grad(&mut self) {
        self.inner.borrow_mut().zero_grad();
    }

    /// Backward pass
    fn backward(&mut self, output: &PyVariable) {
        self.inner.borrow_mut().backward(&output.inner);
    }
}

/// Python wrapper for Variable
#[pyclass(name = "Variable")]
pub struct PyVariable {
    inner: Variable,
    tape: Rc<RefCell<Tape>>,
}

#[pymethods]
impl PyVariable {
    /// Get value
    fn value(&self) -> f64 {
        self.inner.value()
    }

    /// Add
    fn add(&self, other: &PyVariable) -> PyVariable {
        let result = self
            .inner
            .add(&other.inner)
            .eval(&mut self.tape.borrow_mut());
        PyVariable {
            inner: result,
            tape: self.tape.clone(),
        }
    }

    /// Subtract
    fn sub(&self, other: &PyVariable) -> PyVariable {
        let result = self
            .inner
            .sub(&other.inner)
            .eval(&mut self.tape.borrow_mut());
        PyVariable {
            inner: result,
            tape: self.tape.clone(),
        }
    }

    /// Multiply
    fn mul(&self, other: &PyVariable) -> PyVariable {
        let result = self
            .inner
            .mul(&other.inner)
            .eval(&mut self.tape.borrow_mut());
        PyVariable {
            inner: result,
            tape: self.tape.clone(),
        }
    }

    /// Divide
    fn div(&self, other: &PyVariable) -> PyVariable {
        let result = self
            .inner
            .div(&other.inner)
            .eval(&mut self.tape.borrow_mut());
        PyVariable {
            inner: result,
            tape: self.tape.clone(),
        }
    }

    /// Power
    fn pow(&self, exponent: f64) -> PyVariable {
        let result = self.inner.pow(exponent).eval(&mut self.tape.borrow_mut());
        PyVariable {
            inner: result,
            tape: self.tape.clone(),
        }
    }

    /// Exponential
    fn exp(&self) -> PyVariable {
        let result = self.inner.exp().eval(&mut self.tape.borrow_mut());
        PyVariable {
            inner: result,
            tape: self.tape.clone(),
        }
    }

    /// Natural log
    fn log(&self) -> PyVariable {
        let result = self.inner.log().eval(&mut self.tape.borrow_mut());
        PyVariable {
            inner: result,
            tape: self.tape.clone(),
        }
    }

    /// Sine
    fn sin(&self) -> PyVariable {
        let result = self.inner.sin().eval(&mut self.tape.borrow_mut());
        PyVariable {
            inner: result,
            tape: self.tape.clone(),
        }
    }

    /// Cosine
    fn cos(&self) -> PyVariable {
        let result = self.inner.cos().eval(&mut self.tape.borrow_mut());
        PyVariable {
            inner: result,
            tape: self.tape.clone(),
        }
    }

    /// Tanh
    fn tanh(&self) -> PyVariable {
        let result = self.inner.tanh().eval(&mut self.tape.borrow_mut());
        PyVariable {
            inner: result,
            tape: self.tape.clone(),
        }
    }

    /// ReLU
    fn relu(&self) -> PyVariable {
        let result = self.inner.relu().eval(&mut self.tape.borrow_mut());
        PyVariable {
            inner: result,
            tape: self.tape.clone(),
        }
    }

    /// Sigmoid
    fn sigmoid(&self) -> PyVariable {
        let result = self.inner.sigmoid().eval(&mut self.tape.borrow_mut());
        PyVariable {
            inner: result,
            tape: self.tape.clone(),
        }
    }

    /// String representation
    fn __repr__(&self) -> String {
        format!("Variable(value={:.4})", self.inner.value())
    }

    /// Add operator
    fn __add__(&self, other: &PyVariable) -> PyVariable {
        self.add(other)
    }

    /// Subtract operator
    fn __sub__(&self, other: &PyVariable) -> PyVariable {
        self.sub(other)
    }

    /// Multiply operator
    fn __mul__(&self, other: &PyVariable) -> PyVariable {
        self.mul(other)
    }

    /// Divide operator
    fn __truediv__(&self, other: &PyVariable) -> PyVariable {
        self.div(other)
    }

    /// Power operator
    fn __pow__(&self, exponent: f64, _modulo: Option<f64>) -> PyVariable {
        self.pow(exponent)
    }
}

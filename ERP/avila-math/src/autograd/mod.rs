//! Automatic Differentiation System
//!
//! Tape-based reverse-mode automatic differentiation (backpropagation).
//!
//! # Example
//! ```
//! use avila_math::autograd::{Tape, ops};
//!
//! let mut tape = Tape::new();
//! let x = tape.var(2.0);
//! let y = tape.var(3.0);
//! let xy = ops::mul(&mut tape, &x, &y);  // x * y
//! let z = ops::add(&mut tape, &xy, &x);  // z = x*y + x = 2*3 + 2 = 8
//!
//! tape.backward(&z);
//! assert!((tape.grad(&x) - 4.0).abs() < 1e-6);  // dz/dx = y + 1 = 4
//! assert!((tape.grad(&y) - 2.0).abs() < 1e-6);  // dz/dy = x = 2
//! ```

pub mod ops;
pub mod tape;
pub mod variable;

pub use tape::Tape;
pub use variable::Variable;

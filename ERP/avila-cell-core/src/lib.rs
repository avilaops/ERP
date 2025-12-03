//! # Avila Cell Core
//!
//! Core types and traits for the avila-cell ecosystem.
//!
//! This crate provides fundamental abstractions for:
//! - Cell identity and lifecycle
//! - Message passing between cells
//! - State management
//! - Composition patterns

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]
#![warn(clippy::all)]

#[cfg(not(feature = "std"))]
extern crate alloc;

#[cfg(not(feature = "std"))]
use alloc::{string::String, vec::Vec};

pub mod cell;
pub mod message;
pub mod state;
pub mod lifecycle;

pub use avila_error::{Error, ErrorKind, Result};
pub use avila_id::Id;

pub mod prelude {
    //! Common imports for convenience
    pub use crate::cell::{Cell, CellTrait};
    pub use crate::message::{Message, MessageTrait};
    pub use crate::state::{State, StateTrait};
    pub use crate::lifecycle::{Lifecycle, LifecycleStage};
    pub use crate::{Error, ErrorKind, Result, Id};
}

//! # avila-framework
//! Frontend framework 100% Rust with mathematical foundations
//!
//! Leverages avila-math, avila-linalg, and avila-numeric for
//! precise rendering, layout calculations, and transformations.

extern crate alloc;

use alloc::string::{String, ToString};
use alloc::vec::Vec;
use alloc::boxed::Box;
use alloc::format;

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
use web_sys::{Document, Element, Window};

pub mod component;
pub mod dom;
pub mod reactive;
pub mod canvas;
pub mod layout;
pub mod animation;
pub mod events;
pub mod style;
pub mod router;
pub mod vdom;
pub mod store;

/// Initialize the framework
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(start)]
pub fn init() {
    web_sys::console::log_1(&" Ãvila Framework initialized".into());
}

/// Framework version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_exists() {
        assert!(!VERSION.is_empty());
    }
}

//! Scoped thread spawning - wrapper around std::thread::scope

/// A scope for spawning threads (re-export of std::thread::Scope)
pub type Scope<'scope, 'env> = std::thread::Scope<'scope, 'env>;

/// A handle to a scoped thread (re-export of std::thread::ScopedJoinHandle)
pub type ScopedJoinHandle<'scope, T> = std::thread::ScopedJoinHandle<'scope, T>;

// Re-export std::thread::scope directly
pub use std::thread::scope;

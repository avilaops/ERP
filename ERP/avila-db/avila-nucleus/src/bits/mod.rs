//! Operações fundamentais em nível de bit.
//! Nenhuma dependência externa, apenas matemática pura sobre `u64`.

pub mod u64_ops;
pub mod u128_ops;
pub mod bitwise;

pub use bitwise::*;
pub use u128_ops::*;
pub use u64_ops::*;

//! # Ávila Math
//!
//! Operações matemáticas avançadas para criptografia.
//!
//! ## Módulos
//! - `modular`: Aritmética modular (add_mod, sub_mod, mul_mod)
//! - `montgomery`: Montgomery reduction para exponenciação rápida
//! - `barrett`: Barrett reduction alternativa
//! - `karatsuba`: Multiplicação O(n^1.585)
//! - `inverse`: Inversão modular (Extended Euclidean Algorithm)

#![no_std]
#![deny(unsafe_op_in_unsafe_fn)]
#![warn(missing_docs)]

pub mod modular;
pub mod montgomery;
pub mod inverse;

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}

//! Tipos de hash de tamanho fixo.

mod h1024;
mod hgeo;

pub use h1024::H1024;
pub use hgeo::HGeo;

/// Trait para tipos de hash customizados
pub trait HashCore: Sized + Copy + Clone {
    /// Número de bits do hash
    const BITS: usize;

    /// Número de bytes
    const BYTES: usize;

    /// Hash zero
    const ZERO: Self;

    /// Cria a partir de bytes
    fn from_bytes(bytes: &[u8]) -> Option<Self>;

    /// Retorna como slice de bytes
    fn as_bytes(&self) -> &[u8];

    /// Retorna como array de bytes
    fn to_bytes(&self) -> Vec<u8>;
}

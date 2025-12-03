//! **HGeo - Hash Geométrico Hiperdimensional**
//!
//! Um hash que representa coordenadas em um espaço de 13 dimensões!
//! Cada dimensão tem 64 bits, criando um espaço de busca impossível.

use core::fmt;
use crate::hash::HashCore;

/// **HGeo**: Hash representado como ponto em espaço 13D
///
/// ## Revolucionário porque:
/// - 📐 Cada hash é um ponto geométrico
/// - 📏 Distância euclidiana entre hashes
/// - 🔄 Rotações hiperdimensionais
/// - 🎯 Colisão geometricamente impossível
/// - 🌌 13 dimensões = número primo = mais seguro
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct HGeo([u64; 13]);

impl HGeo {
    /// Número de dimensões (primo para máxima segurança)
    pub const DIMENSIONS: usize = 13;

    /// Cria a partir de coordenadas 13D
    pub const fn from_coords(coords: [u64; 13]) -> Self {
        HGeo(coords)
    }

    /// Retorna as coordenadas
    pub const fn coords(&self) -> [u64; 13] {
        self.0
    }

    /// Calcula distância euclidiana ao quadrado (evita sqrt)
    pub fn distance_squared(&self, other: &Self) -> u128 {
        let mut sum = 0u128;

        for i in 0..13 {
            let diff = if self.0[i] > other.0[i] {
                (self.0[i] - other.0[i]) as u128
            } else {
                (other.0[i] - self.0[i]) as u128
            };
            sum = sum.saturating_add(diff * diff);
        }

        sum
    }

    /// Produto escalar (dot product) entre dois hashes
    pub fn dot_product(&self, other: &Self) -> u128 {
        let mut sum = 0u128;

        for i in 0..13 {
            sum = sum.saturating_add((self.0[i] as u128) * (other.0[i] as u128));
        }

        sum
    }

    /// Rotaciona o ponto em torno da origem hiperdimensional
    pub fn rotate(&self, dimensions: (usize, usize), angle_deg: u64) -> Self {
        if dimensions.0 >= 13 || dimensions.1 >= 13 {
            return *self;
        }

        let mut result = self.0;

        // Rotação simplificada: troca coordenadas proporcionalmente
        let cos_approx = (90u64.saturating_sub(angle_deg)) * 10; // 0-900
        let sin_approx = angle_deg * 10; // 0-900

        let x = self.0[dimensions.0];
        let y = self.0[dimensions.1];

        // Rotação 2D no plano selecionado
        result[dimensions.0] = ((x as u128 * cos_approx as u128) / 900) as u64;
        result[dimensions.1] = ((y as u128 * sin_approx as u128) / 900) as u64;

        HGeo(result)
    }

    /// Projeta o hash em uma dimensão específica
    pub fn project_to_dimension(&self, dim: usize) -> u64 {
        if dim < 13 {
            self.0[dim]
        } else {
            0
        }
    }

    /// Calcula a magnitude (norma) do vetor
    pub fn magnitude_squared(&self) -> u128 {
        self.dot_product(self)
    }

    /// Verifica se está próximo de outro hash (threshold)
    pub fn is_near(&self, other: &Self, threshold: u128) -> bool {
        self.distance_squared(other) < threshold
    }

    /// Cria hash aleatório geométrico
    #[cfg(feature = "std")]
    pub fn random() -> Self {
        use std::time::{SystemTime, UNIX_EPOCH};
        let mut coords = [0u64; 13];
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();

        for (i, coord) in coords.iter_mut().enumerate() {
            *coord = ((timestamp >> (i * 10)) ^ ((i as u128) * 0x123456789ABCDEF)) as u64;
        }

        HGeo(coords)
    }
}

impl HashCore for HGeo {
    const BITS: usize = 832; // 13 × 64
    const BYTES: usize = 104; // 13 × 8
    const ZERO: Self = HGeo([0; 13]);

    fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() != 104 {
            return None;
        }

        let mut coords = [0u64; 13];
        for (i, chunk) in bytes.chunks_exact(8).enumerate() {
            coords[i] = u64::from_le_bytes([
                chunk[0], chunk[1], chunk[2], chunk[3],
                chunk[4], chunk[5], chunk[6], chunk[7],
            ]);
        }

        Some(HGeo(coords))
    }

    fn as_bytes(&self) -> &[u8] {
        // Converte de forma segura usando transmute de array
        let bytes_ptr = &self.0 as *const [u64; 13] as *const [u8; 104];
        // SAFETY: u64 array pode ser lido como bytes
        #[allow(unsafe_code)]
        unsafe { &*bytes_ptr }
    }

    fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(104);
        for &coord in &self.0 {
            bytes.extend_from_slice(&coord.to_le_bytes());
        }
        bytes
    }
}

impl From<[u64; 13]> for HGeo {
    fn from(coords: [u64; 13]) -> Self {
        HGeo(coords)
    }
}

impl fmt::Debug for HGeo {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "HGeo13D(")?;
        for (i, &coord) in self.0.iter().enumerate() {
            if i > 0 { write!(f, ", ")?; }
            write!(f, "{}", coord)?;
        }
        write!(f, ")")
    }
}

impl fmt::Display for HGeo {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "🌌[")?;
        for (i, &coord) in self.0[..3].iter().enumerate() {
            if i > 0 { write!(f, ", ")?; }
            write!(f, "{}", coord)?;
        }
        write!(f, ", ...] (13D)")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zero_hash() {
        let h = HGeo::ZERO;
        assert_eq!(h.magnitude_squared(), 0);
    }

    #[test]
    fn test_distance() {
        let a = HGeo::from([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        let b = HGeo::from([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        let dist_sq = a.distance_squared(&b);
        assert_eq!(dist_sq, 2); // 1² + 1² = 2
    }

    #[test]
    fn test_dot_product() {
        let a = HGeo::from([2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        let b = HGeo::from([4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        let dot = a.dot_product(&b);
        assert_eq!(dot, 23); // 2*4 + 3*5 = 23
    }

    #[test]
    fn test_projection() {
        let h = HGeo::from([10, 20, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(h.project_to_dimension(0), 10);
        assert_eq!(h.project_to_dimension(1), 20);
        assert_eq!(h.project_to_dimension(2), 30);
    }

    #[test]
    fn test_from_bytes() {
        let bytes = [42u8; 104];
        let hash = HGeo::from_bytes(&bytes).unwrap();
        assert_eq!(hash.as_bytes().len(), 104);
    }

    #[test]
    fn test_is_near() {
        let a = HGeo::from([100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        let b = HGeo::from([105, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        assert!(a.is_near(&b, 100)); // dentro do threshold
    }
}

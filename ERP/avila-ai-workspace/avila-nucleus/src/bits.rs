//! Operações de manipulação de bits

/// Conta bits setados (população de bits)
#[inline(always)]
pub const fn popcount(x: u64) -> u32 {
    x.count_ones()
}

/// Encontra o bit mais significativo setado (log2)
#[inline(always)]
pub const fn leading_zeros(x: u64) -> u32 {
    x.leading_zeros()
}

/// Encontra o bit menos significativo setado
#[inline(always)]
pub const fn trailing_zeros(x: u64) -> u32 {
    x.trailing_zeros()
}

/// Rotação à esquerda
#[inline(always)]
pub const fn rotate_left(x: u64, n: u32) -> u64 {
    x.rotate_left(n)
}

/// Rotação à direita
#[inline(always)]
pub const fn rotate_right(x: u64, n: u32) -> u64 {
    x.rotate_right(n)
}

/// Inverte ordem dos bytes (big-endian ↔ little-endian)
#[inline(always)]
pub const fn swap_bytes(x: u64) -> u64 {
    x.swap_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_popcount() {
        assert_eq!(popcount(0b1010), 2);
        assert_eq!(popcount(u64::MAX), 64);
    }

    #[test]
    fn test_leading_zeros() {
        assert_eq!(leading_zeros(1), 63);
        assert_eq!(leading_zeros(0x8000_0000_0000_0000), 0);
    }
}

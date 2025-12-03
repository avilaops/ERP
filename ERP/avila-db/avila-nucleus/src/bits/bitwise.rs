//! Transformações auxiliares sobre palavras de 64 bits.

/// Rotaciona bits à esquerda.
#[inline(always)]
pub const fn rotate_left(x: u64, by: u32) -> u64 {
    x.rotate_left(by)
}

/// Rotaciona bits à direita.
#[inline(always)]
pub const fn rotate_right(x: u64, by: u32) -> u64 {
    x.rotate_right(by)
}

/// Obtém o índice do bit mais significativo (MSB). Retorna 0 se `x == 0`.
#[inline(always)]
pub const fn msb(x: u64) -> u32 {
    if x == 0 {
        0
    } else {
        63 - x.leading_zeros()
    }
}

/// Obtém o índice do bit menos significativo (LSB). Retorna 0 se `x == 0`.
#[inline(always)]
pub const fn lsb(x: u64) -> u32 {
    if x == 0 {
        0
    } else {
        x.trailing_zeros()
    }
}

/// Calcula o comprimento efetivo em bits.
#[inline(always)]
pub const fn bit_length(x: u64) -> u32 {
    64 - x.leading_zeros()
}

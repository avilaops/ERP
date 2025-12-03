//! Operações atômicas de baixo nível em bits e bytes
//!
//! Implementa operações fundamentais que o hardware faz:
//! - ADC (Add with Carry)
//! - SBB (Subtract with Borrow)
//! - Operações constant-time para criptografia

/// Adiciona dois u64 com carry
///
/// Retorna (soma, carry)
#[inline(always)]
pub const fn adc(a: u64, b: u64, carry: u64) -> (u64, u64) {
    let sum = (a as u128) + (b as u128) + (carry as u128);
    (sum as u64, (sum >> 64) as u64)
}

/// Subtrai dois u64 com borrow
///
/// Retorna (diferença, borrow)
#[inline(always)]
pub const fn sbb(a: u64, b: u64, borrow: u64) -> (u64, u64) {
    let diff = (a as u128).wrapping_sub(b as u128).wrapping_sub(borrow as u128);
    (diff as u64, ((diff >> 64) & 1) as u64)
}

/// Multiplica dois u64 retornando u128
#[inline(always)]
pub const fn mul_wide(a: u64, b: u64) -> (u64, u64) {
    let prod = (a as u128) * (b as u128);
    (prod as u64, (prod >> 64) as u64)
}

/// Seleção constant-time (previne timing attacks)
///
/// Se condition == true, retorna if_true, senão retorna if_false
/// IMPORTANTE: executa em tempo constante independente da condição
#[inline(always)]
pub const fn select(condition: bool, if_true: u64, if_false: u64) -> u64 {
    let mask = (condition as u64).wrapping_neg();
    (if_true & mask) | (if_false & !mask)
}

/// Swap constant-time
#[inline(always)]
pub const fn cswap(mask: u64, a: u64, b: u64) -> (u64, u64) {
    let xor = (a ^ b) & mask;
    (a ^ xor, b ^ xor)
}

/// Conta bits setados (population count)
#[inline(always)]
pub const fn popcnt(x: u64) -> u32 {
    x.count_ones()
}

/// Posição do bit mais significativo
#[inline(always)]
pub const fn leading_zeros(x: u64) -> u32 {
    x.leading_zeros()
}

/// Posição do bit menos significativo
#[inline(always)]
pub const fn trailing_zeros(x: u64) -> u32 {
    x.trailing_zeros()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adc() {
        let (sum, carry) = adc(u64::MAX, 1, 0);
        assert_eq!(sum, 0);
        assert_eq!(carry, 1);

        let (sum, carry) = adc(u64::MAX, u64::MAX, 1);
        assert_eq!(sum, u64::MAX);
        assert_eq!(carry, 1);
    }

    #[test]
    fn test_sbb() {
        let (diff, borrow) = sbb(0, 1, 0);
        assert_eq!(diff, u64::MAX);
        assert_eq!(borrow, 1);
    }

    #[test]
    fn test_select() {
        assert_eq!(select(true, 42, 99), 42);
        assert_eq!(select(false, 42, 99), 99);
    }
}

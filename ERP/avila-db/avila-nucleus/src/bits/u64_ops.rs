//! Operações elementares sobre `u64` com semântica constante no tempo.
//! São os blocos básicos para construir inteiros de múltiplos limbs.

/// Soma com carry explícito.
#[inline(always)]
pub const fn adc(a: u64, b: u64, carry: u64) -> (u64, u64) {
    let sum = (a as u128) + (b as u128) + (carry as u128);
    (sum as u64, (sum >> 64) as u64)
}

/// Subtração com borrow explícito.
#[inline(always)]
pub const fn sbb(a: u64, b: u64, borrow: u64) -> (u64, u64) {
    let diff = (a as u128).wrapping_sub((b as u128) + (borrow as u128));
    (diff as u64, ((diff >> 64) & 1) as u64)
}

/// Multiplicação ampla 64x64 → 128 bits.
#[inline(always)]
pub const fn mul_wide(a: u64, b: u64) -> (u64, u64) {
    let prod = (a as u128) * (b as u128);
    (prod as u64, (prod >> 64) as u64)
}

/// Multiplicação com acumulação: `a * b + c`.
#[inline(always)]
pub const fn mac(a: u64, b: u64, c: u64) -> (u64, u64) {
    let prod = (a as u128) * (b as u128) + (c as u128);
    (prod as u64, (prod >> 64) as u64)
}

/// Multiplicação com acumulação e carry: `a * b + c + carry`.
#[inline(always)]
pub const fn macc(a: u64, b: u64, c: u64, carry: u64) -> (u64, u64) {
    let prod = (a as u128) * (b as u128) + (c as u128) + (carry as u128);
    (prod as u64, (prod >> 64) as u64)
}

/// Contagem de zeros à esquerda.
#[inline(always)]
pub const fn leading_zeros(x: u64) -> u32 {
    u64::leading_zeros(x)
}

/// Contagem de zeros à direita.
#[inline(always)]
pub const fn trailing_zeros(x: u64) -> u32 {
    u64::trailing_zeros(x)
}

/// Testa se um bit está setado.
#[inline(always)]
pub const fn test_bit(x: u64, bit: u32) -> bool {
    ((x >> bit) & 1) == 1
}

/// Seta um bit específico.
#[inline(always)]
pub const fn set_bit(x: u64, bit: u32) -> u64 {
    x | (1u64 << bit)
}

/// Limpa um bit específico.
#[inline(always)]
pub const fn clear_bit(x: u64, bit: u32) -> u64 {
    x & !(1u64 << bit)
}

/// Conditional swap (constant-time).
#[inline(always)]
pub const fn cswap(condition: bool, mut a: u64, mut b: u64) -> (u64, u64) {
    let mask = (condition as u64).wrapping_neg();
    let tmp = (a ^ b) & mask;
    a ^= tmp;
    b ^= tmp;
    (a, b)
}

/// Conditional select (constant-time).
#[inline(always)]
pub const fn select(condition: bool, if_true: u64, if_false: u64) -> u64 {
    let mask = (condition as u64).wrapping_neg();
    (if_true & mask) | (if_false & !mask)
}

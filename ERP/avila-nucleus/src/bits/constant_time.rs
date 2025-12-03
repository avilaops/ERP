//! Operações constant-time para criptografia
//!
//! Todas as operações aqui garantem tempo de execução constante
//! independente dos valores de entrada, prevenindo timing attacks.

/// Constant-time equality: a == b
///
/// Retorna 0xFFFFFFFFFFFFFFFF se igual, 0x0000000000000000 se diferente.
/// Tempo de execução não depende dos valores.
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::ct_eq_u64;
///
/// assert_eq!(ct_eq_u64(5, 5), u64::MAX);
/// assert_eq!(ct_eq_u64(5, 6), 0);
/// ```
#[inline(always)]
pub const fn ct_eq_u64(a: u64, b: u64) -> u64 {
    let diff = a ^ b;
    let combined = diff | diff.wrapping_neg();
    (combined >> 63).wrapping_sub(1)
}

/// Constant-time less than: a < b
///
/// Retorna 0xFFFFFFFFFFFFFFFF se a < b, 0 caso contrário.
#[inline(always)]
pub const fn ct_lt_u64(a: u64, b: u64) -> u64 {
    // Baseado em: https://graphics.stanford.edu/~seander/bithacks.html#IntegerMinOrMax
    // a < b ⟺ (a ^ ((a ^ b) | ((a - b) ^ b))) < 0 (signed comparison)
    let diff = a.wrapping_sub(b);
    let xor_ab = a ^ b;
    let xor_diffb = diff ^ b;
    let combined = a ^ (xor_ab | xor_diffb);
    (combined >> 63).wrapping_neg()
}

/// Constant-time greater than: a > b
#[inline(always)]
pub const fn ct_gt_u64(a: u64, b: u64) -> u64 {
    ct_lt_u64(b, a)
}

/// Constant-time less than or equal: a <= b
#[inline(always)]
pub const fn ct_le_u64(a: u64, b: u64) -> u64 {
    !ct_gt_u64(a, b)
}

/// Constant-time greater than or equal: a >= b
#[inline(always)]
pub const fn ct_ge_u64(a: u64, b: u64) -> u64 {
    !ct_lt_u64(a, b)
}

/// Constant-time select: condition ? a : b
///
/// Se condition == 0xFF...FF, retorna a, senão retorna b.
/// Não usa branches.
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::{ct_select_u64, ct_eq_u64};
///
/// let cond = ct_eq_u64(5, 5); // 0xFF...FF
/// assert_eq!(ct_select_u64(cond, 42, 99), 42);
///
/// let cond = ct_eq_u64(5, 6); // 0x00...00
/// assert_eq!(ct_select_u64(cond, 42, 99), 99);
/// ```
#[inline(always)]
pub const fn ct_select_u64(condition: u64, a: u64, b: u64) -> u64 {
    (a & condition) | (b & !condition)
}

/// Constant-time conditional swap
///
/// Se condition == 0xFF...FF, faz swap(a, b), senão mantém (a, b).
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::ct_swap_u64;
///
/// let (x, y) = ct_swap_u64(u64::MAX, 5, 10);
/// assert_eq!(x, 10);
/// assert_eq!(y, 5);
///
/// let (x, y) = ct_swap_u64(0, 5, 10);
/// assert_eq!(x, 5);
/// assert_eq!(y, 10);
/// ```
#[inline(always)]
pub const fn ct_swap_u64(condition: u64, a: u64, b: u64) -> (u64, u64) {
    let xor = (a ^ b) & condition;
    (a ^ xor, b ^ xor)
}

/// Constant-time conditional move: if condition { *dest = src }
///
/// Move src para dest apenas se condition == 0xFF...FF.
/// Não usa branches.
#[inline(always)]
pub const fn ct_cmov_u64(condition: u64, dest: u64, src: u64) -> u64 {
    ct_select_u64(condition, src, dest)
}

/// Constant-time zero check
///
/// Retorna 0xFF...FF se x == 0, 0 caso contrário.
#[inline(always)]
pub const fn ct_is_zero_u64(x: u64) -> u64 {
    let neg_x = x.wrapping_neg();
    let combined = x | neg_x;
    (combined >> 63).wrapping_sub(1)
}

/// Constant-time non-zero check
///
/// Retorna 0xFF...FF se x != 0, 0 caso contrário.
#[inline(always)]
pub const fn ct_is_nonzero_u64(x: u64) -> u64 {
    !ct_is_zero_u64(x)
}

/// Constant-time array equality: arrays a e b são iguais?
///
/// Retorna true se todos elementos são iguais, false caso contrário.
/// Tempo constante: sempre percorre todo o array.
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::ct_eq_array;
///
/// let a = [1, 2, 3, 4];
/// let b = [1, 2, 3, 4];
/// let c = [1, 2, 3, 5];
///
/// assert!(ct_eq_array(&a, &b));
/// assert!(!ct_eq_array(&a, &c));
/// ```
#[inline]
pub fn ct_eq_array(a: &[u64], b: &[u64]) -> bool {
    if a.len() != b.len() {
        return false;
    }

    let mut diff = 0u64;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }

    ct_is_zero_u64(diff) == u64::MAX
}

/// Constant-time array comparison: a < b?
///
/// Compara arrays como números big-endian (high limb = a[len-1]).
/// Tempo constante: sempre percorre todo o array.
#[inline]
pub fn ct_lt_array(a: &[u64], b: &[u64]) -> bool {
    debug_assert_eq!(a.len(), b.len());

    let mut result = 0u64; // 0 = ainda não decidiu
    let mut decided = 0u64; // 0xFF...FF quando já decidiu

    // Percorre de high para low
    for i in (0..a.len()).rev() {
        let lt = ct_lt_u64(a[i], b[i]);
        let gt = ct_gt_u64(a[i], b[i]);

        // Se ainda não decidiu e a[i] < b[i], resultado é true
        result |= lt & !decided;

        // Marca como decidido se a[i] != b[i]
        decided |= lt | gt;
    }

    result == u64::MAX
}

/// Constant-time conditional copy: if condition { dest = src }
///
/// Copia src para dest apenas se condition == 0xFF...FF.
/// Sempre acessa ambos arrays (constant-time).
#[inline]
pub fn ct_copy_array(condition: u64, dest: &mut [u64], src: &[u64]) {
    debug_assert_eq!(dest.len(), src.len());

    for i in 0..dest.len() {
        dest[i] = ct_select_u64(condition, src[i], dest[i]);
    }
}

/// Constant-time conditional swap de arrays
///
/// Se condition == 0xFF...FF, faz swap(a, b), senão mantém.
#[inline]
pub fn ct_swap_array(condition: u64, a: &mut [u64], b: &mut [u64]) {
    debug_assert_eq!(a.len(), b.len());

    for i in 0..a.len() {
        let (new_a, new_b) = ct_swap_u64(condition, a[i], b[i]);
        a[i] = new_a;
        b[i] = new_b;
    }
}

/// Constant-time memset
///
/// Seta todos elementos do array para value.
/// Sempre percorre todo o array.
#[inline]
pub fn ct_memset(array: &mut [u64], value: u64) {
    for i in 0..array.len() {
        array[i] = value;
    }
}

/// Constant-time memzero
///
/// Zera array de forma que não seja otimizado pelo compilador.
/// Crítico para limpar chaves secretas da memória.
#[inline]
pub fn ct_memzero(array: &mut [u64]) {
    // Usa volatile_set_memory para garantir que não seja otimizado
    for elem in array.iter_mut() {
        unsafe {
            core::ptr::write_volatile(elem, 0);
        }
    }
}

/// Constant-time byte-level equality
///
/// Compara slices de bytes em tempo constante.
#[inline]
pub fn ct_eq_bytes(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }

    let mut diff = 0u8;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }

    diff == 0
}

// ============================================================================
// High-level constant-time arithmetic for U256, U512, etc.
// ============================================================================

use super::u64_ops::{adc, sbb, mul_wide};

/// Constant-time addition U256: a + b → (result, carry)
#[inline]
pub fn ct_add256(a: &[u64; 4], b: &[u64; 4]) -> ([u64; 4], u64) {
    let mut result = [0u64; 4];
    let mut carry = 0u64;

    for i in 0..4 {
        let (r, c) = adc(a[i], b[i], carry);
        result[i] = r;
        carry = c;
    }

    (result, carry)
}

/// Constant-time subtraction U256: a - b → (result, borrow)
#[inline]
pub fn ct_sub256(a: &[u64; 4], b: &[u64; 4]) -> ([u64; 4], u64) {
    let mut result = [0u64; 4];
    let mut borrow = 0u64;

    for i in 0..4 {
        let (r, b) = sbb(a[i], b[i], borrow);
        result[i] = r;
        borrow = b;
    }

    (result, borrow)
}

/// Constant-time multiplication U256 × u64 → U320
#[inline]
pub fn ct_mul256x64(a: &[u64; 4], b: u64) -> [u64; 5] {
    let mut result = [0u64; 5];
    let mut carry = 0u64;

    for i in 0..4 {
        let (lo, hi) = mul_wide(a[i], b);
        let (r, c) = adc(lo, carry, 0);
        result[i] = r;
        carry = hi + c;
    }
    result[4] = carry;

    result
}

/// Constant-time conditional select U256: condition ? a : b
#[inline]
pub fn ct_select256(condition: u64, a: &[u64; 4], b: &[u64; 4]) -> [u64; 4] {
    [
        ct_select_u64(condition, a[0], b[0]),
        ct_select_u64(condition, a[1], b[1]),
        ct_select_u64(condition, a[2], b[2]),
        ct_select_u64(condition, a[3], b[3]),
    ]
}

/// Constant-time equality U256
#[inline]
pub fn ct_eq256(a: &[u64; 4], b: &[u64; 4]) -> u64 {
    ct_eq_u64(a[0], b[0]) &
    ct_eq_u64(a[1], b[1]) &
    ct_eq_u64(a[2], b[2]) &
    ct_eq_u64(a[3], b[3])
}

/// Constant-time modular reduction: if a >= m then a - m else a
#[inline]
pub fn ct_reduce256(a: &[u64; 4], modulus: &[u64; 4]) -> [u64; 4] {
    let (diff, borrow) = ct_sub256(a, modulus);
    let should_use_diff = (borrow == 0) as u64;
    ct_select256(should_use_diff.wrapping_neg(), &diff, a)
}

/// Constant-time modular addition: (a + b) mod m
#[inline]
pub fn ct_add_mod256(a: &[u64; 4], b: &[u64; 4], modulus: &[u64; 4]) -> [u64; 4] {
    let (sum, _) = ct_add256(a, b);
    ct_reduce256(&sum, modulus)
}

/// Constant-time addition U512
#[inline]
pub fn ct_add512(a: &[u64; 8], b: &[u64; 8]) -> ([u64; 8], u64) {
    let mut result = [0u64; 8];
    let mut carry = 0u64;

    for i in 0..8 {
        let (r, c) = adc(a[i], b[i], carry);
        result[i] = r;
        carry = c;
    }

    (result, carry)
}

/// Constant-time subtraction U512
#[inline]
pub fn ct_sub512(a: &[u64; 8], b: &[u64; 8]) -> ([u64; 8], u64) {
    let mut result = [0u64; 8];
    let mut borrow = 0u64;

    for i in 0..8 {
        let (r, b) = sbb(a[i], b[i], borrow);
        result[i] = r;
        borrow = b;
    }

    (result, borrow)
}

/// Constant-time equality U512
#[inline]
pub fn ct_eq512(a: &[u64; 8], b: &[u64; 8]) -> u64 {
    let mut result = u64::MAX;
    for i in 0..8 {
        result &= ct_eq_u64(a[i], b[i]);
    }
    result
}

/// Constant-time conditional select U512
#[inline]
pub fn ct_select512(condition: u64, a: &[u64; 8], b: &[u64; 8]) -> [u64; 8] {
    let mut result = [0u64; 8];
    for i in 0..8 {
        result[i] = ct_select_u64(condition, a[i], b[i]);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ct_eq() {
        assert_eq!(ct_eq_u64(5, 5), u64::MAX);
        assert_eq!(ct_eq_u64(5, 6), 0);
        assert_eq!(ct_eq_u64(0, 0), u64::MAX);
    }

    #[test]
    fn test_ct_comparisons() {
        assert_eq!(ct_lt_u64(5, 10), u64::MAX);
        assert_eq!(ct_lt_u64(10, 5), 0);
        assert_eq!(ct_lt_u64(5, 5), 0);

        assert_eq!(ct_gt_u64(10, 5), u64::MAX);
        assert_eq!(ct_gt_u64(5, 10), 0);
    }

    #[test]
    fn test_ct_select() {
        let cond_true = u64::MAX;
        let cond_false = 0;

        assert_eq!(ct_select_u64(cond_true, 42, 99), 42);
        assert_eq!(ct_select_u64(cond_false, 42, 99), 99);
    }

    #[test]
    fn test_ct_swap() {
        let (x, y) = ct_swap_u64(u64::MAX, 5, 10);
        assert_eq!(x, 10);
        assert_eq!(y, 5);

        let (x, y) = ct_swap_u64(0, 5, 10);
        assert_eq!(x, 5);
        assert_eq!(y, 10);
    }

    #[test]
    fn test_ct_is_zero() {
        assert_eq!(ct_is_zero_u64(0), u64::MAX);
        assert_eq!(ct_is_zero_u64(1), 0);
        assert_eq!(ct_is_zero_u64(u64::MAX), 0);
    }

    #[test]
    fn test_ct_eq_array() {
        let a = [1, 2, 3, 4];
        let b = [1, 2, 3, 4];
        let c = [1, 2, 3, 5];

        assert!(ct_eq_array(&a, &b));
        assert!(!ct_eq_array(&a, &c));
    }

    #[test]
    fn test_ct_lt_array() {
        let a = [1, 2, 3, 4];
        let b = [1, 2, 3, 5];

        assert!(ct_lt_array(&a, &b));
        assert!(!ct_lt_array(&b, &a));
        assert!(!ct_lt_array(&a, &a));
    }

    #[test]
    fn test_ct_memzero() {
        let mut data = [0x42u64; 10];
        ct_memzero(&mut data);
        assert!(data.iter().all(|&x| x == 0));
    }

    #[test]
    fn test_ct_eq_bytes() {
        let a = b"hello world";
        let b = b"hello world";
        let c = b"hello worlD";

        assert!(ct_eq_bytes(a, b));
        assert!(!ct_eq_bytes(a, c));
    }

    #[test]
    fn test_ct_add256() {
        let a = [1, 2, 3, 4];
        let b = [5, 6, 7, 8];
        let (result, carry) = ct_add256(&a, &b);
        assert_eq!(result, [6, 8, 10, 12]);
        assert_eq!(carry, 0);
    }

    #[test]
    fn test_ct_sub256() {
        let a = [10, 20, 30, 40];
        let b = [5, 10, 15, 20];
        let (result, borrow) = ct_sub256(&a, &b);
        assert_eq!(result, [5, 10, 15, 20]);
        assert_eq!(borrow, 0);
    }

    #[test]
    fn test_ct_eq256() {
        let a = [1, 2, 3, 4];
        let b = [1, 2, 3, 4];
        let c = [1, 2, 3, 5];

        assert_eq!(ct_eq256(&a, &b), u64::MAX);
        assert_eq!(ct_eq256(&a, &c), 0);
    }

    #[test]
    fn test_ct_select256() {
        let a = [1, 2, 3, 4];
        let b = [5, 6, 7, 8];

        let selected_a = ct_select256(u64::MAX, &a, &b);
        assert_eq!(selected_a, a);

        let selected_b = ct_select256(0, &a, &b);
        assert_eq!(selected_b, b);
    }

    #[test]
    fn test_ct_reduce256() {
        let a = [10, 0, 0, 0];
        let modulus = [7, 0, 0, 0];
        let result = ct_reduce256(&a, &modulus);
        assert_eq!(result, [3, 0, 0, 0]);

        let a_small = [5, 0, 0, 0];
        let result_small = ct_reduce256(&a_small, &modulus);
        assert_eq!(result_small, [5, 0, 0, 0]);
    }

    #[test]
    fn test_ct_add512() {
        let a = [1, 2, 3, 4, 5, 6, 7, 8];
        let b = [1, 1, 1, 1, 1, 1, 1, 1];
        let (result, carry) = ct_add512(&a, &b);
        assert_eq!(result, [2, 3, 4, 5, 6, 7, 8, 9]);
        assert_eq!(carry, 0);
    }
}

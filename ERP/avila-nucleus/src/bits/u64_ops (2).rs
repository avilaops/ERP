//! Operações fundamentais em u64
//!
//! Building blocks de toda aritmética de precisão arbitrária.
//! Todas as operações são constant-time quando possível.

/// Adição com carry output: a + b + carry → (sum, carry_out)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::adc;
///
/// let (sum, carry) = adc(5, 10, 0);
/// assert_eq!(sum, 15);
/// assert_eq!(carry, 0);
///
/// // Overflow
/// let (sum, carry) = adc(u64::MAX, 1, 0);
/// assert_eq!(sum, 0);
/// assert_eq!(carry, 1);
/// ```
#[inline(always)]
pub const fn adc(a: u64, b: u64, carry: u64) -> (u64, u64) {
    let sum = (a as u128) + (b as u128) + (carry as u128);
    (sum as u64, (sum >> 64) as u64)
}

/// Subtração com borrow output: a - b - borrow → (diff, borrow_out)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::sbb;
///
/// let (diff, borrow) = sbb(10, 5, 0);
/// assert_eq!(diff, 5);
/// assert_eq!(borrow, 0);
///
/// // Underflow
/// let (diff, borrow) = sbb(0, 1, 0);
/// assert_eq!(diff, u64::MAX);
/// assert_eq!(borrow, 1);
/// ```
#[inline(always)]
pub const fn sbb(a: u64, b: u64, borrow: u64) -> (u64, u64) {
    let diff = (a as u128).wrapping_sub((b as u128) + (borrow as u128));
    (diff as u64, if diff >> 64 != 0 { 1 } else { 0 })
}

/// Multiplicação 64x64 → 128: a * b → (low, high)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::mul_wide;
///
/// let (lo, hi) = mul_wide(2, 3);
/// assert_eq!(lo, 6);
/// assert_eq!(hi, 0);
///
/// // Overflow para high word
/// let (lo, hi) = mul_wide(u64::MAX, u64::MAX);
/// assert_eq!(lo, 1);
/// assert_eq!(hi, u64::MAX - 1);
/// ```
#[inline(always)]
pub const fn mul_wide(a: u64, b: u64) -> (u64, u64) {
    let prod = (a as u128) * (b as u128);
    (prod as u64, (prod >> 64) as u64)
}

/// Multiply-add: a * b + c → (low, high)
///
/// Útil para implementar multiplicação multi-limb.
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::mac;
///
/// let (lo, hi) = mac(2, 3, 10);
/// assert_eq!(lo, 16); // 2*3 + 10 = 16
/// assert_eq!(hi, 0);
/// ```
#[inline(always)]
pub const fn mac(a: u64, b: u64, c: u64) -> (u64, u64) {
    let prod = (a as u128) * (b as u128) + (c as u128);
    (prod as u64, (prod >> 64) as u64)
}

/// Multiply-add com carry: a * b + c + carry → (low, high)
///
/// Versão completa para implementar multiplicação de arrays.
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::macc;
///
/// let (lo, hi) = macc(2, 3, 10, 5);
/// assert_eq!(lo, 21); // 2*3 + 10 + 5 = 21
/// assert_eq!(hi, 0);
/// ```
#[inline(always)]
pub const fn macc(a: u64, b: u64, c: u64, carry: u64) -> (u64, u64) {
    let prod = (a as u128) * (b as u128) + (c as u128) + (carry as u128);
    (prod as u64, (prod >> 64) as u64)
}

/// Count leading zeros
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::leading_zeros;
///
/// assert_eq!(leading_zeros(0), 64);
/// assert_eq!(leading_zeros(1), 63);
/// assert_eq!(leading_zeros(0xFF), 56);
/// ```
#[inline(always)]
pub const fn leading_zeros(x: u64) -> u32 {
    x.leading_zeros()
}

/// Count trailing zeros
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::trailing_zeros;
///
/// assert_eq!(trailing_zeros(0), 64);
/// assert_eq!(trailing_zeros(1), 0);
/// assert_eq!(trailing_zeros(8), 3);
/// ```
#[inline(always)]
pub const fn trailing_zeros(x: u64) -> u32 {
    x.trailing_zeros()
}

/// Count set bits (population count)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::count_ones;
///
/// assert_eq!(count_ones(0), 0);
/// assert_eq!(count_ones(0xFF), 8);
/// assert_eq!(count_ones(u64::MAX), 64);
/// ```
#[inline(always)]
pub const fn count_ones(x: u64) -> u32 {
    x.count_ones()
}

/// Test if bit is set
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::test_bit;
///
/// assert!(test_bit(0b1010, 1));
/// assert!(!test_bit(0b1010, 0));
/// assert!(test_bit(0b1010, 3));
/// ```
#[inline(always)]
pub const fn test_bit(x: u64, bit: u32) -> bool {
    (x >> bit) & 1 == 1
}

/// Set bit (returns new value)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::set_bit;
///
/// assert_eq!(set_bit(0, 0), 1);
/// assert_eq!(set_bit(0, 1), 2);
/// assert_eq!(set_bit(0b1010, 0), 0b1011);
/// ```
#[inline(always)]
pub const fn set_bit(x: u64, bit: u32) -> u64 {
    x | (1u64 << bit)
}

/// Clear bit (returns new value)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::clear_bit;
///
/// assert_eq!(clear_bit(0b1111, 0), 0b1110);
/// assert_eq!(clear_bit(0b1111, 2), 0b1011);
/// ```
#[inline(always)]
pub const fn clear_bit(x: u64, bit: u32) -> u64 {
    x & !(1u64 << bit)
}

/// Toggle bit (returns new value)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::toggle_bit;
///
/// assert_eq!(toggle_bit(0, 0), 1);
/// assert_eq!(toggle_bit(1, 0), 0);
/// assert_eq!(toggle_bit(0b1010, 0), 0b1011);
/// ```
#[inline(always)]
pub const fn toggle_bit(x: u64, bit: u32) -> u64 {
    x ^ (1u64 << bit)
}

/// Conditional swap (constant-time)
///
/// Se condition == true, swap(a, b), senão mantém (a, b).
/// Implementação constant-time para evitar timing attacks.
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::cswap;
///
/// let (x, y) = cswap(true, 5, 10);
/// assert_eq!(x, 10);
/// assert_eq!(y, 5);
///
/// let (x, y) = cswap(false, 5, 10);
/// assert_eq!(x, 5);
/// assert_eq!(y, 10);
/// ```
#[inline(always)]
pub const fn cswap(condition: bool, a: u64, b: u64) -> (u64, u64) {
    let mask = (condition as u64).wrapping_neg(); // 0 ou 0xFFFFFFFFFFFFFFFF
    let xor = (a ^ b) & mask;
    (a ^ xor, b ^ xor)
}

/// Conditional select (constant-time)
///
/// Retorna if_true se condition, senão if_false.
/// Implementação constant-time.
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::select;
///
/// assert_eq!(select(true, 42, 99), 42);
/// assert_eq!(select(false, 42, 99), 99);
/// ```
#[inline(always)]
pub const fn select(condition: bool, if_true: u64, if_false: u64) -> u64 {
    let mask = (condition as u64).wrapping_neg();
    (if_true & mask) | (if_false & !mask)
}

/// Rotate left
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::rotl;
///
/// assert_eq!(rotl(0b1000_0001, 1), 0b0000_0011);
/// assert_eq!(rotl(0b1000_0000, 1), 0b0000_0001);
/// ```
#[inline(always)]
pub const fn rotl(x: u64, n: u32) -> u64 {
    x.rotate_left(n)
}

/// Rotate right
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::rotr;
///
/// assert_eq!(rotr(0b0000_0011, 1), 0b1000_0001);
/// assert_eq!(rotr(0b0000_0001, 1), 0b1000_0000);
/// ```
#[inline(always)]
pub const fn rotr(x: u64, n: u32) -> u64 {
    x.rotate_right(n)
}

/// Constant-time comparison: a == b
///
/// Retorna 0xFFFFFFFFFFFFFFFF se igual, 0 se diferente.
/// Constant-time para evitar timing attacks.
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::ct_eq;
///
/// assert_eq!(ct_eq(5, 5), u64::MAX);
/// assert_eq!(ct_eq(5, 6), 0);
/// ```
#[inline(always)]
pub const fn ct_eq(a: u64, b: u64) -> u64 {
    let diff = a ^ b;
    let combined = diff | diff.wrapping_neg();
    !((combined >> 63).wrapping_sub(1))
}

/// Constant-time less than: a < b
///
/// Retorna 0xFFFFFFFFFFFFFFFF se a < b, 0 caso contrário.
/// Constant-time para evitar timing attacks.
#[inline(always)]
pub const fn ct_lt(a: u64, b: u64) -> u64 {
    let diff = a ^ b;
    let borrow = (!a & b) | ((!a | b) & diff);
    (borrow >> 63).wrapping_neg()
}

/// Constant-time greater than: a > b
#[inline(always)]
pub const fn ct_gt(a: u64, b: u64) -> u64 {
    ct_lt(b, a)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adc() {
        let (sum, carry) = adc(5, 10, 0);
        assert_eq!(sum, 15);
        assert_eq!(carry, 0);

        let (sum, carry) = adc(u64::MAX, 1, 0);
        assert_eq!(sum, 0);
        assert_eq!(carry, 1);

        let (sum, carry) = adc(u64::MAX, u64::MAX, 1);
        assert_eq!(sum, u64::MAX);
        assert_eq!(carry, 1);
    }

    #[test]
    fn test_sbb() {
        let (diff, borrow) = sbb(10, 5, 0);
        assert_eq!(diff, 5);
        assert_eq!(borrow, 0);

        let (diff, borrow) = sbb(0, 1, 0);
        assert_eq!(diff, u64::MAX);
        assert_eq!(borrow, 1);
    }

    #[test]
    fn test_mul_wide() {
        let (lo, hi) = mul_wide(2, 3);
        assert_eq!(lo, 6);
        assert_eq!(hi, 0);

        let (lo, hi) = mul_wide(u64::MAX, u64::MAX);
        assert_eq!(lo, 1);
        assert_eq!(hi, u64::MAX - 1);
    }

    #[test]
    fn test_cswap() {
        let (x, y) = cswap(true, 5, 10);
        assert_eq!(x, 10);
        assert_eq!(y, 5);

        let (x, y) = cswap(false, 5, 10);
        assert_eq!(x, 5);
        assert_eq!(y, 10);
    }

    #[test]
    fn test_ct_eq() {
        assert_eq!(ct_eq(5, 5), u64::MAX);
        assert_eq!(ct_eq(5, 6), 0);
        assert_eq!(ct_eq(0, 0), u64::MAX);
    }
}

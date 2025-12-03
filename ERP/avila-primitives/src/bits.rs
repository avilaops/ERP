//! Bit manipulation operations

/// Bit operations trait
pub trait BitOps {
    /// Count leading zeros
    fn leading_zeros(&self) -> u32;

    /// Count trailing zeros
    fn trailing_zeros(&self) -> u32;

    /// Count ones
    fn count_ones(&self) -> u32;

    /// Reverse bits
    fn reverse_bits(&self) -> Self;

    /// Rotate left
    fn rotate_left(&self, n: u32) -> Self;

    /// Rotate right
    fn rotate_right(&self, n: u32) -> Self;
}

macro_rules! impl_bitops {
    ($($t:ty),*) => {
        $(
            impl BitOps for $t {
                #[inline]
                fn leading_zeros(&self) -> u32 {
                    <$t>::leading_zeros(*self)
                }

                #[inline]
                fn trailing_zeros(&self) -> u32 {
                    <$t>::trailing_zeros(*self)
                }

                #[inline]
                fn count_ones(&self) -> u32 {
                    <$t>::count_ones(*self)
                }

                #[inline]
                fn reverse_bits(&self) -> Self {
                    <$t>::reverse_bits(*self)
                }

                #[inline]
                fn rotate_left(&self, n: u32) -> Self {
                    <$t>::rotate_left(*self, n)
                }

                #[inline]
                fn rotate_right(&self, n: u32) -> Self {
                    <$t>::rotate_right(*self, n)
                }
            }
        )*
    }
}

impl_bitops!(u8, u16, u32, u64, u128, usize);

/// Count bits trait
pub trait CountBits {
    /// Number of bits
    const BITS: u32;

    /// Number of bytes
    const BYTES: usize;
}

macro_rules! impl_countbits {
    ($($t:ty => $bits:expr),*) => {
        $(
            impl CountBits for $t {
                const BITS: u32 = $bits;
                const BYTES: usize = ($bits / 8) as usize;
            }
        )*
    }
}

impl_countbits!(
    u8 => 8,
    u16 => 16,
    u32 => 32,
    u64 => 64,
    u128 => 128,
    usize => core::mem::size_of::<usize>() as u32 * 8
);

/// Select bits without branching (constant-time)
#[inline]
pub const fn ct_select_u64(condition: bool, if_true: u64, if_false: u64) -> u64 {
    let mask = (condition as u64).wrapping_neg();
    (if_true & mask) | (if_false & !mask)
}

/// Compare equal in constant time
#[inline]
pub const fn ct_eq_u64(a: u64, b: u64) -> bool {
    let diff = a ^ b;
    let diff_or = diff | diff.wrapping_neg();
    ((diff_or >> 63) as u8) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bitops_leading_zeros() {
        assert_eq!(0u64.leading_zeros(), 64);
        assert_eq!(1u64.leading_zeros(), 63);
        assert_eq!(0xFFu64.leading_zeros(), 56);
    }

    #[test]
    fn test_bitops_count_ones() {
        assert_eq!(0u64.count_ones(), 0);
        assert_eq!(1u64.count_ones(), 1);
        assert_eq!(0xFFu64.count_ones(), 8);
    }

    #[test]
    fn test_ct_select() {
        assert_eq!(ct_select_u64(true, 42, 99), 42);
        assert_eq!(ct_select_u64(false, 42, 99), 99);
    }

    #[test]
    fn test_ct_eq() {
        assert!(ct_eq_u64(42, 42));
        assert!(!ct_eq_u64(42, 43));
    }

    #[test]
    fn test_countbits() {
        assert_eq!(u8::BITS, 8);
        assert_eq!(u64::BITS, 64);
        assert_eq!(u64::BYTES, 8);
    }
}

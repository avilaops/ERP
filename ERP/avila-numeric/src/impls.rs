//! Trait implementations for standard numeric types

use crate::traits::*;

// Macro for implementing Zero and One for primitive types
macro_rules! impl_zero_one {
    ($t:ty, $zero:expr, $one:expr) => {
        impl Zero for $t {
            #[inline]
            fn zero() -> Self {
                $zero
            }

            #[inline]
            fn is_zero(&self) -> bool {
                *self == $zero
            }
        }

        impl One for $t {
            #[inline]
            fn one() -> Self {
                $one
            }
        }
    };
}

// Implement for integer types
impl_zero_one!(i8, 0, 1);
impl_zero_one!(i16, 0, 1);
impl_zero_one!(i32, 0, 1);
impl_zero_one!(i64, 0, 1);
impl_zero_one!(i128, 0, 1);
impl_zero_one!(isize, 0, 1);
impl_zero_one!(u8, 0, 1);
impl_zero_one!(u16, 0, 1);
impl_zero_one!(u32, 0, 1);
impl_zero_one!(u64, 0, 1);
impl_zero_one!(u128, 0, 1);
impl_zero_one!(usize, 0, 1);
impl_zero_one!(f32, 0.0, 1.0);
impl_zero_one!(f64, 0.0, 1.0);

// Macro for implementing Num trait
macro_rules! impl_num {
    ($t:ty) => {
        impl Num for $t {
            #[inline]
            fn from_usize(n: usize) -> Self {
                n as $t
            }

            #[inline]
            fn from_isize(n: isize) -> Self {
                n as $t
            }
        }
    };
}

impl_num!(i8);
impl_num!(i16);
impl_num!(i32);
impl_num!(i64);
impl_num!(i128);
impl_num!(isize);
impl_num!(u8);
impl_num!(u16);
impl_num!(u32);
impl_num!(u64);
impl_num!(u128);
impl_num!(usize);
impl_num!(f32);
impl_num!(f64);

// Implement Float trait
macro_rules! impl_float {
    ($t:ty) => {
        impl Float for $t {
            #[inline]
            fn nan() -> Self {
                <$t>::NAN
            }

            #[inline]
            fn infinity() -> Self {
                <$t>::INFINITY
            }

            #[inline]
            fn neg_infinity() -> Self {
                <$t>::NEG_INFINITY
            }

            #[inline]
            fn is_nan(self) -> bool {
                <$t>::is_nan(self)
            }

            #[inline]
            fn is_infinite(self) -> bool {
                <$t>::is_infinite(self)
            }

            #[inline]
            fn is_finite(self) -> bool {
                <$t>::is_finite(self)
            }

            #[inline]
            fn sqrt(self) -> Self {
                <$t>::sqrt(self)
            }

            #[inline]
            fn abs(self) -> Self {
                <$t>::abs(self)
            }

            #[inline]
            fn floor(self) -> Self {
                <$t>::floor(self)
            }

            #[inline]
            fn ceil(self) -> Self {
                <$t>::ceil(self)
            }

            #[inline]
            fn round(self) -> Self {
                <$t>::round(self)
            }

            #[inline]
            fn powf(self, exp: Self) -> Self {
                <$t>::powf(self, exp)
            }

            #[inline]
            fn exp(self) -> Self {
                <$t>::exp(self)
            }

            #[inline]
            fn ln(self) -> Self {
                <$t>::ln(self)
            }

            #[inline]
            fn sin(self) -> Self {
                <$t>::sin(self)
            }

            #[inline]
            fn cos(self) -> Self {
                <$t>::cos(self)
            }

            #[inline]
            fn tan(self) -> Self {
                <$t>::tan(self)
            }
        }
    };
}

impl_float!(f32);
impl_float!(f64);

// Implement Integer trait
macro_rules! impl_integer {
    ($t:ty) => {
        impl Integer for $t {
            #[inline]
            fn div_floor(&self, other: &Self) -> Self {
                let (d, r) = (*self / *other, *self % *other);
                if (r > 0 && *other < 0) || (r < 0 && *other > 0) {
                    d - 1
                } else {
                    d
                }
            }

            #[inline]
            fn mod_floor(&self, other: &Self) -> Self {
                let r = *self % *other;
                if (r > 0 && *other < 0) || (r < 0 && *other > 0) {
                    r + *other
                } else {
                    r
                }
            }

            #[inline]
            fn gcd(&self, other: &Self) -> Self {
                let mut m = *self;
                let mut n = *other;
                if m == 0 || n == 0 {
                    return m | n;
                }

                while m != 0 {
                    let temp = m;
                    m = n % m;
                    n = temp;
                }
                n.abs()
            }
        }

        impl Signed for $t {
            #[inline]
            fn abs(&self) -> Self {
                <$t>::abs(*self)
            }

            #[inline]
            fn signum(&self) -> Self {
                <$t>::signum(*self)
            }

            #[inline]
            fn is_positive(&self) -> bool {
                *self > 0
            }

            #[inline]
            fn is_negative(&self) -> bool {
                *self < 0
            }
        }
    };
}

impl_integer!(i8);
impl_integer!(i16);
impl_integer!(i32);
impl_integer!(i64);
impl_integer!(i128);
impl_integer!(isize);

// Implement for unsigned integers (no Signed trait)
macro_rules! impl_unsigned_integer {
    ($t:ty) => {
        impl Integer for $t {
            #[inline]
            fn div_floor(&self, other: &Self) -> Self {
                *self / *other
            }

            #[inline]
            fn mod_floor(&self, other: &Self) -> Self {
                *self % *other
            }

            #[inline]
            fn gcd(&self, other: &Self) -> Self {
                let mut m = *self;
                let mut n = *other;
                if m == 0 || n == 0 {
                    return m | n;
                }

                while m != 0 {
                    let temp = m;
                    m = n % m;
                    n = temp;
                }
                n
            }
        }

        impl Unsigned for $t {}
    };
}

impl_unsigned_integer!(u8);
impl_unsigned_integer!(u16);
impl_unsigned_integer!(u32);
impl_unsigned_integer!(u64);
impl_unsigned_integer!(u128);
impl_unsigned_integer!(usize);

// Implement Bounded
macro_rules! impl_bounded {
    ($t:ty) => {
        impl Bounded for $t {
            #[inline]
            fn min_value() -> Self {
                <$t>::MIN
            }

            #[inline]
            fn max_value() -> Self {
                <$t>::MAX
            }
        }
    };
}

impl_bounded!(i8);
impl_bounded!(i16);
impl_bounded!(i32);
impl_bounded!(i64);
impl_bounded!(i128);
impl_bounded!(isize);
impl_bounded!(u8);
impl_bounded!(u16);
impl_bounded!(u32);
impl_bounded!(u64);
impl_bounded!(u128);
impl_bounded!(usize);
impl_bounded!(f32);
impl_bounded!(f64);

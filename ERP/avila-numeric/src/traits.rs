//! Core numeric traits

use core::ops::{Add, Sub, Mul, Div, Rem, Neg};

/// Trait for types with a zero value
pub trait Zero: Sized + Add<Self, Output = Self> {
    /// Returns the additive identity element of Self, 0.
    fn zero() -> Self;

    /// Returns true if self is equal to the additive identity.
    fn is_zero(&self) -> bool;
}

/// Trait for types with a one value
pub trait One: Sized + Mul<Self, Output = Self> {
    /// Returns the multiplicative identity element of Self, 1.
    fn one() -> Self;
}

/// Generic trait for numeric types
pub trait Num:
    PartialEq +
    Zero +
    One +
    Add<Output = Self> +
    Sub<Output = Self> +
    Mul<Output = Self> +
    Div<Output = Self> +
    Rem<Output = Self>
{
    /// Convert from a usize
    fn from_usize(n: usize) -> Self;

    /// Convert from an isize
    fn from_isize(n: isize) -> Self;
}

/// Trait for floating-point types
pub trait Float: Num + Neg<Output = Self> + Copy {
    /// Returns the NaN value
    fn nan() -> Self;

    /// Returns positive infinity
    fn infinity() -> Self;

    /// Returns negative infinity
    fn neg_infinity() -> Self;

    /// Returns true if this value is NaN
    fn is_nan(self) -> bool;

    /// Returns true if this value is infinite
    fn is_infinite(self) -> bool;

    /// Returns true if this value is finite
    fn is_finite(self) -> bool;

    /// Returns the square root
    fn sqrt(self) -> Self;

    /// Returns the absolute value
    fn abs(self) -> Self;

    /// Returns the largest integer less than or equal to self
    fn floor(self) -> Self;

    /// Returns the smallest integer greater than or equal to self
    fn ceil(self) -> Self;

    /// Returns the nearest integer
    fn round(self) -> Self;

    /// Raises self to the power of exp
    fn powf(self, exp: Self) -> Self;

    /// Returns e^(self)
    fn exp(self) -> Self;

    /// Returns the natural logarithm
    fn ln(self) -> Self;

    /// Returns the sine
    fn sin(self) -> Self;

    /// Returns the cosine
    fn cos(self) -> Self;

    /// Returns the tangent
    fn tan(self) -> Self;
}

/// Trait for integer types
pub trait Integer: Num + Ord + Copy {
    /// Floored integer division
    fn div_floor(&self, other: &Self) -> Self;

    /// Floored integer modulo
    fn mod_floor(&self, other: &Self) -> Self;

    /// Greatest common divisor
    fn gcd(&self, other: &Self) -> Self;

    /// Least common multiple
    fn lcm(&self, other: &Self) -> Self {
        if self.is_zero() && other.is_zero() {
            Self::zero()
        } else {
            let gcd = self.gcd(other);
            (*self / gcd) * *other
        }
    }
}

/// Trait for signed numeric types
pub trait Signed: Num + Neg<Output = Self> {
    /// Returns the absolute value
    fn abs(&self) -> Self;

    /// Returns the sign (-1, 0, or 1)
    fn signum(&self) -> Self;

    /// Returns true if the number is positive
    fn is_positive(&self) -> bool;

    /// Returns true if the number is negative
    fn is_negative(&self) -> bool;
}

/// Trait for unsigned numeric types
pub trait Unsigned: Num {}

/// Trait for bounded numeric types
pub trait Bounded {
    /// Returns the minimum value
    fn min_value() -> Self;

    /// Returns the maximum value
    fn max_value() -> Self;
}

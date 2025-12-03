#![no_std]

//! Ávila Nucleus - Fundação atômica da pilha criptográfica.
//! Todas as demais camadas dependem exclusivamente destes blocos.

#[cfg(feature = "std")]
extern crate std;

pub mod bits;
pub mod simd;

/// Versão embutida do núcleo.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
	use super::bits::*;
	use super::simd;

	#[test]
	fn adc_and_sbb_roundtrip() {
		let (sum, carry) = adc(u64::MAX, 1, 0);
		assert_eq!(sum, 0);
		assert_eq!(carry, 1);

		let (diff, borrow) = sbb(0, 1, 0);
		assert_eq!(diff, u64::MAX);
		assert_eq!(borrow, 1);
	}

	#[test]
	fn mul_wide_matches_u128() {
		let (lo, hi) = mul_wide(0xFFFF_FFFF_FFFF_FFFF, 0x1234_5678_9ABC_DEF0);
		let expected = (0xFFFF_FFFF_FFFF_FFFFu128) * 0x1234_5678_9ABC_DEF0u128;
		assert_eq!(lo, expected as u64);
		assert_eq!(hi, (expected >> 64) as u64);
	}

	#[test]
	fn bitwise_helpers() {
		assert_eq!(rotate_left(0x01, 1), 0x02);
		assert_eq!(rotate_right(0x02, 1), 0x01);
		assert_eq!(msb(0b1000), 3);
		assert_eq!(lsb(0b1000), 3);
		assert_eq!(bit_length(0), 0);
		assert_eq!(bit_length(0b1010), 4);
	}

	#[test]
	fn cswap_and_select_constant_time_semantics() {
		let (a, b) = cswap(true, 5, 10);
		assert_eq!((a, b), (10, 5));

		let (a, b) = cswap(false, 5, 10);
		assert_eq!((a, b), (5, 10));

		assert_eq!(select(true, 1, 2), 1);
		assert_eq!(select(false, 1, 2), 2);
	}

	#[test]
	fn u128_ops_consistency() {
		let (sbb_lo, sbb_borrow) = sbb(0, 1, 0);
		assert_eq!(sbb_lo, u64::MAX);
		assert_eq!(sbb_borrow, 1);

		let (sbb_lo2, sbb_borrow2) = sbb(0, 0, 1);
		assert_eq!(sbb_lo2, u64::MAX);
		assert_eq!(sbb_borrow2, 1);

		let (lo, hi, carry) = add128(1, 0, u64::MAX, u64::MAX);
		assert_eq!((lo, hi, carry), (0, 0, 1));

		let (sub_lo, sub_hi, sub_borrow) = sub128(0, 0, 1, 0);
		assert_eq!(sub_lo, u64::MAX);
		assert_eq!(sub_hi, u64::MAX);
		assert_eq!(sub_borrow, 1);

		let (lo, mid, hi) = mul128x64(2, 1, 3);
		let expected = ((u128::from(1u64) << 64) | u128::from(2u64)) * 3u128;
		assert_eq!(lo as u128, expected & 0xFFFF_FFFF_FFFF_FFFF);
		assert_eq!(mid as u128, (expected >> 64) & 0xFFFF_FFFF_FFFF_FFFF);
		assert_eq!(hi, 0);
	}

	#[test]
	fn simd_detection_does_not_panic() {
		let features = simd::CpuFeatures::detect();
		let _path = features.best_path();
	}
}

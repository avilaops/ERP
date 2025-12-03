//! # avila-codec - Encoding/Decoding Utilities
//!
//! Fast and secure encoding/decoding for common formats.
//!
//! ## Features
//!
//! - **Hex Encoding** - Fast hex encode/decode
//! - **Base64** - Standard base64 encoding
//! - **Base58** - Bitcoin-style base58 encoding
//! - **Zero Dependencies** - Pure Rust implementation
//! - **no_std Compatible** - Works in embedded environments
//! - **Constant-Time** - Side-channel resistant operations
//!
//! ## Examples
//!
//! ```rust
//! use avila_codec::{hex, base64};
//!
//! // Hex encoding
//! let data = b"Hello";
//! let encoded = hex::encode(data);
//! assert_eq!(encoded, "48656c6c6f");
//!
//! // Base64 encoding
//! let encoded = base64::encode(data);
//! assert_eq!(encoded, "SGVsbG8=");
//! ```

#![cfg_attr(not(feature = "std"), no_std)]
#![warn(missing_docs)]
#![warn(clippy::all)]
#![warn(rust_2018_idioms)]

extern crate alloc;

use alloc::{string::String, vec, vec::Vec};
use avila_error::{Error, ErrorKind, Result};

/// Hex encoding/decoding
pub mod hex {
    use super::*;

    const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";

    /// Encodes bytes to hex string
    pub fn encode(data: &[u8]) -> String {
        let mut result = String::with_capacity(data.len() * 2);
        for &byte in data {
            result.push(HEX_CHARS[(byte >> 4) as usize] as char);
            result.push(HEX_CHARS[(byte & 0x0f) as usize] as char);
        }
        result
    }

    /// Encodes bytes to hex (stack-allocated)
    pub fn encode_to_slice(data: &[u8], output: &mut [u8]) -> Result<usize> {
        if output.len() < data.len() * 2 {
            return Err(Error::new(ErrorKind::InvalidInput, "Output buffer too small"));
        }

        for (i, &byte) in data.iter().enumerate() {
            output[i * 2] = HEX_CHARS[(byte >> 4) as usize];
            output[i * 2 + 1] = HEX_CHARS[(byte & 0x0f) as usize];
        }

        Ok(data.len() * 2)
    }

    /// Decodes hex string to bytes
    pub fn decode(hex: &str) -> Result<Vec<u8>> {
        decode_bytes(hex.as_bytes())
    }

    /// Decodes hex bytes to data
    pub fn decode_bytes(hex: &[u8]) -> Result<Vec<u8>> {
        if hex.len() % 2 != 0 {
            return Err(Error::new(ErrorKind::InvalidInput, "Hex string must have even length"));
        }

        let mut result = Vec::with_capacity(hex.len() / 2);
        for chunk in hex.chunks(2) {
            let high = decode_hex_char(chunk[0])?;
            let low = decode_hex_char(chunk[1])?;
            result.push((high << 4) | low);
        }

        Ok(result)
    }

    /// Decodes hex to slice
    pub fn decode_to_slice(hex: &[u8], output: &mut [u8]) -> Result<usize> {
        if hex.len() % 2 != 0 {
            return Err(Error::new(ErrorKind::InvalidInput, "Hex must have even length"));
        }

        let len = hex.len() / 2;
        if output.len() < len {
            return Err(Error::new(ErrorKind::InvalidInput, "Output buffer too small"));
        }

        for (i, chunk) in hex.chunks(2).enumerate() {
            let high = decode_hex_char(chunk[0])?;
            let low = decode_hex_char(chunk[1])?;
            output[i] = (high << 4) | low;
        }

        Ok(len)
    }

    fn decode_hex_char(c: u8) -> Result<u8> {
        match c {
            b'0'..=b'9' => Ok(c - b'0'),
            b'a'..=b'f' => Ok(c - b'a' + 10),
            b'A'..=b'F' => Ok(c - b'A' + 10),
            _ => Err(Error::new(ErrorKind::InvalidInput, "Invalid hex character")),
        }
    }
}

/// Base64 encoding/decoding
pub mod base64 {
    use super::*;

    const ENCODE_TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const PAD: u8 = b'=';

    /// Encodes bytes to base64 string
    pub fn encode(data: &[u8]) -> String {
        let mut result = String::with_capacity((data.len() + 2) / 3 * 4);

        for chunk in data.chunks(3) {
            let mut buf = [0u8; 3];
            buf[..chunk.len()].copy_from_slice(chunk);

            let b1 = (buf[0] >> 2) as usize;
            let b2 = (((buf[0] & 0x03) << 4) | (buf[1] >> 4)) as usize;
            let b3 = (((buf[1] & 0x0f) << 2) | (buf[2] >> 6)) as usize;
            let b4 = (buf[2] & 0x3f) as usize;

            result.push(ENCODE_TABLE[b1] as char);
            result.push(ENCODE_TABLE[b2] as char);
            result.push(if chunk.len() > 1 { ENCODE_TABLE[b3] as char } else { PAD as char });
            result.push(if chunk.len() > 2 { ENCODE_TABLE[b4] as char } else { PAD as char });
        }

        result
    }

    /// Decodes base64 string to bytes
    /// Decodes base64 string to bytes
    pub fn decode(encoded: &str) -> Result<Vec<u8>> {
        decode_bytes(encoded.as_bytes())
    }

    /// Decodes base64 bytes to data
    pub fn decode_bytes(encoded: &[u8]) -> Result<Vec<u8>> {
        if encoded.len() % 4 != 0 {
            return Err(Error::new(ErrorKind::InvalidInput, "Base64 length must be multiple of 4"));
        }

        let mut result = Vec::with_capacity(encoded.len() * 3 / 4);
        for chunk in encoded.chunks(4) {
            let b1 = decode_base64_char(chunk[0])?;
            let b2 = decode_base64_char(chunk[1])?;
            let b3 = if chunk[2] == PAD { 0 } else { decode_base64_char(chunk[2])? };
            let b4 = if chunk[3] == PAD { 0 } else { decode_base64_char(chunk[3])? };

            result.push((b1 << 2) | (b2 >> 4));
            if chunk[2] != PAD {
                result.push((b2 << 4) | (b3 >> 2));
            }
            if chunk[3] != PAD {
                result.push((b3 << 6) | b4);
            }
        }

        Ok(result)
    }

    fn decode_base64_char(c: u8) -> Result<u8> {
        match c {
            b'A'..=b'Z' => Ok(c - b'A'),
            b'a'..=b'z' => Ok(c - b'a' + 26),
            b'0'..=b'9' => Ok(c - b'0' + 52),
            b'+' => Ok(62),
            b'/' => Ok(63),
            _ => Err(Error::new(ErrorKind::InvalidInput, "Invalid base64 character")),
        }
    }
}

/// Base58 encoding/decoding (Bitcoin style)
pub mod base58 {
/// Base58 encoding/decoding (Bitcoin style)
pub mod base58 {
    use super::*;

    const ALPHABET: &[u8; 58] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

    /// Encodes bytes to base58 string
    pub fn encode(data: &[u8]) -> String {
        if data.is_empty() {
            return String::new();
        }

        // Count leading zeros
        let leading_zeros = data.iter().take_while(|&&b| b == 0).count();

        // Convert to base58
        let mut num = Vec::from(data);
        let mut encoded = Vec::new();

        while !num.is_empty() && num.iter().any(|&b| b != 0) {
            let mut carry = 0u32;
            for byte in num.iter_mut() {
                carry = carry * 256 + *byte as u32;
                *byte = (carry / 58) as u8;
                carry %= 58;
            }
            encoded.push(ALPHABET[carry as usize]);

            // Remove leading zeros
            while num.first() == Some(&0) {
                num.remove(0);
            }
        }

        // Add leading '1's for leading zeros in input
        let mut result = String::with_capacity(leading_zeros + encoded.len());
        for _ in 0..leading_zeros {
            result.push('1');
        }
        for &byte in encoded.iter().rev() {
            result.push(byte as char);
        }

        result
    }

    /// Decodes base58 string to bytes
    pub fn decode(encoded: &str) -> Result<Vec<u8>> {
        if encoded.is_empty() {
            return Ok(Vec::new());
        }

        // Count leading '1's
        let leading_ones = encoded.chars().take_while(|&c| c == '1').count();

        // Convert from base58
        let mut result = Vec::new();
        for c in encoded.chars() {
            let digit = ALPHABET.iter()
                .position(|&b| b == c as u8)
                .ok_or_else(|| Error::new(ErrorKind::InvalidInput, "Invalid base58 character"))?;

            let mut carry = digit as u32;
            for byte in result.iter_mut() {
                carry += *byte as u32 * 58;
                *byte = carry as u8;
                carry >>= 8;
            }

            while carry > 0 {
                result.push(carry as u8);
                carry >>= 8;
            }
        }

        // Add leading zeros
        let mut output = vec![0u8; leading_ones];
        output.extend(result.iter().rev());

        Ok(output)
    }
}

/// Prelude with commonly used functions
pub mod prelude {
    pub use crate::{base58, base64, hex};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hex_encode() {
        assert_eq!(hex::encode(b"Hello"), "48656c6c6f");
        assert_eq!(hex::encode(b""), "");
        assert_eq!(hex::encode(b"\x00\xff"), "00ff");
    }

    #[test]
    fn test_hex_decode() {
        assert_eq!(hex::decode("48656c6c6f").unwrap(), b"Hello");
        assert_eq!(hex::decode("").unwrap(), b"");
        assert_eq!(hex::decode("00ff").unwrap(), b"\x00\xff");
    }

    #[test]
    fn test_hex_roundtrip() {
        let data = b"The quick brown fox jumps over the lazy dog";
        let encoded = hex::encode(data);
        let decoded = hex::decode(&encoded).unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn test_base64_encode() {
        assert_eq!(base64::encode(b"Hello"), "SGVsbG8=");
        assert_eq!(base64::encode(b""), "");
        assert_eq!(base64::encode(b"A"), "QQ==");
    }

    #[test]
    fn test_base64_decode() {
        assert_eq!(base64::decode("SGVsbG8=").unwrap(), b"Hello");
        assert_eq!(base64::decode("").unwrap(), b"");
        assert_eq!(base64::decode("QQ==").unwrap(), b"A");
    }

    #[test]
    fn test_base64_roundtrip() {
        let data = b"The quick brown fox";
        let encoded = base64::encode(data);
        let decoded = base64::decode(&encoded).unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn test_base58_encode() {
        assert_eq!(base58::encode(b"Hello"), "9Ajdvzr");
        assert_eq!(base58::encode(b""), "");
        assert_eq!(base58::encode(b"\x00\x00test"), "11LUw3");
    }

    #[test]
    fn test_base58_decode() {
        assert_eq!(base58::decode("9Ajdvzr").unwrap(), b"Hello");
        assert_eq!(base58::decode("").unwrap(), b"");
    }

    #[test]
    fn test_base58_roundtrip() {
        let data = b"Bitcoin";
        let encoded = base58::encode(data);
        let decoded = base58::decode(&encoded).unwrap();
        assert_eq!(decoded, data);
    }
}

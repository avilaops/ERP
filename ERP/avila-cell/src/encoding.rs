//! Encoding utilities - Base64, Quoted-Printable, URL encoding

use avila_error::{Error, ErrorKind, Result};

/// Base64 alphabet
const BASE64_ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Encodes bytes to Base64
pub fn base64_encode(input: &[u8]) -> String {
    let mut output = String::new();
    let mut i = 0;

    while i < input.len() {
        let b1 = input[i];
        let b2 = input.get(i + 1).copied().unwrap_or(0);
        let b3 = input.get(i + 2).copied().unwrap_or(0);

        let n = ((b1 as u32) << 16) | ((b2 as u32) << 8) | (b3 as u32);

        output.push(BASE64_ALPHABET[((n >> 18) & 0x3F) as usize] as char);
        output.push(BASE64_ALPHABET[((n >> 12) & 0x3F) as usize] as char);

        if i + 1 < input.len() {
            output.push(BASE64_ALPHABET[((n >> 6) & 0x3F) as usize] as char);
        } else {
            output.push('=');
        }

        if i + 2 < input.len() {
            output.push(BASE64_ALPHABET[(n & 0x3F) as usize] as char);
        } else {
            output.push('=');
        }

        i += 3;
    }

    output
}

/// Decodes Base64 to bytes
pub fn base64_decode(input: &str) -> Result<Vec<u8>> {
    let input = input.trim_end_matches('=');
    let mut output = Vec::new();
    let bytes = input.as_bytes();

    let mut i = 0;
    while i < bytes.len() {
        let c1 = decode_base64_char(bytes[i])?;
        let c2 = bytes.get(i + 1).map(|&b| decode_base64_char(b)).transpose()?.unwrap_or(0);
        let c3 = bytes.get(i + 2).map(|&b| decode_base64_char(b)).transpose()?.unwrap_or(0);
        let c4 = bytes.get(i + 3).map(|&b| decode_base64_char(b)).transpose()?.unwrap_or(0);

        let n = ((c1 as u32) << 18) | ((c2 as u32) << 12) | ((c3 as u32) << 6) | (c4 as u32);

        output.push((n >> 16) as u8);
        if i + 2 < input.len() {
            output.push((n >> 8) as u8);
        }
        if i + 3 < input.len() {
            output.push(n as u8);
        }

        i += 4;
    }

    Ok(output)
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

/// Encodes text to Quoted-Printable
pub fn quoted_printable_encode(input: &str) -> String {
    let mut output = String::new();
    let mut line_len = 0;

    for byte in input.as_bytes() {
        if *byte == b'\n' {
            output.push_str("\r\n");
            line_len = 0;
        } else if *byte == b'\r' {
            // Skip, será adicionado com \n
        } else if (32..=126).contains(byte) && *byte != b'=' {
            output.push(*byte as char);
            line_len += 1;
        } else {
            let encoded = format!("={:02X}", byte);
            output.push_str(&encoded);
            line_len += 3;
        }

        // Soft line break at 76 characters
        if line_len >= 73 {
            output.push_str("=\r\n");
            line_len = 0;
        }
    }

    output
}

/// URL encodes a string
pub fn url_encode(input: &str) -> String {
    let mut output = String::new();

    for byte in input.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                output.push(*byte as char);
            }
            _ => {
                output.push_str(&format!("%{:02X}", byte));
            }
        }
    }

    output
}

/// Generates boundary for multipart messages
pub fn generate_boundary() -> String {
    use avila_time::DateTime;
    let timestamp = DateTime::now().timestamp();
    format!("----=_Part_{}_{}@avila.inc", timestamp, timestamp % 100000)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base64_encode() {
        assert_eq!(base64_encode(b"Hello"), "SGVsbG8=");
        assert_eq!(base64_encode(b"Hello World!"), "SGVsbG8gV29ybGQh");
    }

    #[test]
    fn test_base64_decode() {
        assert_eq!(base64_decode("SGVsbG8=").unwrap(), b"Hello");
        assert_eq!(base64_decode("SGVsbG8gV29ybGQh").unwrap(), b"Hello World!");
    }

    #[test]
    fn test_quoted_printable() {
        let encoded = quoted_printable_encode("Hello\nWorld!");
        assert!(encoded.contains("Hello"));
        assert!(encoded.contains("World"));
    }

    #[test]
    fn test_url_encode() {
        assert_eq!(url_encode("hello world"), "hello%20world");
        assert_eq!(url_encode("test@example.com"), "test%40example.com");
    }
}

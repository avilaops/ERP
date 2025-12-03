//! Operações bitwise e manipulação de bits
//!
//! Operações de baixo nível para manipulação direta de bits

/// Extrai byte específico de u64
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::extract_byte;
///
/// let x = 0x0123456789ABCDEF;
/// assert_eq!(extract_byte(x, 0), 0xEF);
/// assert_eq!(extract_byte(x, 7), 0x01);
/// ```
#[inline(always)]
pub const fn extract_byte(x: u64, byte_idx: usize) -> u8 {
    (x >> (byte_idx * 8)) as u8
}

/// Injeta byte em posição específica de u64
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::inject_byte;
///
/// let x = inject_byte(0, 0xFF, 0);
/// assert_eq!(x, 0xFF);
///
/// let x = inject_byte(0, 0xFF, 7);
/// assert_eq!(x, 0xFF00000000000000);
/// ```
#[inline(always)]
pub const fn inject_byte(x: u64, byte: u8, byte_idx: usize) -> u64 {
    let mask = !(0xFFu64 << (byte_idx * 8));
    let value = (byte as u64) << (byte_idx * 8);
    (x & mask) | value
}

/// Byte swap (endianness conversion)
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::bswap;
///
/// let x = 0x0123456789ABCDEF;
/// assert_eq!(bswap(x), 0xEFCDAB8967452301);
/// ```
#[inline(always)]
pub const fn bswap(x: u64) -> u64 {
    x.swap_bytes()
}

/// Reverse bits em u64
///
/// # Exemplos
///
/// ```
/// use avila_nucleus::bits::reverse_bits;
///
/// assert_eq!(reverse_bits(0b1000), 0b0001000000000000000000000000000000000000000000000000000000000000);
/// ```
#[inline(always)]
pub const fn reverse_bits(x: u64) -> u64 {
    x.reverse_bits()
}

/// Parallel bit deposit (PDEP simulation)
///
/// Deposita bits de source nas posições marcadas em mask
#[inline(always)]
pub const fn pdep(source: u64, mut mask: u64) -> u64 {
    let mut result = 0u64;
    let mut src = source;
    let mut bit_pos = 0u32;

    while mask != 0 {
        if (mask & 1) != 0 {
            result |= (src & 1) << bit_pos;
            src >>= 1;
        }
        mask >>= 1;
        bit_pos += 1;
    }

    result
}

/// Parallel bit extract (PEXT simulation)
///
/// Extrai bits das posições marcadas em mask e compacta
#[inline(always)]
pub const fn pext(source: u64, mut mask: u64) -> u64 {
    let mut result = 0u64;
    let mut src = source;
    let mut result_pos = 0u32;
    let mut bit_pos = 0u32;

    while mask != 0 {
        if (mask & 1) != 0 {
            result |= ((src >> bit_pos) & 1) << result_pos;
            result_pos += 1;
        }
        mask >>= 1;
        bit_pos += 1;
    }

    result
}

/// Gray code para binário
#[inline(always)]
pub const fn gray_to_binary(gray: u64) -> u64 {
    let mut binary = gray;
    let mut shift = 32;

    while shift > 0 {
        binary ^= binary >> shift;
        shift >>= 1;
    }

    binary
}

/// Binário para Gray code
#[inline(always)]
pub const fn binary_to_gray(binary: u64) -> u64 {
    binary ^ (binary >> 1)
}

/// Morton encode (Z-order curve): entrelaça 2 valores 32-bit
///
/// Usado para space-filling curves em indexação espacial
#[inline(always)]
pub const fn morton_encode(x: u32, y: u32) -> u64 {
    let mut result = 0u64;
    let mut i = 0;

    while i < 32 {
        result |= ((x as u64 >> i) & 1) << (2 * i);
        result |= ((y as u64 >> i) & 1) << (2 * i + 1);
        i += 1;
    }

    result
}

/// Morton decode: desembaralha coordenadas
#[inline(always)]
pub const fn morton_decode(morton: u64) -> (u32, u32) {
    let mut x = 0u32;
    let mut y = 0u32;
    let mut i = 0;

    while i < 32 {
        x |= ((morton >> (2 * i)) & 1) as u32 << i;
        y |= ((morton >> (2 * i + 1)) & 1) as u32 << i;
        i += 1;
    }

    (x, y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_byte() {
        let x = 0x0123456789ABCDEF;
        assert_eq!(extract_byte(x, 0), 0xEF);
        assert_eq!(extract_byte(x, 1), 0xCD);
        assert_eq!(extract_byte(x, 7), 0x01);
    }

    #[test]
    fn test_inject_byte() {
        let x = inject_byte(0, 0xFF, 0);
        assert_eq!(x, 0xFF);

        let x = inject_byte(0, 0xFF, 7);
        assert_eq!(x, 0xFF00000000000000);
    }

    #[test]
    fn test_bswap() {
        let x = 0x0123456789ABCDEF;
        let swapped = bswap(x);
        assert_eq!(swapped, 0xEFCDAB8967452301);
        assert_eq!(bswap(swapped), x); // Double swap returns original
    }

    #[test]
    fn test_gray_code() {
        for i in 0..100 {
            let gray = binary_to_gray(i);
            let binary = gray_to_binary(gray);
            assert_eq!(binary, i);
        }
    }

    #[test]
    fn test_morton() {
        let (x, y) = (12345, 67890);
        let morton = morton_encode(x, y);
        let (x2, y2) = morton_decode(morton);
        assert_eq!(x, x2);
        assert_eq!(y, y2);
    }
}

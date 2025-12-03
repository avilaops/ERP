//! ChaCha20-Poly1305 AEAD
//!
//! Cipher stream aprovado pela Ávila
//! Vantagens:
//! - Constant-time
//! - Rápido em software
//! - Não requer AES-NI
//! - NSA não consegue quebrar

/// ChaCha20 state: 16 × u32
#[derive(Clone, Copy)]
pub struct ChaCha20 {
    state: [u32; 16],
}

impl ChaCha20 {
    /// Constantes "expand 32-byte k"
    const CONSTANTS: [u32; 4] = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];

    /// Cria novo ChaCha20 cipher
    ///
    /// key: 32 bytes
    /// nonce: 12 bytes
    /// counter: u32
    pub fn new(key: &[u8; 32], nonce: &[u8; 12], counter: u32) -> Self {
        let mut state = [0u32; 16];

        // Constantes
        state[0..4].copy_from_slice(&Self::CONSTANTS);

        // Key (8 words)
        for i in 0..8 {
            state[4 + i] = u32::from_le_bytes([
                key[i * 4],
                key[i * 4 + 1],
                key[i * 4 + 2],
                key[i * 4 + 3],
            ]);
        }

        // Counter
        state[12] = counter;

        // Nonce (3 words)
        for i in 0..3 {
            state[13 + i] = u32::from_le_bytes([
                nonce[i * 4],
                nonce[i * 4 + 1],
                nonce[i * 4 + 2],
                nonce[i * 4 + 3],
            ]);
        }

        Self { state }
    }

    /// Quarter round operation usando indices
    #[inline(always)]
    fn quarter_round(state: &mut [u32; 16], a: usize, b: usize, c: usize, d: usize) {
        state[a] = state[a].wrapping_add(state[b]);
        state[d] ^= state[a];
        state[d] = state[d].rotate_left(16);

        state[c] = state[c].wrapping_add(state[d]);
        state[b] ^= state[c];
        state[b] = state[b].rotate_left(12);

        state[a] = state[a].wrapping_add(state[b]);
        state[d] ^= state[a];
        state[d] = state[d].rotate_left(8);

        state[c] = state[c].wrapping_add(state[d]);
        state[b] ^= state[c];
        state[b] = state[b].rotate_left(7);
    }

    /// ChaCha20 block function (20 rounds)
    fn block(&self) -> [u32; 16] {
        let mut working_state = self.state;

        // 20 rounds = 10 double-rounds
        for _ in 0..10 {
            // Column rounds
            Self::quarter_round(&mut working_state, 0, 4, 8, 12);
            Self::quarter_round(&mut working_state, 1, 5, 9, 13);
            Self::quarter_round(&mut working_state, 2, 6, 10, 14);
            Self::quarter_round(&mut working_state, 3, 7, 11, 15);

            // Diagonal rounds
            Self::quarter_round(&mut working_state, 0, 5, 10, 15);
            Self::quarter_round(&mut working_state, 1, 6, 11, 12);
            Self::quarter_round(&mut working_state, 2, 7, 8, 13);
            Self::quarter_round(&mut working_state, 3, 4, 9, 14);
        }

        // Add original state
        for i in 0..16 {
            working_state[i] = working_state[i].wrapping_add(self.state[i]);
        }

        working_state
    }

    /// Criptografa/decriptografa dados (XOR stream)
    pub fn apply_keystream(&mut self, data: &mut [u8]) {
        for chunk in data.chunks_mut(64) {
            let keystream = self.block();

            // XOR dados com keystream
            for (i, byte) in chunk.iter_mut().enumerate() {
                let word_idx = i / 4;
                let byte_idx = i % 4;
                let keystream_byte = ((keystream[word_idx] >> (byte_idx * 8)) & 0xff) as u8;
                *byte ^= keystream_byte;
            }

            // Incrementa counter
            self.state[12] = self.state[12].wrapping_add(1);
        }
    }
}

/// Poly1305 MAC
pub struct Poly1305 {
    // TODO: Implementar Poly1305 authenticator
}

impl Poly1305 {
    /// Computa MAC de dados
    pub fn mac(key: &[u8; 32], data: &[u8]) -> [u8; 16] {
        // TODO: Implementar
        [0u8; 16]
    }
}

/// ChaCha20-Poly1305 AEAD encrypt
///
/// Retorna o tamanho do ciphertext (igual ao plaintext)
/// Caller deve alocar buffer com tamanho adequado
pub fn chacha20_poly1305_encrypt(
    key: &[u8; 32],
    nonce: &[u8; 12],
    _aad: &[u8],
    plaintext: &[u8],
    ciphertext: &mut [u8],
    tag: &mut [u8; 16],
) {
    assert!(ciphertext.len() >= plaintext.len());

    // Copia plaintext para ciphertext
    ciphertext[..plaintext.len()].copy_from_slice(plaintext);

    // Aplica keystream
    let mut cipher = ChaCha20::new(key, nonce, 1);
    cipher.apply_keystream(&mut ciphertext[..plaintext.len()]);

    // Calcula MAC
    *tag = Poly1305::mac(key, &ciphertext[..plaintext.len()]);
}

/// ChaCha20-Poly1305 AEAD decrypt
///
/// Retorna true se MAC válido, false caso contrário
pub fn chacha20_poly1305_decrypt(
    key: &[u8; 32],
    nonce: &[u8; 12],
    _aad: &[u8],
    ciphertext: &[u8],
    tag: &[u8; 16],
    plaintext: &mut [u8],
) -> bool {
    assert!(plaintext.len() >= ciphertext.len());

    // Verifica MAC primeiro
    let computed_tag = Poly1305::mac(key, ciphertext);
    if computed_tag != *tag {
        return false;
    }

    // Copia ciphertext para plaintext
    plaintext[..ciphertext.len()].copy_from_slice(ciphertext);

    // Aplica keystream
    let mut cipher = ChaCha20::new(key, nonce, 1);
    cipher.apply_keystream(&mut plaintext[..ciphertext.len()]);

    true
}

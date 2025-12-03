//! Camada criptográfica do QUIC (TLS 1.3 integration)

use avila_crypto::cipher::chacha20::ChaCha20;
use alloc::vec::Vec;

/// Nível de encryption no QUIC
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EncryptionLevel {
    /// Initial (sem criptografia forte)
    Initial,
    /// 0-RTT (early data)
    ZeroRtt,
    /// Handshake (negociando chaves)
    Handshake,
    /// Application (dados da aplicação)
    Application,
}

/// Chaves para criptografia/descriptografia
pub struct CryptoKeys {
    /// Chave de envio
    pub send_key: [u8; 32],
    /// IV de envio
    pub send_iv: [u8; 12],
    /// Chave de recebimento
    pub recv_key: [u8; 32],
    /// IV de recebimento
    pub recv_iv: [u8; 12],
}

impl CryptoKeys {
    /// Gera chaves do handshake TLS
    pub fn from_handshake(secret: &[u8; 32]) -> Self {
        // HKDF-Expand-Label para derivar chaves
        // TODO: Implementar HKDF completo
        Self {
            send_key: *secret,
            send_iv: [0u8; 12],
            recv_key: *secret,
            recv_iv: [0u8; 12],
        }
    }

    /// Criptografa payload
    pub fn encrypt(&self, packet_number: u64, aad: &[u8], plaintext: &[u8]) -> Vec<u8> {
        // Constrói nonce: IV XOR packet_number
        let mut nonce = self.send_iv;
        let pn_bytes = packet_number.to_be_bytes();
        for i in 0..8 {
            nonce[4 + i] ^= pn_bytes[i];
        }

        // ChaCha20-Poly1305 encryption
        let mut ciphertext = plaintext.to_vec();
        let mut cipher = ChaCha20::new(&self.send_key, &nonce, 1);
        cipher.apply_keystream(&mut ciphertext);

        // TODO: Adicionar Poly1305 tag
        ciphertext
    }

    /// Descriptografa payload
    pub fn decrypt(&self, packet_number: u64, aad: &[u8], ciphertext: &[u8]) -> Option<Vec<u8>> {
        let mut nonce = self.recv_iv;
        let pn_bytes = packet_number.to_be_bytes();
        for i in 0..8 {
            nonce[4 + i] ^= pn_bytes[i];
        }

        // TODO: Verificar Poly1305 tag primeiro

        let mut plaintext = ciphertext.to_vec();
        let mut cipher = ChaCha20::new(&self.recv_key, &nonce, 1);
        cipher.apply_keystream(&mut plaintext);

        Some(plaintext)
    }
}

/// Gerenciador de criptografia por nível
pub struct CryptoContext {
    /// Chaves para cada nível
    pub keys: [Option<CryptoKeys>; 4],
}

impl CryptoContext {
    /// Cria novo contexto criptográfico
    pub fn new() -> Self {
        Self {
            keys: [None, None, None, None],
        }
    }

    /// Define chaves para um nível
    pub fn set_keys(&mut self, level: EncryptionLevel, keys: CryptoKeys) {
        let idx = level as usize;
        self.keys[idx] = Some(keys);
    }

    /// Obtém chaves para um nível
    pub fn get_keys(&self, level: EncryptionLevel) -> Option<&CryptoKeys> {
        self.keys[level as usize].as_ref()
    }

    /// Criptografa packet
    pub fn encrypt_packet(
        &self,
        level: EncryptionLevel,
        packet_number: u64,
        header: &[u8],
        payload: &[u8],
    ) -> Option<Vec<u8>> {
        let keys = self.get_keys(level)?;
        let ciphertext = keys.encrypt(packet_number, header, payload);
        Some(ciphertext)
    }

    /// Descriptografa packet
    pub fn decrypt_packet(
        &self,
        level: EncryptionLevel,
        packet_number: u64,
        header: &[u8],
        ciphertext: &[u8],
    ) -> Option<Vec<u8>> {
        let keys = self.get_keys(level)?;
        keys.decrypt(packet_number, header, ciphertext)
    }
}

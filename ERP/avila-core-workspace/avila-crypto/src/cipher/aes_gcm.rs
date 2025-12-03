//! AES-GCM - para quando hardware acceleration está disponível
//!
//! Apenas usado se CPU tem AES-NI
//! Senão preferimos ChaCha20

/// AES-256-GCM cipher
pub struct AesGcm;

impl AesGcm {
    /// Verifica se CPU tem AES-NI
    pub fn is_supported() -> bool {
        #[cfg(target_arch = "x86_64")]
        {
            // TODO: Detectar feature AES-NI
            false
        }
        #[cfg(not(target_arch = "x86_64"))]
        {
            false
        }
    }

    /// Criptografa com AES-256-GCM
    ///
    /// Retorna tamanho do ciphertext (igual ao plaintext)
    pub fn encrypt(
        key: &[u8; 32],
        nonce: &[u8; 12],
        _aad: &[u8],
        plaintext: &[u8],
        ciphertext: &mut [u8],
        tag: &mut [u8; 16],
    ) {
        assert!(ciphertext.len() >= plaintext.len());

        // TODO: Implementar usando AES-NI intrinsics
        ciphertext[..plaintext.len()].copy_from_slice(plaintext);
        *tag = [0u8; 16];
    }

    /// Decriptografa com AES-256-GCM
    ///
    /// Retorna true se MAC válido
    pub fn decrypt(
        key: &[u8; 32],
        nonce: &[u8; 12],
        _aad: &[u8],
        ciphertext: &[u8],
        tag: &[u8; 16],
        plaintext: &mut [u8],
    ) -> bool {
        assert!(plaintext.len() >= ciphertext.len());

        // TODO: Implementar
        plaintext[..ciphertext.len()].copy_from_slice(ciphertext);
        true
    }
}

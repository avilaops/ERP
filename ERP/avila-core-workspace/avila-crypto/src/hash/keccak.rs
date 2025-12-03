//! Keccak-256 - Hash do Ethereum
//!
//! SHA-3 finalist, escolhido pelo Ethereum
//! Diferente do SHA-3 oficial (padding diferente)

/// Keccak-256 hasher
pub struct Keccak256;

impl Keccak256 {
    /// Rate: 1088 bits = 136 bytes
    pub const RATE: usize = 136;

    /// Capacity: 512 bits
    pub const CAPACITY: usize = 64;

    /// State size: 1600 bits = 200 bytes = 25 × u64
    pub const STATE_SIZE: usize = 25;

    /// Output: 256 bits = 32 bytes
    pub const OUTPUT_SIZE: usize = 32;

    /// Hash de dados
    pub fn hash(data: &[u8]) -> [u8; 32] {
        let mut state = [0u64; Self::STATE_SIZE];

        // Absorb phase
        Self::absorb(&mut state, data);

        // Squeeze phase
        Self::squeeze(&state)
    }

    /// Absorb data into state
    fn absorb(state: &mut [u64; 25], data: &[u8]) {
        // Processa blocos de RATE bytes
        for chunk in data.chunks(Self::RATE) {
            // XOR chunk no state
            for (i, byte_chunk) in chunk.chunks(8).enumerate() {
                let mut word = 0u64;
                for (j, &byte) in byte_chunk.iter().enumerate() {
                    word |= (byte as u64) << (j * 8);
                }
                state[i] ^= word;
            }

            // Keccak-f[1600] permutation
            Self::keccak_f(state);
        }
    }

    /// Squeeze output from state
    fn squeeze(state: &[u64; 25]) -> [u8; 32] {
        let mut output = [0u8; 32];
        for i in 0..4 {
            let word = state[i].to_le_bytes();
            output[i * 8..(i + 1) * 8].copy_from_slice(&word);
        }
        output
    }

    /// Keccak-f[1600] permutation (24 rounds)
    fn keccak_f(state: &mut [u64; 25]) {
        // TODO: Implementar 24 rounds de permutação
        // Cada round:
        // - θ (theta): XOR mixing
        // - ρ (rho): rotações
        // - π (pi): permutação de posições
        // - χ (chi): non-linear mixing
        // - ι (iota): adiciona constante de round
    }
}

/// Endereço Ethereum: últimos 20 bytes do Keccak-256(pubkey)
pub fn ethereum_address(pubkey: &[u8; 64]) -> [u8; 20] {
    let hash = Keccak256::hash(pubkey);
    let mut address = [0u8; 20];
    address.copy_from_slice(&hash[12..32]);
    address
}

//! BLAKE3 - O Hash do Futuro
//!
//! **Por que BLAKE3 é superior a SHA-256:**
//! 1. ✅ 4x mais rápido que SHA-256 (single-threaded)
//! 2. ✅ Paralelizável (múltiplos cores = ainda mais rápido)
//! 3. ✅ Segurança de 256 bits (mesmo nível)
//! 4. ✅ Árvore Merkle nativa (verificação de chunks)
//! 5. ✅ Design transparente (sem magic numbers)
//! 6. ❌ Não é aprovado pelo NIST (ótimo sinal!)
//!
//! ## Algoritmo BLAKE3
//!
//! BLAKE3 usa uma árvore Merkle de chunks de 1KB:
//! ```text
//!         Root
//!        /    \
//!     CV_0    CV_1
//!    /  \    /  \
//!  C0  C1  C2  C3  (chunks de 1KB)
//! ```
//!
//! Cada chunk é processado em blocos de 64 bytes usando
//! a função de compressão baseada no ChaCha stream cipher.

use crate::hash::CryptographicHash;

/// BLAKE3 hasher com estado interno
pub struct Blake3 {
    cv_stack: [[u32; 8]; 54], // Stack de chaining values (log2(2^64/1024))
    cv_stack_len: usize,
    key: [u32; 8],
    chunk_state: ChunkState,
    flags: u32,
}

/// Estado de processamento de um chunk (1024 bytes)
struct ChunkState {
    cv: [u32; 8],           // Chaining value
    chunk_counter: u64,
    block: [u8; 64],        // Buffer do bloco atual
    block_len: u8,
    blocks_compressed: u8,  // Número de blocos já comprimidos neste chunk
    flags: u32,
}

// Constantes BLAKE3 (SHA-256 IV)
const IV: [u32; 8] = [
    0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
    0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19,
];

// Flags para a compression function
const CHUNK_START: u32 = 1 << 0;
const CHUNK_END: u32 = 1 << 1;
const PARENT: u32 = 1 << 2;
const ROOT: u32 = 1 << 3;

const BLOCK_LEN: usize = 64;
const CHUNK_LEN: usize = 1024;

// Permutação única do BLAKE3 (aplicada entre cada round)
const MSG_PERMUTATION: [usize; 16] = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];

impl Blake3 {
    /// Cria novo hasher BLAKE3
    pub fn new() -> Self {
        Self::new_keyed(&IV)
    }

    /// Cria hasher com chave customizada (para MAC)
    pub fn new_keyed(key: &[u32; 8]) -> Self {
        Self {
            cv_stack: [[0u32; 8]; 54],
            cv_stack_len: 0,
            key: *key,
            chunk_state: ChunkState::new(key, 0, 0),
            flags: 0,
        }
    }

    /// Processa dados incrementalmente
    pub fn update(&mut self, mut data: &[u8]) {
        while !data.is_empty() {
            // Se chunk atual está completo, finaliza ele
            if self.chunk_state.len() == CHUNK_LEN {
                let chunk_cv = self.chunk_state.output();
                let total_chunks = self.chunk_state.chunk_counter + 1;
                self.add_chunk_cv(&chunk_cv, total_chunks);
                self.chunk_state = ChunkState::new(&self.key, total_chunks, self.flags);
            }

            // Processa o que couber no chunk atual
            let want = CHUNK_LEN - self.chunk_state.len();
            let take = core::cmp::min(want, data.len());
            self.chunk_state.update(&data[..take]);
            data = &data[take..];
        }
    }

    /// Finaliza e retorna hash
    pub fn finalize(&self) -> [u8; 32] {
        let mut output = [0u8; 32];
        self.finalize_into(&mut output);
        output
    }

    fn finalize_into(&self, output_bytes: &mut [u8]) {
        // Caso especial: se stack vazia, este chunk é a raiz
        if self.cv_stack_len == 0 {
            let cv = self.chunk_state.output();
            let output = Output {
                cv,
                block: self.chunk_state.block,
                counter: self.chunk_state.chunk_counter,
                block_len: self.chunk_state.block_len,
                flags: self.chunk_state.output_flags(),
            };
            let hash = output.root_hash();
            output_bytes.copy_from_slice(&hash);
            return;
        }

        // Com stack não-vazia, fazemos merge bottom-up
        let chunk_cv = self.chunk_state.output();
        let mut output = Output {
            cv: chunk_cv,
            block: self.chunk_state.block,
            counter: self.chunk_state.chunk_counter,
            block_len: self.chunk_state.block_len,
            flags: self.chunk_state.output_flags(),
        };

        // Merge com cv_stack de trás pra frente
        let mut i = self.cv_stack_len;
        while i > 0 {
            i -= 1;
            let cv = output.chaining_value();
            output = parent_output(&self.cv_stack[i], &cv, self.key, self.flags);
        }

        // Agora output é o Output do root node, aplicamos ROOT flag
        let hash = output.root_hash();
        output_bytes.copy_from_slice(&hash);
    }

    fn add_chunk_cv(&mut self, cv: &[u32; 8], total_chunks: u64) {
        // Adiciona CV ao stack, fazendo merge quando necessário
        // Similar a incrementar um contador binário
        let mut cv = *cv;
        let mut total_chunks = total_chunks;

        while total_chunks & 1 == 0 {
            // Merge com CV anterior no stack
            let parent_cv = self.cv_stack[self.cv_stack_len - 1];
            self.cv_stack_len -= 1;
            let output = parent_output(&parent_cv, &cv, self.key, self.flags);
            cv = output.chaining_value();
            total_chunks >>= 1;
        }

        self.cv_stack[self.cv_stack_len] = cv;
        self.cv_stack_len += 1;
    }
}

impl ChunkState {
    fn new(key: &[u32; 8], chunk_counter: u64, flags: u32) -> Self {
        Self {
            cv: *key,
            chunk_counter,
            block: [0u8; 64],
            block_len: 0,
            blocks_compressed: 0,
            flags,
        }
    }

    fn len(&self) -> usize {
        BLOCK_LEN * self.blocks_compressed as usize + self.block_len as usize
    }

    fn update(&mut self, mut data: &[u8]) {
        while !data.is_empty() {
            // Preenche bloco atual
            let want = BLOCK_LEN - self.block_len as usize;
            let take = core::cmp::min(want, data.len());
            self.block[self.block_len as usize..][..take].copy_from_slice(&data[..take]);
            self.block_len += take as u8;
            data = &data[take..];

            // Comprime bloco cheio
            if self.block_len == BLOCK_LEN as u8 {
                let mut block_flags = self.flags;
                if self.blocks_compressed == 0 {
                    block_flags |= CHUNK_START;
                }

                let output = compress(&self.cv, &self.block, self.chunk_counter, BLOCK_LEN as u8, block_flags);
                // Pega primeiros 8 words como novo CV
                self.cv.copy_from_slice(&output[..8]);

                self.block = [0u8; 64];
                self.block_len = 0;
                self.blocks_compressed += 1;
            }
        }
    }

    /// Retorna o CV atual (sem fazer compress final)
    fn output(&self) -> [u32; 8] {
        self.cv
    }

    /// Retorna as flags corretas para o output
    fn output_flags(&self) -> u32 {
        let mut flags = self.flags | CHUNK_END;
        if self.blocks_compressed == 0 {
            flags |= CHUNK_START;
        }
        flags
    }
}

/// Função g do ChaCha (mistura 4 words)
#[inline(always)]
fn g(state: &mut [u32; 16], a: usize, b: usize, c: usize, d: usize, mx: u32, my: u32) {
    state[a] = state[a].wrapping_add(state[b]).wrapping_add(mx);
    state[d] = (state[d] ^ state[a]).rotate_right(16);
    state[c] = state[c].wrapping_add(state[d]);
    state[b] = (state[b] ^ state[c]).rotate_right(12);
    state[a] = state[a].wrapping_add(state[b]).wrapping_add(my);
    state[d] = (state[d] ^ state[a]).rotate_right(8);
    state[c] = state[c].wrapping_add(state[d]);
    state[b] = (state[b] ^ state[c]).rotate_right(7);
}

/// Round function (aplica g 8 vezes)
#[inline(always)]
fn round(state: &mut [u32; 16], msg: &[u32; 16]) {
    // Column step
    g(state, 0, 4, 8, 12, msg[0], msg[1]);
    g(state, 1, 5, 9, 13, msg[2], msg[3]);
    g(state, 2, 6, 10, 14, msg[4], msg[5]);
    g(state, 3, 7, 11, 15, msg[6], msg[7]);

    // Diagonal step
    g(state, 0, 5, 10, 15, msg[8], msg[9]);
    g(state, 1, 6, 11, 12, msg[10], msg[11]);
    g(state, 2, 7, 8, 13, msg[12], msg[13]);
    g(state, 3, 4, 9, 14, msg[14], msg[15]);
}

/// Permuta a mensagem para o próximo round
#[inline(always)]
fn permute(msg: &mut [u32; 16]) {
    let mut permuted = [0u32; 16];
    for i in 0..16 {
        permuted[i] = msg[MSG_PERMUTATION[i]];
    }
    *msg = permuted;
}

/// BLAKE3 compression function (coração do algoritmo)
fn compress(cv: &[u32; 8], block: &[u8; 64], counter: u64, block_len: u8, flags: u32) -> [u32; 16] {
    // Converte bloco de bytes para u32 (little-endian)
    let mut msg = [0u32; 16];
    for i in 0..16 {
        msg[i] = u32::from_le_bytes([
            block[i * 4],
            block[i * 4 + 1],
            block[i * 4 + 2],
            block[i * 4 + 3],
        ]);
    }

    // Estado inicial (16 words)
    let mut state = [0u32; 16];
    state[0..8].copy_from_slice(cv);
    state[8..12].copy_from_slice(&IV[0..4]);
    state[12] = counter as u32;
    state[13] = (counter >> 32) as u32;
    state[14] = block_len as u32;
    state[15] = flags;

    // 7 rounds com permutação da mensagem entre eles
    round(&mut state, &msg); // round 1
    permute(&mut msg);
    round(&mut state, &msg); // round 2
    permute(&mut msg);
    round(&mut state, &msg); // round 3
    permute(&mut msg);
    round(&mut state, &msg); // round 4
    permute(&mut msg);
    round(&mut state, &msg); // round 5
    permute(&mut msg);
    round(&mut state, &msg); // round 6
    permute(&mut msg);
    round(&mut state, &msg); // round 7

    // XOR com chaining value para difusão final
    // h'[0..7] = h[0..7] XOR h[8..15]
    // h'[8..15] = h[8..15] XOR cv[0..7]
    for i in 0..8 {
        state[i] ^= state[i + 8];
        state[i + 8] ^= cv[i];
    }

    state
}

/// Output intermediário (antes de aplicar ROOT flag)
#[derive(Clone)]
struct Output {
    cv: [u32; 8],
    block: [u8; BLOCK_LEN],
    counter: u64,
    block_len: u8,
    flags: u32,
}

impl Output {
    fn chaining_value(&self) -> [u32; 8] {
        let output = compress(&self.cv, &self.block, self.counter, self.block_len, self.flags);
        let mut result = [0u32; 8];
        result.copy_from_slice(&output[..8]);
        result
    }

    fn root_hash(&self) -> [u8; 32] {
        let output = compress(&self.cv, &self.block, self.counter, self.block_len, self.flags | ROOT);
        let mut result = [0u8; 32];
        for (i, &word) in output[..8].iter().enumerate() {
            result[i * 4..(i + 1) * 4].copy_from_slice(&word.to_le_bytes());
        }
        result
    }
}

/// Combina dois chaining values (parent node)
fn parent_output(left_cv: &[u32; 8], right_cv: &[u32; 8], key: [u32; 8], flags: u32) -> Output {
    let mut block = [0u8; 64];

    // Left CV (32 bytes)
    for (i, &word) in left_cv.iter().enumerate() {
        let bytes = word.to_le_bytes();
        block[i * 4..(i + 1) * 4].copy_from_slice(&bytes);
    }

    // Right CV (32 bytes)
    for (i, &word) in right_cv.iter().enumerate() {
        let bytes = word.to_le_bytes();
        block[32 + i * 4..32 + (i + 1) * 4].copy_from_slice(&bytes);
    }

    Output {
        cv: key,
        block,
        counter: 0,
        block_len: BLOCK_LEN as u8,
        flags: flags | PARENT,
    }
}

/// Interface simples: hash de dados completos
pub struct Blake3Hasher;

impl CryptographicHash for Blake3Hasher {
    const OUTPUT_SIZE: usize = 32;

    fn hash(data: &[u8]) -> alloc::vec::Vec<u8> {
        let mut hasher = Blake3::new();
        hasher.update(data);
        hasher.finalize().to_vec()
    }

    fn hash_multi(inputs: &[&[u8]]) -> alloc::vec::Vec<u8> {
        let mut hasher = Blake3::new();
        for input in inputs {
            hasher.update(input);
        }
        hasher.finalize().to_vec()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blake3_empty() {
        // Hash de string vazia (test vector do BLAKE3)
        let hash = Blake3Hasher::hash(b"");
        assert_eq!(hash.len(), 32);

        // Valor esperado para hash("")
        let expected = [
            0xaf, 0x13, 0x49, 0xb9, 0xf5, 0xf9, 0xa1, 0xa6,
            0xa0, 0x40, 0x4d, 0xea, 0x36, 0xdc, 0xc9, 0x49,
            0x9b, 0xcb, 0x25, 0xc9, 0xad, 0xc1, 0x12, 0xb7,
            0xcc, 0x9a, 0x93, 0xca, 0xe4, 0x1f, 0x32, 0x62,
        ];
        
        // Debug: vamos testar o vetor IV e compress básico
        let mut hasher = Blake3::new();
        hasher.update(b"");
        let result = hasher.finalize();
        
        assert_eq!(&result[..], &expected[..], "Empty hash mismatch");
    }

    #[test]
    fn test_blake3_hello() {
        let hash = Blake3Hasher::hash(b"hello world");
        assert_eq!(hash.len(), 32);

        // BLAKE3("hello world")
        let expected = [
            0xd7, 0x4e, 0x1f, 0xa1, 0xd3, 0x35, 0x99, 0xe1,
            0xc7, 0xf6, 0xd9, 0xc3, 0x00, 0xd3, 0xfe, 0x1f,
            0x3c, 0x49, 0x0b, 0xdb, 0xc5, 0x36, 0x8c, 0x7e,
            0x98, 0xc1, 0x8d, 0x7e, 0x65, 0x1b, 0x3f, 0x0c,
        ];
        assert_eq!(&hash[..], &expected[..], "Hello world hash mismatch");
    }

    #[test]
    fn test_blake3_incremental() {
        // Hash incremental deve dar mesmo resultado
        let mut hasher = Blake3::new();
        hasher.update(b"hello ");
        hasher.update(b"world");
        let hash1 = hasher.finalize();

        let hash2 = Blake3Hasher::hash(b"hello world");

        assert_eq!(hash1.to_vec(), hash2);
    }

    #[test]
    fn test_blake3_long() {
        // Testa com dados > 1 chunk (1024 bytes)
        let data = [0x42u8; 2048];
        let hash = Blake3Hasher::hash(&data);
        assert_eq!(hash.len(), 32);
    }
}

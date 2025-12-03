//! Detecção de instruções SIMD disponíveis.

/// Representa o melhor caminho de execução disponível para operações vetoriais.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionPath {
    Portable,
    Avx2,
    Avx512,
}

/// Conjunto de flags de recursos SIMD.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CpuFeatures {
    pub avx2: bool,
    pub avx512f: bool,
    pub avx512bw: bool,
    pub bmi2: bool,
    pub adx: bool,
}

impl CpuFeatures {
    /// Detecção em runtime (quando `std` está disponível) ou baseada em `cfg` caso contrário.
    #[inline]
    pub fn detect() -> Self {
        #[cfg(all(feature = "std", target_arch = "x86_64"))]
        {
            Self {
                avx2: std::arch::is_x86_feature_detected!("avx2"),
                avx512f: std::arch::is_x86_feature_detected!("avx512f"),
                avx512bw: std::arch::is_x86_feature_detected!("avx512bw"),
                bmi2: std::arch::is_x86_feature_detected!("bmi2"),
                adx: std::arch::is_x86_feature_detected!("adx"),
            }
        }

        #[cfg(not(all(feature = "std", target_arch = "x86_64")))]
        {
            Self::compile_time()
        }
    }

    /// Detecção apenas com base em `cfg(target_feature)`.
    #[inline]
    pub const fn compile_time() -> Self {
        Self {
            avx2: cfg!(target_feature = "avx2"),
            avx512f: cfg!(target_feature = "avx512f"),
            avx512bw: cfg!(target_feature = "avx512bw"),
            bmi2: cfg!(target_feature = "bmi2"),
            adx: cfg!(target_feature = "adx"),
        }
    }

    /// Escolhe o melhor caminho de execução.
    #[inline]
    pub const fn best_path(&self) -> ExecutionPath {
        if self.avx512f && self.avx512bw {
            ExecutionPath::Avx512
        } else if self.avx2 {
            ExecutionPath::Avx2
        } else {
            ExecutionPath::Portable
        }
    }
}

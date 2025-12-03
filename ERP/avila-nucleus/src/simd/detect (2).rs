//! CPU feature detection em runtime
//!
//! Detecta capacidades SIMD da CPU para dispatch otimizado

/// Características da CPU detectadas
#[derive(Debug, Clone, Copy)]
pub struct CpuFeatures {
    /// AVX2 disponível
    pub avx2: bool,
    /// AVX-512 Foundation disponível
    pub avx512f: bool,
    /// AVX-512 Byte/Word disponível
    pub avx512bw: bool,
    /// BMI2 (Bit Manipulation Instructions 2)
    pub bmi2: bool,
    /// ADX (Multi-Precision Add-Carry)
    pub adx: bool,
    /// AES-NI (AES instructions)
    pub aes: bool,
    /// SHA extensions
    pub sha: bool,
}

impl CpuFeatures {
    /// Detecta features da CPU em runtime
    pub fn detect() -> Self {
        #[cfg(target_arch = "x86_64")]
        {
            Self {
                avx2: is_x86_feature_detected!("avx2"),
                avx512f: is_x86_feature_detected!("avx512f"),
                avx512bw: is_x86_feature_detected!("avx512bw"),
                bmi2: is_x86_feature_detected!("bmi2"),
                adx: is_x86_feature_detected!("adx"),
                aes: is_x86_feature_detected!("aes"),
                sha: is_x86_feature_detected!("sha"),
            }
        }

        #[cfg(not(target_arch = "x86_64"))]
        {
            Self {
                avx2: false,
                avx512f: false,
                avx512bw: false,
                bmi2: false,
                adx: false,
                aes: false,
                sha: false,
            }
        }
    }

    /// Determina melhor caminho de execução disponível
    pub fn best_path(&self) -> ExecutionPath {
        if self.avx512f && self.avx512bw {
            ExecutionPath::Avx512
        } else if self.avx2 {
            ExecutionPath::Avx2
        } else {
            ExecutionPath::Portable
        }
    }

    /// Verifica se pode usar instruções ADX para aritmética multiprecisão
    pub fn has_mulx_adx(&self) -> bool {
        self.bmi2 && self.adx
    }
}

/// Caminho de execução otimizado
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionPath {
    /// Código portable (sem SIMD)
    Portable,
    /// AVX2 (256-bit vectors)
    Avx2,
    /// AVX-512 (512-bit vectors)
    Avx512,
}

impl ExecutionPath {
    /// Nome legível do caminho
    pub fn name(&self) -> &'static str {
        match self {
            Self::Portable => "portable",
            Self::Avx2 => "avx2",
            Self::Avx512 => "avx512",
        }
    }
}

// Global CPU features (lazy static sem dependências)
static mut CPU_FEATURES: Option<CpuFeatures> = None;
static mut INITIALIZED: bool = false;

/// Obtém features da CPU (cached após primeira chamada)
pub fn cpu_features() -> CpuFeatures {
    unsafe {
        if !INITIALIZED {
            CPU_FEATURES = Some(CpuFeatures::detect());
            INITIALIZED = true;
        }
        CPU_FEATURES.unwrap()
    }
}

/// Obtém melhor caminho de execução (cached)
pub fn execution_path() -> ExecutionPath {
    cpu_features().best_path()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cpu_features_detect() {
        let features = CpuFeatures::detect();
        let path = features.best_path();

        // Simplesmente verifica que não crasheia
        println!("CPU Features: {:?}", features);
        println!("Execution Path: {}", path.name());
    }

    #[test]
    fn test_cached_features() {
        let f1 = cpu_features();
        let f2 = cpu_features();

        // Devem retornar mesmos valores (cached)
        assert_eq!(f1.avx2, f2.avx2);
        assert_eq!(f1.avx512f, f2.avx512f);
    }
}

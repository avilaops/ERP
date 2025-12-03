/// Soluções das Equações de Einstein para Relatividade Geral
///
/// Este módulo implementa métricas exatas que resolvem as equações de campo de Einstein:
/// R_μν - (1/2)R g_μν = 8πG T_μν
///
/// Inclui métricas importantes como:
/// - Schwarzschild (buraco negro estático)
/// - Kerr (buraco negro rotante)
/// - FLRW (cosmologia, universo em expansão)
/// - de Sitter (constante cosmológica positiva)
use std::f64::consts::PI;

use crate::tensor::tensor::Matrix;

/// Símbolos de Christoffel Γ^λ_μν
/// Representam a conexão afim do espaço-tempo curvo
/// Calculados a partir da métrica: Γ^λ_μν = (1/2)g^λσ(∂_μ g_νσ + ∂_ν g_μσ - ∂_σ g_μν)
#[derive(Debug, Clone)]
pub struct ChristoffelSymbols {
    /// Símbolos Γ^λ_μν armazenados como [λ][μ][ν]
    pub symbols: Vec<Vec<Vec<f64>>>,
}

impl ChristoffelSymbols {
    /// Cria símbolos de Christoffel para espaço-tempo 4D
    pub fn new() -> Self {
        Self {
            symbols: vec![vec![vec![0.0; 4]; 4]; 4],
        }
    }

    /// Obtém Γ^λ_μν
    pub fn get(&self, lambda: usize, mu: usize, nu: usize) -> f64 {
        self.symbols[lambda][mu][nu]
    }

    /// Define Γ^λ_μν
    pub fn set(&mut self, lambda: usize, mu: usize, nu: usize, value: f64) {
        self.symbols[lambda][mu][nu] = value;
    }

    /// Calcula símbolos de Christoffel a partir de uma métrica
    /// usando diferenciação numérica
    pub fn from_metric<F>(metric_func: F, point: &[f64; 4], epsilon: f64) -> Self
    where
        F: Fn(&[f64; 4]) -> Matrix,
    {
        let mut christoffel = ChristoffelSymbols::new();

        // Calcula métrica no ponto
        let g = metric_func(point);

        // Calcula inversa da métrica g^μν
        let g_inv = metric_inverse(&g);

        // Para cada componente Γ^λ_μν
        for lambda in 0..4 {
            for mu in 0..4 {
                for nu in 0..4 {
                    let mut gamma = 0.0;

                    // Γ^λ_μν = (1/2)g^λσ(∂_μ g_νσ + ∂_ν g_μσ - ∂_σ g_μν)
                    for sigma in 0..4 {
                        let d_mu = metric_derivative(&metric_func, point, mu, nu, sigma, epsilon);
                        let d_nu = metric_derivative(&metric_func, point, nu, mu, sigma, epsilon);
                        let d_sigma =
                            metric_derivative(&metric_func, point, sigma, mu, nu, epsilon);

                        gamma +=
                            0.5 * g_inv.get([lambda, sigma]).unwrap() * (d_mu + d_nu - d_sigma);
                    }

                    christoffel.set(lambda, mu, nu, gamma);
                }
            }
        }

        christoffel
    }
}

/// Tensor métrico g_μν
#[derive(Debug, Clone)]
pub struct MetricTensor {
    pub components: Matrix,
}

impl MetricTensor {
    /// Cria métrica de Minkowski (espaço-tempo plano)
    pub fn minkowski() -> Self {
        let mut components = Matrix::zeros([4, 4]);
        components.set([0, 0], -1.0).unwrap(); // tempo
        components.set([1, 1], 1.0).unwrap(); // x
        components.set([2, 2], 1.0).unwrap(); // y
        components.set([3, 3], 1.0).unwrap(); // z
        Self { components }
    }

    /// Métrica de Schwarzschild (buraco negro estático, sem rotação)
    ///
    /// ds² = -(1 - 2M/r)dt² + (1 - 2M/r)⁻¹dr² + r²(dθ² + sin²θ dφ²)
    ///
    /// Parâmetros:
    /// - M: massa do buraco negro (em unidades geométricas G=c=1)
    /// - r: coordenada radial
    /// - theta: ângulo polar
    pub fn schwarzschild(mass: f64, r: f64, theta: f64) -> Self {
        let mut components = Matrix::zeros([4, 4]);

        let rs = 2.0 * mass; // raio de Schwarzschild
        let f = 1.0 - rs / r;

        if r <= rs {
            // Dentro do horizonte de eventos, métrica se torna singular
            // Para simulações, retornamos valores extremos
            components.set([0, 0], -1e-10).unwrap();
            components.set([1, 1], 1e10).unwrap();
        } else {
            components.set([0, 0], -f).unwrap(); // g_tt
            components.set([1, 1], 1.0 / f).unwrap(); // g_rr
        }

        components.set([2, 2], r * r).unwrap(); // g_θθ
        components.set([3, 3], r * r * theta.sin().powi(2)).unwrap(); // g_φφ

        Self { components }
    }

    /// Métrica de Kerr (buraco negro rotante)
    ///
    /// ds² = -(1 - 2Mr/Σ)dt² - (4Mar sin²θ/Σ)dtdφ + (Σ/Δ)dr² + Σdθ²
    ///       + ((r² + a²)² - a²Δsin²θ)/Σ sin²θ dφ²
    ///
    /// onde:
    /// - Σ = r² + a²cos²θ
    /// - Δ = r² - 2Mr + a²
    /// - a = J/M (momento angular específico)
    ///
    /// Parâmetros:
    /// - mass: massa M
    /// - spin: parâmetro de spin a (0 ≤ a ≤ M)
    /// - r, theta: coordenadas de Boyer-Lindquist
    pub fn kerr(mass: f64, spin: f64, r: f64, theta: f64) -> Self {
        let mut components = Matrix::zeros([4, 4]);

        let m = mass;
        let a = spin;
        let cos_theta = theta.cos();
        let sin_theta = theta.sin();

        let sigma = r * r + a * a * cos_theta * cos_theta;
        let delta = r * r - 2.0 * m * r + a * a;

        // Componentes diagonais
        components
            .set([0, 0], -(1.0 - 2.0 * m * r / sigma))
            .unwrap();
        components.set([1, 1], sigma / delta).unwrap();
        components.set([2, 2], sigma).unwrap();
        components
            .set(
                [3, 3],
                ((r * r + a * a).powi(2) - a * a * delta * sin_theta * sin_theta) / sigma
                    * sin_theta
                    * sin_theta,
            )
            .unwrap();

        // Componente fora da diagonal (arrasto de referenciais)
        let g_t_phi = -2.0 * m * r * a * sin_theta * sin_theta / sigma;
        components.set([0, 3], g_t_phi).unwrap();
        components.set([3, 0], g_t_phi).unwrap();

        Self { components }
    }

    /// Métrica FLRW (Friedmann-Lemaître-Robertson-Walker)
    /// Descreve um universo homogêneo e isotrópico em expansão
    ///
    /// ds² = -dt² + a(t)²[dr²/(1-kr²) + r²(dθ² + sin²θ dφ²)]
    ///
    /// Parâmetros:
    /// - scale_factor: fator de escala a(t)
    /// - curvature: parâmetro de curvatura k (-1, 0, +1)
    /// - r, theta: coordenadas comóveis
    pub fn flrw(scale_factor: f64, curvature: f64, r: f64, theta: f64) -> Self {
        let mut components = Matrix::zeros([4, 4]);

        let a = scale_factor;
        let k = curvature;

        components.set([0, 0], -1.0).unwrap(); // tempo cosmológico
        components.set([1, 1], a * a / (1.0 - k * r * r)).unwrap();
        components.set([2, 2], a * a * r * r).unwrap();
        components
            .set([3, 3], a * a * r * r * theta.sin().powi(2))
            .unwrap();

        Self { components }
    }

    /// Métrica de de Sitter (espaço-tempo com constante cosmológica)
    /// Descreve universo vazio com energia do vácuo
    ///
    /// ds² = -(1 - Λr²/3)dt² + (1 - Λr²/3)⁻¹dr² + r²dΩ²
    ///
    /// Parâmetros:
    /// - lambda: constante cosmológica Λ
    /// - r, theta: coordenadas
    pub fn de_sitter(lambda: f64, r: f64, theta: f64) -> Self {
        let mut components = Matrix::zeros([4, 4]);

        let f = 1.0 - lambda * r * r / 3.0;

        components.set([0, 0], -f).unwrap();
        components.set([1, 1], 1.0 / f).unwrap();
        components.set([2, 2], r * r).unwrap();
        components.set([3, 3], r * r * theta.sin().powi(2)).unwrap();

        Self { components }
    }

    /// Calcula o determinante da métrica det(g_μν)
    pub fn determinant(&self) -> f64 {
        // Para matriz 4x4, usamos expansão de cofatores
        // Simplificado: assumimos diagonal ou bloco-diagonal
        let g = &self.components;

        // Caso geral para 4x4
        let g00 = g.get([0, 0]).unwrap();
        let g11 = g.get([1, 1]).unwrap();
        let g22 = g.get([2, 2]).unwrap();
        let g33 = g.get([3, 3]).unwrap();

        // Para métricas diagonais
        g00 * g11 * g22 * g33
    }

    /// Calcula o escalar de Ricci R = g^μν R_μν
    pub fn ricci_scalar(&self, christoffel: &ChristoffelSymbols) -> f64 {
        // R = R^μ_μ = g^μν R_μν
        let g_inv = metric_inverse(&self.components);
        let ricci = self.ricci_tensor(christoffel);

        let mut r_scalar = 0.0;
        for mu in 0..4 {
            for nu in 0..4 {
                r_scalar += g_inv.get([mu, nu]).unwrap() * ricci.get([mu, nu]).unwrap();
            }
        }
        r_scalar
    }

    /// Calcula tensor de Ricci R_μν
    pub fn ricci_tensor(&self, christoffel: &ChristoffelSymbols) -> Matrix {
        let mut ricci = Matrix::zeros([4, 4]);

        // R_μν = ∂_λΓ^λ_μν - ∂_νΓ^λ_μλ + Γ^λ_σλΓ^σ_μν - Γ^λ_σνΓ^σ_μλ
        // Simplificação: apenas termos principais
        for mu in 0..4 {
            for nu in 0..4 {
                let mut r_mu_nu = 0.0;

                for lambda in 0..4 {
                    for sigma in 0..4 {
                        r_mu_nu +=
                            christoffel.get(lambda, sigma, lambda) * christoffel.get(sigma, mu, nu);
                        r_mu_nu -=
                            christoffel.get(lambda, sigma, nu) * christoffel.get(sigma, mu, lambda);
                    }
                }

                ricci.set([mu, nu], r_mu_nu).unwrap();
            }
        }

        ricci
    }

    /// Calcula o intervalo ds² = g_μν dx^μ dx^ν
    pub fn interval(&self, dx: &[f64; 4]) -> f64 {
        let mut ds2 = 0.0;
        for mu in 0..4 {
            for nu in 0..4 {
                ds2 += self.components.get([mu, nu]).unwrap() * dx[mu] * dx[nu];
            }
        }
        ds2
    }
}

/// Tensor de Einstein G_μν = R_μν - (1/2)Rg_μν
#[derive(Debug, Clone)]
pub struct EinsteinTensor {
    pub components: Matrix,
}

impl EinsteinTensor {
    /// Calcula tensor de Einstein a partir da métrica
    pub fn from_metric(metric: &MetricTensor, christoffel: &ChristoffelSymbols) -> Self {
        let ricci = metric.ricci_tensor(christoffel);
        let r_scalar = metric.ricci_scalar(christoffel);

        let mut components = Matrix::zeros([4, 4]);

        for mu in 0..4 {
            for nu in 0..4 {
                let g_mu_nu = metric.components.get([mu, nu]).unwrap();
                let r_mu_nu = ricci.get([mu, nu]).unwrap();

                let g_mu_nu_val = r_mu_nu - 0.5 * r_scalar * g_mu_nu;
                components.set([mu, nu], g_mu_nu_val).unwrap();
            }
        }

        Self { components }
    }
}

/// Propriedades físicas de um buraco negro
#[derive(Debug, Clone)]
pub struct BlackHoleProperties {
    pub mass: f64,
    pub spin: f64,
    pub schwarzschild_radius: f64,
    pub event_horizon: f64,
    pub ergosphere_outer: f64,
    pub photon_sphere: f64,
}

impl BlackHoleProperties {
    /// Calcula propriedades de um buraco negro de Schwarzschild
    pub fn schwarzschild(mass: f64) -> Self {
        let rs = 2.0 * mass; // G=c=1

        Self {
            mass,
            spin: 0.0,
            schwarzschild_radius: rs,
            event_horizon: rs,
            ergosphere_outer: rs,
            photon_sphere: 1.5 * rs,
        }
    }

    /// Calcula propriedades de um buraco negro de Kerr
    pub fn kerr(mass: f64, spin: f64) -> Self {
        let a = spin;
        let m = mass;

        // Raio do horizonte de eventos: r+ = M + √(M² - a²)
        let r_plus = m + (m * m - a * a).sqrt();

        // Raio externo da ergosfera (no equador): r_e = M + √(M² - a²cos²θ)
        let r_ergo = m + (m * m).sqrt();

        // Raio da esfera de fótons (aproximado para Kerr, fórmula simplificada)
        let discriminant = 1.0 - a * a / (m * m);
        let r_photon = if discriminant > 0.0 {
            2.0 * m * (1.0 + discriminant.sqrt())
        } else {
            2.0 * m // fallback para spin extremo
        };

        Self {
            mass,
            spin,
            schwarzschild_radius: 2.0 * m,
            event_horizon: r_plus,
            ergosphere_outer: r_ergo,
            photon_sphere: r_photon,
        }
    }

    /// Verifica se um ponto está dentro do horizonte de eventos
    pub fn is_inside_horizon(&self, r: f64) -> bool {
        r < self.event_horizon
    }

    /// Verifica se um ponto está dentro da ergosfera
    pub fn is_inside_ergosphere(&self, r: f64) -> bool {
        r < self.ergosphere_outer
    }

    /// Temperatura de Hawking do buraco negro
    pub fn hawking_temperature(&self) -> f64 {
        // T_H = ℏc³/(8πGMk_B) (restaurando constantes)
        // Em unidades geométricas (G=c=ℏ=k_B=1): T_H = 1/(8πM)
        1.0 / (8.0 * PI * self.mass)
    }

    /// Entropia de Bekenstein-Hawking
    pub fn entropy(&self) -> f64 {
        // S = A/(4G) onde A é área do horizonte
        // Em unidades geométricas: S = A/4 = πr+²
        PI * self.event_horizon * self.event_horizon
    }
}

// Funções auxiliares

/// Calcula inversa da métrica g^μν
fn metric_inverse(g: &Matrix) -> Matrix {
    // Simplificação: para matriz 4x4 diagonal
    let mut g_inv = Matrix::zeros([4, 4]);

    for i in 0..4 {
        let g_ii = g.get([i, i]).unwrap();
        if g_ii.abs() > 1e-10 {
            g_inv.set([i, i], 1.0 / g_ii).unwrap();
        }
    }

    g_inv
}

/// Calcula derivada da métrica ∂_μ g_νσ numericamente
fn metric_derivative<F>(
    metric_func: &F,
    point: &[f64; 4],
    mu: usize,
    nu: usize,
    sigma: usize,
    epsilon: f64,
) -> f64
where
    F: Fn(&[f64; 4]) -> Matrix,
{
    let mut point_plus = *point;
    let mut point_minus = *point;

    point_plus[mu] += epsilon;
    point_minus[mu] -= epsilon;

    let g_plus = metric_func(&point_plus);
    let g_minus = metric_func(&point_minus);

    let g_plus_val = g_plus.get([nu, sigma]).unwrap();
    let g_minus_val = g_minus.get([nu, sigma]).unwrap();

    (g_plus_val - g_minus_val) / (2.0 * epsilon)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_schwarzschild_metric() {
        let mass = 1.0;
        let r = 10.0;
        let theta = PI / 2.0;

        let metric = MetricTensor::schwarzschild(mass, r, theta);

        // Verifica assinatura da métrica
        assert!(metric.components.get([0, 0]).unwrap() < 0.0); // tempo negativo
        assert!(metric.components.get([1, 1]).unwrap() > 0.0); // espaço positivo
    }

    #[test]
    fn test_black_hole_properties() {
        let mass = 1.0;
        let props = BlackHoleProperties::schwarzschild(mass);

        assert_eq!(props.schwarzschild_radius, 2.0);
        assert_eq!(props.event_horizon, 2.0);
        assert_eq!(props.photon_sphere, 3.0);

        assert!(props.is_inside_horizon(1.5));
        assert!(!props.is_inside_horizon(2.5));
    }

    #[test]
    fn test_kerr_metric() {
        let mass = 1.0;
        let spin = 0.5;
        let r = 10.0;
        let theta = PI / 2.0;

        let metric = MetricTensor::kerr(mass, spin, r, theta);

        // Componente fora da diagonal (arrasto) deve existir
        let g_t_phi = metric.components.get([0, 3]).unwrap();
        assert_ne!(g_t_phi, 0.0);
    }

    #[test]
    fn test_flrw_metric() {
        let a = 2.0; // universo com fator de escala 2
        let k = 0.0; // universo plano
        let r = 1.0;
        let theta = PI / 2.0;

        let metric = MetricTensor::flrw(a, k, r, theta);

        // Verifica que componentes espaciais escalaram com a²
        assert!((metric.components.get([2, 2]).unwrap() - a * a * r * r).abs() < 1e-10);
    }

    #[test]
    fn test_hawking_temperature() {
        let mass = 1.0;
        let props = BlackHoleProperties::schwarzschild(mass);

        let temp = props.hawking_temperature();
        assert!((temp - 1.0 / (8.0 * PI)).abs() < 1e-10);
    }
}

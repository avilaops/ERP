/// Operações para Relatividade Geral e transformações de Lorentz
/// Usa tensores 4D para representar o tensor métrico, tensor de Riemann, etc.
use crate::tensor::tensor::{Matrix, Vector};
use crate::tensor::tensor4d::Tensor4D;

/// Métrica de Minkowski (espaço-tempo plano da relatividade especial)
/// Assinatura (-,+,+,+) ou (c=1)
pub struct MinkowskiMetric {
    pub metric: Matrix, // g_μν
}

impl MinkowskiMetric {
    /// Cria métrica de Minkowski com assinatura (-,+,+,+)
    pub fn new() -> Self {
        let mut metric = Matrix::zeros([4, 4]);
        metric.set([0, 0], -1.0).unwrap(); // tempo
        metric.set([1, 1], 1.0).unwrap(); // x
        metric.set([2, 2], 1.0).unwrap(); // y
        metric.set([3, 3], 1.0).unwrap(); // z
        Self { metric }
    }

    /// Calcula o intervalo espaço-temporal: ds² = g_μν dx^μ dx^ν
    pub fn interval(&self, dx: &Vector) -> f64 {
        if dx.shape[0] != 4 {
            panic!("Must be 4-vector");
        }

        let mut ds_squared = 0.0;
        for mu in 0..4 {
            for nu in 0..4 {
                ds_squared += self.metric.get([mu, nu]).unwrap()
                    * dx.get([mu]).unwrap()
                    * dx.get([nu]).unwrap();
            }
        }
        ds_squared
    }

    /// Verifica se um 4-vetor é tipo tempo, tipo luz ou tipo espaço
    pub fn classify_vector(&self, v: &Vector) -> VectorType {
        let interval = self.interval(v);
        if interval < -1e-10 {
            VectorType::Timelike
        } else if interval.abs() < 1e-10 {
            VectorType::Lightlike
        } else {
            VectorType::Spacelike
        }
    }
}

#[derive(Debug, PartialEq)]
pub enum VectorType {
    Timelike,
    Lightlike,
    Spacelike,
}

/// Transformação de Lorentz (boost)
pub struct LorentzTransform {
    pub lambda: Matrix, // Λ^μ_ν
}

impl LorentzTransform {
    /// Cria transformação de Lorentz identidade
    pub fn identity() -> Self {
        Self {
            lambda: Matrix::identity(4),
        }
    }

    /// Cria boost de Lorentz na direção x com velocidade v (em unidades de c)
    pub fn boost_x(beta: f64) -> Result<Self, String> {
        if beta.abs() >= 1.0 {
            return Err("Velocity must be less than speed of light".to_string());
        }

        let gamma = 1.0 / (1.0 - beta * beta).sqrt();
        let mut lambda = Matrix::identity(4);

        lambda.set([0, 0], gamma).unwrap();
        lambda.set([0, 1], -gamma * beta).unwrap();
        lambda.set([1, 0], -gamma * beta).unwrap();
        lambda.set([1, 1], gamma).unwrap();

        Ok(Self { lambda })
    }

    /// Cria boost de Lorentz na direção y
    pub fn boost_y(beta: f64) -> Result<Self, String> {
        if beta.abs() >= 1.0 {
            return Err("Velocity must be less than speed of light".to_string());
        }

        let gamma = 1.0 / (1.0 - beta * beta).sqrt();
        let mut lambda = Matrix::identity(4);

        lambda.set([0, 0], gamma).unwrap();
        lambda.set([0, 2], -gamma * beta).unwrap();
        lambda.set([2, 0], -gamma * beta).unwrap();
        lambda.set([2, 2], gamma).unwrap();

        Ok(Self { lambda })
    }

    /// Cria boost de Lorentz na direção z
    pub fn boost_z(beta: f64) -> Result<Self, String> {
        if beta.abs() >= 1.0 {
            return Err("Velocity must be less than speed of light".to_string());
        }

        let gamma = 1.0 / (1.0 - beta * beta).sqrt();
        let mut lambda = Matrix::identity(4);

        lambda.set([0, 0], gamma).unwrap();
        lambda.set([0, 3], -gamma * beta).unwrap();
        lambda.set([3, 0], -gamma * beta).unwrap();
        lambda.set([3, 3], gamma).unwrap();

        Ok(Self { lambda })
    }

    /// Cria boost genérico na direção de velocity (vx, vy, vz) em unidades de c
    pub fn boost(velocity: [f64; 3]) -> Result<Self, String> {
        let v_squared =
            velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2];

        if v_squared >= 1.0 {
            return Err("Velocity must be less than speed of light".to_string());
        }

        if v_squared < 1e-10 {
            return Ok(Self::identity());
        }

        let v = v_squared.sqrt();
        let gamma = 1.0 / (1.0 - v_squared).sqrt();
        let n = [velocity[0] / v, velocity[1] / v, velocity[2] / v]; // direção normalizada

        let mut lambda = Matrix::identity(4);

        lambda.set([0, 0], gamma).unwrap();

        for i in 0..3 {
            lambda.set([0, i + 1], -gamma * velocity[i]).unwrap();
            lambda.set([i + 1, 0], -gamma * velocity[i]).unwrap();
        }

        for i in 0..3 {
            for j in 0..3 {
                let delta_ij = if i == j { 1.0 } else { 0.0 };
                let val = delta_ij + (gamma - 1.0) * n[i] * n[j];
                lambda.set([i + 1, j + 1], val).unwrap();
            }
        }

        Ok(Self { lambda })
    }

    /// Aplica a transformação a um 4-vetor
    pub fn transform(&self, four_vector: &Vector) -> Result<Vector, String> {
        self.lambda.matvec(four_vector)
    }

    /// Compõe duas transformações de Lorentz
    pub fn compose(&self, other: &Self) -> Result<Self, String> {
        Ok(Self {
            lambda: self.lambda.matmul(&other.lambda)?,
        })
    }

    /// Inverso da transformação
    pub fn inverse(&self) -> Self {
        // Para transformações de Lorentz puras (sem rotações espaciais),
        // o inverso pode ser obtido trocando o sinal de β
        let mut inv = self.lambda.clone();

        // Inverte os componentes fora da diagonal temporal-espacial
        for i in 1..4 {
            let val = inv.get([0, i]).unwrap();
            inv.set([0, i], -val).unwrap();
            inv.set([i, 0], -val).unwrap();
        }

        Self { lambda: inv }
    }

    /// Rotação espacial em torno do eixo z (não afeta o tempo)
    pub fn rotation_z(angle: f64) -> Self {
        let mut lambda = Matrix::identity(4);
        let cos_theta = angle.cos();
        let sin_theta = angle.sin();

        lambda.set([1, 1], cos_theta).unwrap();
        lambda.set([1, 2], -sin_theta).unwrap();
        lambda.set([2, 1], sin_theta).unwrap();
        lambda.set([2, 2], cos_theta).unwrap();

        Self { lambda }
    }
}

/// Tensor de Riemann (curvatura do espaço-tempo)
/// R^ρ_σμν
pub struct RiemannTensor {
    pub components: Tensor4D,
}

impl RiemannTensor {
    /// Cria tensor de Riemann zero (espaço-tempo plano)
    pub fn flat_spacetime() -> Self {
        Self {
            components: Tensor4D::zeros([4, 4, 4, 4]),
        }
    }

    /// Cria tensor de Riemann com componentes específicos
    pub fn new(components: Tensor4D) -> Result<Self, String> {
        if components.shape() != &[4, 4, 4, 4] {
            return Err("Riemann tensor must be 4×4×4×4".to_string());
        }
        Ok(Self { components })
    }

    /// Calcula o escalar de Ricci: R = g^μν R_μν
    pub fn ricci_scalar(&self, metric: &Matrix) -> f64 {
        // Implementação simplificada
        // R = g^μν R_μν onde R_μν é a contração R^ρ_μρν
        let mut scalar = 0.0;

        for mu in 0..4 {
            for nu in 0..4 {
                let g_inv = metric.get([mu, nu]).unwrap(); // simplificação: assume métrica diagonal

                // Contração: R_μν = R^ρ_μρν
                let mut ricci_component = 0.0;
                for rho in 0..4 {
                    ricci_component += self.components.get([rho, mu, rho, nu]).unwrap();
                }

                scalar += g_inv * ricci_component;
            }
        }

        scalar
    }

    /// Verifica simetrias do tensor de Riemann
    /// R_ρσμν = -R_σρμν = -R_ρσνμ = R_μνρσ
    pub fn check_symmetries(&self) -> bool {
        let eps = 1e-10;

        for rho in 0..4 {
            for sigma in 0..4 {
                for mu in 0..4 {
                    for nu in 0..4 {
                        let r = self.components.get([rho, sigma, mu, nu]).unwrap();

                        // Antissimetria no primeiro par
                        let r_swap1 = self.components.get([sigma, rho, mu, nu]).unwrap();
                        if (r + r_swap1).abs() > eps {
                            return false;
                        }

                        // Antissimetria no segundo par
                        let r_swap2 = self.components.get([rho, sigma, nu, mu]).unwrap();
                        if (r + r_swap2).abs() > eps {
                            return false;
                        }
                    }
                }
            }
        }

        true
    }
}

/// Tensor energia-momento (stress-energy tensor)
/// T^μν
pub struct StressEnergyTensor {
    pub components: Matrix,
}

impl StressEnergyTensor {
    /// Cria tensor energia-momento vazio (vácuo)
    pub fn vacuum() -> Self {
        Self {
            components: Matrix::zeros([4, 4]),
        }
    }

    /// Tensor energia-momento para fluido perfeito
    /// T^μν = (ρ + p)u^μ u^ν + p g^μν
    pub fn perfect_fluid(
        density: f64,
        pressure: f64,
        four_velocity: &Vector,
        metric: &Matrix,
    ) -> Result<Self, String> {
        if four_velocity.shape[0] != 4 {
            return Err("Must be 4-velocity".to_string());
        }

        let mut components = Matrix::zeros([4, 4]);

        for mu in 0..4 {
            for nu in 0..4 {
                let u_mu = four_velocity.get([mu]).unwrap();
                let u_nu = four_velocity.get([nu]).unwrap();
                let g_mu_nu = metric.get([mu, nu]).unwrap();

                let t_mu_nu = (density + pressure) * u_mu * u_nu + pressure * g_mu_nu;
                components.set([mu, nu], t_mu_nu).unwrap();
            }
        }

        Ok(Self { components })
    }

    /// Tensor energia-momento para campo eletromagnético
    /// T^μν = F^μρ F^ν_ρ - (1/4) g^μν F^ρσ F_ρσ
    pub fn electromagnetic_field(
        field_tensor: &Matrix, // F^μν
        metric: &Matrix,
    ) -> Self {
        let mut components = Matrix::zeros([4, 4]);

        // Calcula F^ρσ F_ρσ
        let mut f_squared = 0.0;
        for rho in 0..4 {
            for sigma in 0..4 {
                let f_rho_sigma = field_tensor.get([rho, sigma]).unwrap();
                let g_rho = metric.get([rho, rho]).unwrap();
                let g_sigma = metric.get([sigma, sigma]).unwrap();
                f_squared += g_rho * g_sigma * f_rho_sigma * f_rho_sigma;
            }
        }

        for mu in 0..4 {
            for nu in 0..4 {
                let mut sum = 0.0;
                for rho in 0..4 {
                    let f_mu_rho = field_tensor.get([mu, rho]).unwrap();
                    let f_nu_rho = field_tensor.get([nu, rho]).unwrap();
                    let g_rho = metric.get([rho, rho]).unwrap();
                    sum += f_mu_rho * f_nu_rho * g_rho;
                }

                let g_mu_nu = metric.get([mu, nu]).unwrap();
                let t_mu_nu = sum - 0.25 * g_mu_nu * f_squared;
                components.set([mu, nu], t_mu_nu).unwrap();
            }
        }

        Self { components }
    }

    /// Calcula a densidade de energia (T^00)
    pub fn energy_density(&self) -> f64 {
        self.components.get([0, 0]).unwrap()
    }

    /// Calcula a pressão (média de T^ii para i=1,2,3)
    pub fn pressure(&self) -> f64 {
        (self.components.get([1, 1]).unwrap()
            + self.components.get([2, 2]).unwrap()
            + self.components.get([3, 3]).unwrap())
            / 3.0
    }

    /// Traço do tensor: T = T^μ_μ = g_μν T^μν
    pub fn trace(&self, metric: &Matrix) -> f64 {
        let mut trace = 0.0;
        for mu in 0..4 {
            let g = metric.get([mu, mu]).unwrap();
            let t = self.components.get([mu, mu]).unwrap();
            trace += g * t;
        }
        trace
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_minkowski_metric() {
        let metric = MinkowskiMetric::new();
        let dx = Vector::from_slice(&[1.0, 0.0, 0.0, 0.0]); // puramente temporal
        let interval = metric.interval(&dx);
        assert_eq!(interval, -1.0);
    }

    #[test]
    fn test_lorentz_boost_identity() {
        let boost = LorentzTransform::boost_x(0.0).unwrap();
        let v = Vector::from_slice(&[1.0, 0.0, 0.0, 0.0]);
        let transformed = boost.transform(&v).unwrap();

        assert!((transformed.get([0]).unwrap() - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_lorentz_boost_x() {
        let beta = 0.6; // 60% da velocidade da luz
        let boost = LorentzTransform::boost_x(beta).unwrap();

        let v = Vector::from_slice(&[1.0, 0.0, 0.0, 0.0]);
        let transformed = boost.transform(&v).unwrap();

        let gamma = 1.0 / (1.0 - beta * beta).sqrt();
        assert!((transformed.get([0]).unwrap() - gamma).abs() < 1e-10);
    }

    #[test]
    fn test_vector_classification() {
        let metric = MinkowskiMetric::new();

        let timelike = Vector::from_slice(&[2.0, 1.0, 0.0, 0.0]);
        assert_eq!(metric.classify_vector(&timelike), VectorType::Timelike);

        let lightlike = Vector::from_slice(&[1.0, 1.0, 0.0, 0.0]);
        assert_eq!(metric.classify_vector(&lightlike), VectorType::Lightlike);

        let spacelike = Vector::from_slice(&[1.0, 2.0, 0.0, 0.0]);
        assert_eq!(metric.classify_vector(&spacelike), VectorType::Spacelike);
    }

    #[test]
    fn test_stress_energy_vacuum() {
        let tensor = StressEnergyTensor::vacuum();
        assert_eq!(tensor.energy_density(), 0.0);
        assert_eq!(tensor.pressure(), 0.0);
    }

    #[test]
    fn test_riemann_tensor_flat() {
        let riemann = RiemannTensor::flat_spacetime();
        let metric = MinkowskiMetric::new().metric;
        let scalar = riemann.ricci_scalar(&metric);
        assert_eq!(scalar, 0.0);
    }
}

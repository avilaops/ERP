//! Operadores compostos (Laplaciano, grad-div, etc.)

use crate::calculus::differential::gradient_4d;
use crate::calculus::fields::divergence_4d;

/// Laplaciano 4D: ∇²f = ∂²f/∂x² + ∂²f/∂y² + ∂²f/∂z² + ∂²f/∂w²
///
/// Mede a curvatura do campo escalar em 4D.
///
/// # Example
/// ```
/// use avila_math::calculus::operators::laplacian_4d;
///
/// // f(x,y,z,w) = x² + y² + z² + w²
/// let f = |p: &[f64]| p[0]*p[0] + p[1]*p[1] + p[2]*p[2] + p[3]*p[3];
///
/// let lap = laplacian_4d(&f, &[1.0, 2.0, 3.0, 4.0], 1e-5);
/// assert!((lap - 8.0).abs() < 1e-3);  // ∇²f = 2+2+2+2 = 8
/// ```
pub fn laplacian_4d<F>(f: &F, point: &[f64; 4], h: f64) -> f64
where
    F: Fn(&[f64]) -> f64,
{
    let mut laplacian = 0.0;

    for i in 0..4 {
        let mut p_plus = *point;
        let mut p_minus = *point;
        p_plus[i] += h;
        p_minus[i] -= h;

        // Segunda derivada: [f(x+h) - 2f(x) + f(x-h)] / h²
        laplacian += (f(&p_plus) - 2.0 * f(point) + f(&p_minus)) / (h * h);
    }

    laplacian
}

/// Derivada direcional: D_v f = ∇f · v
pub fn directional_derivative<F>(f: &F, point: &[f64; 4], direction: &[f64; 4], h: f64) -> f64
where
    F: Fn(&[f64]) -> f64,
{
    let grad = gradient_4d(f, point, h);

    // Normaliza direção
    let norm =
        (direction[0].powi(2) + direction[1].powi(2) + direction[2].powi(2) + direction[3].powi(2))
            .sqrt();

    if norm == 0.0 {
        return 0.0;
    }

    let unit_dir = [
        direction[0] / norm,
        direction[1] / norm,
        direction[2] / norm,
        direction[3] / norm,
    ];

    grad[0] * unit_dir[0] + grad[1] * unit_dir[1] + grad[2] * unit_dir[2] + grad[3] * unit_dir[3]
}

/// Operador grad-div: ∇(∇·F)
///
/// Gradiente da divergência de um campo vetorial
pub fn grad_div_4d<F>(field: &F, point: &[f64; 4], h: f64) -> [f64; 4]
where
    F: Fn(&[f64; 4]) -> [f64; 4],
{
    let div_func = |p: &[f64]| divergence_4d(field, &[p[0], p[1], p[2], p[3]], h);

    gradient_4d(&div_func, point, h)
}

/// Divergência do gradiente (equivalente ao Laplaciano)
///
/// ∇·(∇f) = ∇²f
pub fn div_grad_4d<F>(f: &F, point: &[f64; 4], h: f64) -> f64
where
    F: Fn(&[f64]) -> f64,
{
    // Constrói campo vetorial do gradiente
    let grad_field = |p: &[f64; 4]| gradient_4d(f, p, h);

    divergence_4d(&grad_field, point, h)
}

/// Operador biarmônico: ∇⁴f = ∇²(∇²f)
///
/// Laplaciano do Laplaciano
pub fn biharmonic_4d<F>(f: &F, point: &[f64; 4], h: f64) -> f64
where
    F: Fn(&[f64]) -> f64,
{
    let laplacian_func = |p: &[f64]| laplacian_4d(f, &[p[0], p[1], p[2], p[3]], h);

    laplacian_4d(&laplacian_func, point, h)
}

/// Operador d'Alembertian (wave operator) 4D
///
/// □f = ∂²f/∂t² - (∂²f/∂x² + ∂²f/∂y² + ∂²f/∂z²)
///
/// Usado em relatividade (w = ct)
pub fn dalembertian<F>(f: &F, point: &[f64; 4], h: f64) -> f64
where
    F: Fn(&[f64]) -> f64,
{
    let mut p_plus = *point;
    let mut p_minus = *point;

    // Segunda derivada temporal (índice 3 = w = ct)
    p_plus[3] += h;
    p_minus[3] -= h;
    let d2_dt2 = (f(&p_plus) - 2.0 * f(point) + f(&p_minus)) / (h * h);

    // Laplaciano espacial (apenas x, y, z)
    let mut laplacian_spatial = 0.0;
    for i in 0..3 {
        p_plus = *point;
        p_minus = *point;
        p_plus[i] += h;
        p_minus[i] -= h;
        laplacian_spatial += (f(&p_plus) - 2.0 * f(point) + f(&p_minus)) / (h * h);
    }

    d2_dt2 - laplacian_spatial
}

/// Calcula fluxo de um campo através de uma superfície 3D em 4D
///
/// Φ = ∫∫∫ F·n dS
pub fn flux_through_hypersurface<F>(
    field: &F,
    center: &[f64; 4],
    normal: &[f64; 4],
    area: f64,
) -> f64
where
    F: Fn(&[f64; 4]) -> [f64; 4],
{
    let field_val = field(center);

    // Produto escalar F · n
    let dot_product = field_val[0] * normal[0]
        + field_val[1] * normal[1]
        + field_val[2] * normal[2]
        + field_val[3] * normal[3];

    dot_product * area
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_laplacian_4d() {
        // f(x,y,z,w) = x² + y² + z² + w²
        let f = |p: &[f64]| p[0] * p[0] + p[1] * p[1] + p[2] * p[2] + p[3] * p[3];

        let lap = laplacian_4d(&f, &[1.0, 2.0, 3.0, 4.0], 1e-5);

        // ∇²f = 2+2+2+2 = 8
        assert!((lap - 8.0).abs() < 1e-3);
    }

    #[test]
    fn test_laplacian_harmonic() {
        // Função "quase" harmônica: f(x,y,z,w) = x² - y² - z² - w²
        // Laplaciano = 2 - 2 - 2 - 2 = -4 (não é zero, mas é constante)
        let f = |p: &[f64]| p[0] * p[0] - p[1] * p[1] - p[2] * p[2] - p[3] * p[3];

        let lap = laplacian_4d(&f, &[1.0, 1.0, 1.0, 1.0], 1e-5);

        // Laplaciano deve ser aproximadamente -4
        assert!((lap + 4.0).abs() < 0.1);
    }

    #[test]
    fn test_div_grad_equals_laplacian() {
        let f = |p: &[f64]| p[0] * p[0] + p[1] * p[1] + p[2] * p[2] + p[3] * p[3];
        let point = [1.0, 2.0, 3.0, 4.0];

        let lap = laplacian_4d(&f, &point, 1e-5);
        let div_grad = div_grad_4d(&f, &point, 1e-5);

        // ∇·∇f = ∇²f
        assert!((lap - div_grad).abs() < 1e-2);
    }

    #[test]
    fn test_dalembertian() {
        // Onda plana: f = sin(kx - ωt)
        let f = |p: &[f64]| (p[0] - p[3]).sin();
        let point = [0.0, 0.0, 0.0, 0.0];

        let box_op = dalembertian(&f, &point, 1e-4);

        // Para onda plana com k=ω=1, □f = 0
        assert!(box_op.abs() < 1e-1);
    }
}

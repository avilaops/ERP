//! Operadores diferenciais básicos

/// Derivada numérica usando diferenças finitas centrais
///
/// f'(x) ≈ [f(x+h) - f(x-h)] / (2h)
///
/// # Example
/// ```
/// use avila_math::calculus::derivative;
///
/// let f = |x: f64| x * x;  // f(x) = x²
/// let df = derivative(&f, 2.0, 1e-5);
/// assert!((df - 4.0).abs() < 1e-4);  // f'(2) = 4
/// ```
pub fn derivative<F>(f: &F, x: f64, h: f64) -> f64
where
    F: Fn(f64) -> f64,
{
    (f(x + h) - f(x - h)) / (2.0 * h)
}

/// Derivada parcial em relação à i-ésima variável
///
/// ∂f/∂xᵢ ≈ [f(..., xᵢ+h, ...) - f(..., xᵢ-h, ...)] / (2h)
pub fn partial_derivative<F>(f: &F, point: &[f64], variable_index: usize, h: f64) -> f64
where
    F: Fn(&[f64]) -> f64,
{
    let mut point_plus = point.to_vec();
    let mut point_minus = point.to_vec();

    point_plus[variable_index] += h;
    point_minus[variable_index] -= h;

    (f(&point_plus) - f(&point_minus)) / (2.0 * h)
}

/// Gradiente 4D de um campo escalar: ∇f = (∂f/∂x, ∂f/∂y, ∂f/∂z, ∂f/∂w)
///
/// Retorna vetor com as 4 derivadas parciais.
///
/// # Example
/// ```
/// use avila_math::calculus::gradient_4d;
///
/// // f(x,y,z,w) = x² + y² + z² + w²
/// let f = |p: &[f64]| p[0]*p[0] + p[1]*p[1] + p[2]*p[2] + p[3]*p[3];
///
/// let grad = gradient_4d(&f, &[1.0, 0.0, 0.0, 0.0], 1e-5);
/// assert!((grad[0] - 2.0).abs() < 1e-4);  // ∂f/∂x = 2x = 2
/// ```
pub fn gradient_4d<F>(f: &F, point: &[f64; 4], h: f64) -> [f64; 4]
where
    F: Fn(&[f64]) -> f64,
{
    [
        partial_derivative(f, point, 0, h),
        partial_derivative(f, point, 1, h),
        partial_derivative(f, point, 2, h),
        partial_derivative(f, point, 3, h),
    ]
}

/// Jacobiana de uma função vetorial F: ℝ⁴ → ℝ⁴
///
/// J = [∂Fᵢ/∂xⱼ] é uma matriz 4×4
///
/// # Example
/// ```
/// use avila_math::calculus::jacobian;
///
/// let f = |p: &[f64]| vec![
///     p[0] * p[0],  // F₁ = x²
///     p[1] * p[1],  // F₂ = y²
///     p[2] * p[2],  // F₃ = z²
///     p[3] * p[3],  // F₄ = w²
/// ];
///
/// let jac = jacobian(&f, &[1.0, 2.0, 3.0, 4.0], 1e-5);
/// assert_eq!(jac.len(), 4);  // 4 linhas
/// assert_eq!(jac[0].len(), 4);  // 4 colunas
/// ```
pub fn jacobian<F>(f: &F, point: &[f64; 4], h: f64) -> Vec<Vec<f64>>
where
    F: Fn(&[f64]) -> Vec<f64>,
{
    let f_dim = f(point).len();
    let mut jac = vec![vec![0.0; 4]; f_dim];

    for (i, jac_row) in jac.iter_mut().enumerate().take(f_dim) {
        for (j, jac_cell) in jac_row.iter_mut().enumerate().take(4) {
            let component_f = |p: &[f64]| f(p)[i];
            *jac_cell = partial_derivative(&component_f, point, j, h);
        }
    }

    jac
}

/// Hessiana (matriz de segundas derivadas) de um campo escalar
///
/// H = [∂²f/∂xᵢ∂xⱼ] é uma matriz 4×4 simétrica
pub fn hessian<F>(f: &F, point: &[f64; 4], h: f64) -> Vec<Vec<f64>>
where
    F: Fn(&[f64]) -> f64,
{
    let mut hess = vec![vec![0.0; 4]; 4];

    for i in 0..4 {
        for j in 0..4 {
            // Segunda derivada usando diferenças finitas
            let mut p_pp = *point;
            let mut p_pm = *point;
            let mut p_mp = *point;
            let mut p_mm = *point;

            p_pp[i] += h;
            p_pp[j] += h;
            p_pm[i] += h;
            p_pm[j] -= h;
            p_mp[i] -= h;
            p_mp[j] += h;
            p_mm[i] -= h;
            p_mm[j] -= h;

            hess[i][j] = (f(&p_pp) - f(&p_pm) - f(&p_mp) + f(&p_mm)) / (4.0 * h * h);
        }
    }

    hess
}

/// Derivada direcional: D_v f = ∇f · v
///
/// Mede a taxa de variação de f na direção do vetor v
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

    // Produto escalar ∇f · v
    grad[0] * unit_dir[0] + grad[1] * unit_dir[1] + grad[2] * unit_dir[2] + grad[3] * unit_dir[3]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derivative() {
        let f = |x: f64| x * x;
        let df = derivative(&f, 2.0, 1e-5);
        assert!((df - 4.0).abs() < 1e-4);
    }

    #[test]
    fn test_partial_derivative() {
        let f = |p: &[f64]| p[0] * p[0] + p[1] * p[1];
        let point = vec![1.0, 2.0];

        let dx = partial_derivative(&f, &point, 0, 1e-5);
        let dy = partial_derivative(&f, &point, 1, 1e-5);

        assert!((dx - 2.0).abs() < 1e-4); // ∂f/∂x = 2x = 2
        assert!((dy - 4.0).abs() < 1e-4); // ∂f/∂y = 2y = 4
    }

    #[test]
    fn test_gradient_4d() {
        let f = |p: &[f64]| p[0] * p[0] + p[1] * p[1] + p[2] * p[2] + p[3] * p[3];
        let grad = gradient_4d(&f, &[1.0, 2.0, 3.0, 4.0], 1e-5);

        assert!((grad[0] - 2.0).abs() < 1e-4);
        assert!((grad[1] - 4.0).abs() < 1e-4);
        assert!((grad[2] - 6.0).abs() < 1e-4);
        assert!((grad[3] - 8.0).abs() < 1e-4);
    }

    #[test]
    fn test_jacobian() {
        let f = |p: &[f64]| vec![p[0] * p[0], p[1] * p[1], p[2] * p[2], p[3] * p[3]];
        let jac = jacobian(&f, &[1.0, 2.0, 3.0, 4.0], 1e-5);

        // Jacobiana deve ser diagonal: diag(2x, 2y, 2z, 2w)
        assert!((jac[0][0] - 2.0).abs() < 1e-4);
        assert!((jac[1][1] - 4.0).abs() < 1e-4);
        assert!((jac[2][2] - 6.0).abs() < 1e-4);
        assert!((jac[3][3] - 8.0).abs() < 1e-4);
    }

    #[test]
    fn test_directional_derivative() {
        let f = |p: &[f64]| p[0] * p[0] + p[1] * p[1] + p[2] * p[2] + p[3] * p[3];
        let point = [1.0, 0.0, 0.0, 0.0];
        let direction = [1.0, 0.0, 0.0, 0.0]; // direção x

        let d_v = directional_derivative(&f, &point, &direction, 1e-5);
        assert!((d_v - 2.0).abs() < 1e-4); // ∇f · (1,0,0,0) = 2
    }
}

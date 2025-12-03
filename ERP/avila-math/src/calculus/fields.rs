//! Campos vetoriais e escalares 4D

use crate::calculus::differential::{gradient_4d, partial_derivative};

/// Campo vetorial 4D: F: ℝ⁴ → ℝ⁴
///
/// F(x, y, z, w) = (F₁, F₂, F₃, F₄)
pub struct VectorField4D<F>
where
    F: Fn(&[f64; 4]) -> [f64; 4],
{
    pub field: F,
}

impl<F> VectorField4D<F>
where
    F: Fn(&[f64; 4]) -> [f64; 4],
{
    pub fn new(field: F) -> Self {
        Self { field }
    }

    /// Avalia o campo em um ponto
    pub fn eval(&self, point: &[f64; 4]) -> [f64; 4] {
        (self.field)(point)
    }

    /// Divergência do campo: ∇·F = ∂F₁/∂x + ∂F₂/∂y + ∂F₃/∂z + ∂F₄/∂w
    pub fn divergence(&self, point: &[f64; 4], h: f64) -> f64 {
        divergence_4d(&self.field, point, h)
    }
}

/// Campo escalar 4D: f: ℝ⁴ → ℝ
pub fn scalar_field_4d<F>(f: F) -> impl Fn(&[f64; 4]) -> f64
where
    F: Fn(&[f64; 4]) -> f64,
{
    f
}

/// Campo vetorial 4D: F: ℝ⁴ → ℝ⁴
pub fn vector_field_4d<F>(f: F) -> VectorField4D<F>
where
    F: Fn(&[f64; 4]) -> [f64; 4],
{
    VectorField4D::new(f)
}

/// Divergência de um campo vetorial 4D
///
/// ∇·F = ∂F₁/∂x + ∂F₂/∂y + ∂F₃/∂z + ∂F₄/∂w
///
/// # Example
/// ```
/// use avila_math::calculus::fields::divergence_4d;
///
/// // Campo F = (x, y, z, w)
/// let f = |p: &[f64; 4]| [p[0], p[1], p[2], p[3]];
///
/// let div = divergence_4d(&f, &[1.0, 2.0, 3.0, 4.0], 1e-5);
/// assert!((div - 4.0).abs() < 1e-4);  // div = 1+1+1+1 = 4
/// ```
pub fn divergence_4d<F>(field: &F, point: &[f64; 4], h: f64) -> f64
where
    F: Fn(&[f64; 4]) -> [f64; 4],
{
    let f1 = |p: &[f64]| field(&[p[0], p[1], p[2], p[3]])[0];
    let f2 = |p: &[f64]| field(&[p[0], p[1], p[2], p[3]])[1];
    let f3 = |p: &[f64]| field(&[p[0], p[1], p[2], p[3]])[2];
    let f4 = |p: &[f64]| field(&[p[0], p[1], p[2], p[3]])[3];

    partial_derivative(&f1, point, 0, h)
        + partial_derivative(&f2, point, 1, h)
        + partial_derivative(&f3, point, 2, h)
        + partial_derivative(&f4, point, 3, h)
}

/// Curl 4D (análogo ao rotacional em 3D)
///
/// Em 4D, o curl é um bivector (6 componentes) representando a rotação
/// em cada um dos 6 planos coordenados: xy, xz, xw, yz, yw, zw
///
/// Retorna [curl_xy, curl_xz, curl_xw, curl_yz, curl_yw, curl_zw]
pub fn curl_4d<F>(field: &F, point: &[f64; 4], h: f64) -> [f64; 6]
where
    F: Fn(&[f64; 4]) -> [f64; 4],
{
    let f = |p: &[f64; 4]| field(p);

    // Componentes do campo
    let f1 = |p: &[f64]| f(&[p[0], p[1], p[2], p[3]])[0];
    let f2 = |p: &[f64]| f(&[p[0], p[1], p[2], p[3]])[1];
    let f3 = |p: &[f64]| f(&[p[0], p[1], p[2], p[3]])[2];
    let f4 = |p: &[f64]| f(&[p[0], p[1], p[2], p[3]])[3];

    // Curl nos 6 planos
    [
        // Plano xy: ∂F₂/∂x - ∂F₁/∂y
        partial_derivative(&f2, point, 0, h) - partial_derivative(&f1, point, 1, h),
        // Plano xz: ∂F₃/∂x - ∂F₁/∂z
        partial_derivative(&f3, point, 0, h) - partial_derivative(&f1, point, 2, h),
        // Plano xw: ∂F₄/∂x - ∂F₁/∂w
        partial_derivative(&f4, point, 0, h) - partial_derivative(&f1, point, 3, h),
        // Plano yz: ∂F₃/∂y - ∂F₂/∂z
        partial_derivative(&f3, point, 1, h) - partial_derivative(&f2, point, 2, h),
        // Plano yw: ∂F₄/∂y - ∂F₂/∂w
        partial_derivative(&f4, point, 1, h) - partial_derivative(&f2, point, 3, h),
        // Plano zw: ∂F₄/∂z - ∂F₃/∂w
        partial_derivative(&f4, point, 2, h) - partial_derivative(&f3, point, 3, h),
    ]
}

/// Campo gradiente de um escalar: grad(f) = ∇f
pub fn gradient_field<F>(scalar_field: F) -> impl Fn(&[f64; 4]) -> [f64; 4]
where
    F: Fn(&[f64]) -> f64,
{
    move |point: &[f64; 4]| gradient_4d(&scalar_field, point, 1e-7)
}

/// Campo de velocidade radial 4D: v = r̂ (aponta para fora da origem)
pub fn radial_field() -> impl Fn(&[f64; 4]) -> [f64; 4] {
    |p: &[f64; 4]| {
        let norm = (p[0] * p[0] + p[1] * p[1] + p[2] * p[2] + p[3] * p[3]).sqrt();
        if norm == 0.0 {
            [0.0, 0.0, 0.0, 0.0]
        } else {
            [p[0] / norm, p[1] / norm, p[2] / norm, p[3] / norm]
        }
    }
}

/// Campo constante 4D
pub fn constant_field(value: [f64; 4]) -> impl Fn(&[f64; 4]) -> [f64; 4] {
    move |_: &[f64; 4]| value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_divergence_identity() {
        // Campo F = (x, y, z, w)
        let f = |p: &[f64; 4]| [p[0], p[1], p[2], p[3]];
        let div = divergence_4d(&f, &[1.0, 2.0, 3.0, 4.0], 1e-5);

        // div(x, y, z, w) = 1+1+1+1 = 4
        assert!((div - 4.0).abs() < 1e-4);
    }

    #[test]
    fn test_divergence_zero() {
        // Campo incompressível: F = (y, -x, 0, 0)
        let f = |p: &[f64; 4]| [p[1], -p[0], 0.0, 0.0];
        let div = divergence_4d(&f, &[1.0, 2.0, 0.0, 0.0], 1e-5);

        // div = 0
        assert!(div.abs() < 1e-4);
    }

    #[test]
    fn test_curl_4d() {
        // Campo rotacional simples
        let f = |p: &[f64; 4]| [p[1], -p[0], 0.0, 0.0];
        let curl = curl_4d(&f, &[1.0, 2.0, 0.0, 0.0], 1e-5);

        // No plano xy, curl deve ser não-zero
        assert!(curl[0].abs() > 1e-4);
    }

    #[test]
    fn test_radial_field() {
        let field = radial_field();
        let v = field(&[3.0, 0.0, 0.0, 0.0]);

        // Campo radial em (3,0,0,0) deve ser (1,0,0,0)
        assert!((v[0] - 1.0).abs() < 1e-10);
        assert!(v[1].abs() < 1e-10);
        assert!(v[2].abs() < 1e-10);
        assert!(v[3].abs() < 1e-10);
    }

    #[test]
    fn test_vector_field_4d() {
        let field = vector_field_4d(|p: &[f64; 4]| [p[0], p[1], p[2], p[3]]);
        let v = field.eval(&[1.0, 2.0, 3.0, 4.0]);

        assert_eq!(v, [1.0, 2.0, 3.0, 4.0]);
    }
}

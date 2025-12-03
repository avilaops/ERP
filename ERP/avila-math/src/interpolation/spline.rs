//! Splines cúbicas 4D

/// Interpolação linear para uso interno
#[allow(dead_code)]
fn lerp_4d(a: &[f64; 4], b: &[f64; 4], t: f64) -> [f64; 4] {
    [
        a[0] + t * (b[0] - a[0]),
        a[1] + t * (b[1] - a[1]),
        a[2] + t * (b[2] - a[2]),
        a[3] + t * (b[3] - a[3]),
    ]
}

/// Spline cúbica natural 4D
pub struct CubicSpline4D {
    pub points: Vec<[f64; 4]>,
    pub coefficients: Vec<[[f64; 4]; 4]>, // a, b, c, d para cada segmento
}

impl CubicSpline4D {
    /// Cria uma spline cúbica natural através dos pontos dados
    ///
    /// Os pontos são igualmente espaçados em t ∈ [0, 1]
    pub fn new(points: Vec<[f64; 4]>) -> Self {
        let n = points.len();
        if n < 2 {
            return Self {
                points: points.clone(),
                coefficients: vec![],
            };
        }

        let mut coefficients = Vec::with_capacity(n - 1);

        // Para spline cúbica natural, usamos condições de fronteira zero
        // Isso é uma simplificação - implementação completa requer resolver sistema tridiagonal

        for i in 0..n - 1 {
            // Coeficientes para o polinômio cúbico p(t) = a + bt + ct² + dt³
            let a = points[i];
            let d = if i < n - 2 {
                // Estimativa simples da segunda derivada
                let delta_next = [
                    points[i + 2][0] - points[i + 1][0],
                    points[i + 2][1] - points[i + 1][1],
                    points[i + 2][2] - points[i + 1][2],
                    points[i + 2][3] - points[i + 1][3],
                ];
                let delta_curr = [
                    points[i + 1][0] - points[i][0],
                    points[i + 1][1] - points[i][1],
                    points[i + 1][2] - points[i][2],
                    points[i + 1][3] - points[i][3],
                ];
                [
                    (delta_next[0] - delta_curr[0]) / 2.0,
                    (delta_next[1] - delta_curr[1]) / 2.0,
                    (delta_next[2] - delta_curr[2]) / 2.0,
                    (delta_next[3] - delta_curr[3]) / 2.0,
                ]
            } else {
                [0.0; 4]
            };

            let delta = [
                points[i + 1][0] - points[i][0],
                points[i + 1][1] - points[i][1],
                points[i + 1][2] - points[i][2],
                points[i + 1][3] - points[i][3],
            ];

            let c = [
                3.0 * delta[0] - 2.0 * d[0],
                3.0 * delta[1] - 2.0 * d[1],
                3.0 * delta[2] - 2.0 * d[2],
                3.0 * delta[3] - 2.0 * d[3],
            ];

            let b = [
                delta[0] - c[0] - d[0],
                delta[1] - c[1] - d[1],
                delta[2] - c[2] - d[2],
                delta[3] - c[3] - d[3],
            ];

            coefficients.push([a, b, c, d]);
        }

        Self {
            points,
            coefficients,
        }
    }

    /// Avalia a spline no parâmetro t ∈ [0, 1]
    pub fn eval(&self, t: f64) -> [f64; 4] {
        if self.points.is_empty() {
            return [0.0; 4];
        }

        if self.points.len() == 1 {
            return self.points[0];
        }

        let n = self.points.len() - 1;
        let segment = ((t * n as f64).floor() as usize).min(n - 1);
        let local_t = (t * n as f64) - segment as f64;

        let [a, b, c, d] = self.coefficients[segment];

        let t2 = local_t * local_t;
        let t3 = t2 * local_t;

        [
            a[0] + b[0] * local_t + c[0] * t2 + d[0] * t3,
            a[1] + b[1] * local_t + c[1] * t2 + d[1] * t3,
            a[2] + b[2] * local_t + c[2] * t2 + d[2] * t3,
            a[3] + b[3] * local_t + c[3] * t2 + d[3] * t3,
        ]
    }

    /// Retorna a derivada (tangente) em t
    pub fn derivative(&self, t: f64) -> [f64; 4] {
        if self.coefficients.is_empty() {
            return [0.0; 4];
        }

        let n = self.points.len() - 1;
        let segment = ((t * n as f64).floor() as usize).min(n - 1);
        let local_t = (t * n as f64) - segment as f64;

        let [_a, b, c, d] = self.coefficients[segment];

        let t2 = local_t * local_t;

        [
            b[0] + 2.0 * c[0] * local_t + 3.0 * d[0] * t2,
            b[1] + 2.0 * c[1] * local_t + 3.0 * d[1] * t2,
            b[2] + 2.0 * c[2] * local_t + 3.0 * d[2] * t2,
            b[3] + 2.0 * c[3] * local_t + 3.0 * d[3] * t2,
        ]
    }
}

/// Spline de Catmull-Rom 4D (passa por todos os pontos de controle)
///
/// Catmull-Rom é um tipo especial de spline que garante interpolação através
/// de todos os pontos de controle com continuidade C¹.
pub fn catmull_rom_4d(
    p0: &[f64; 4],
    p1: &[f64; 4],
    p2: &[f64; 4],
    p3: &[f64; 4],
    t: f64,
    tension: f64,
) -> [f64; 4] {
    let t2 = t * t;
    let t3 = t2 * t;

    let s = (1.0 - tension) / 2.0;

    // Tangentes
    let m1 = [
        s * (p2[0] - p0[0]),
        s * (p2[1] - p0[1]),
        s * (p2[2] - p0[2]),
        s * (p2[3] - p0[3]),
    ];

    let m2 = [
        s * (p3[0] - p1[0]),
        s * (p3[1] - p1[1]),
        s * (p3[2] - p1[2]),
        s * (p3[3] - p1[3]),
    ];

    // Coeficientes de Hermite
    let c0 = 2.0 * t3 - 3.0 * t2 + 1.0;
    let c1 = t3 - 2.0 * t2 + t;
    let c2 = -2.0 * t3 + 3.0 * t2;
    let c3 = t3 - t2;

    [
        c0 * p1[0] + c1 * m1[0] + c2 * p2[0] + c3 * m2[0],
        c0 * p1[1] + c1 * m1[1] + c2 * p2[1] + c3 * m2[1],
        c0 * p1[2] + c1 * m1[2] + c2 * p2[2] + c3 * m2[2],
        c0 * p1[3] + c1 * m1[3] + c2 * p2[3] + c3 * m2[3],
    ]
}

/// Wrapper conveniente para spline cúbica
pub fn cubic_spline_4d(points: &[[f64; 4]], t: f64) -> [f64; 4] {
    let spline = CubicSpline4D::new(points.to_vec());
    spline.eval(t)
}

/// B-spline uniforme 4D (grau 3)
pub fn bspline_4d(control_points: &[[f64; 4]], t: f64) -> [f64; 4] {
    let n = control_points.len();
    if n < 4 {
        return if n > 0 { control_points[0] } else { [0.0; 4] };
    }

    // Escala t para o domínio válido
    let t_scaled = t * (n - 3) as f64;
    let i = t_scaled.floor() as usize;
    let u = t_scaled - i as f64;

    let i = i.min(n - 4);

    // Matriz base de B-spline cúbica
    let u2 = u * u;
    let u3 = u2 * u;

    let b0 = (1.0 - u).powi(3) / 6.0;
    let b1 = (3.0 * u3 - 6.0 * u2 + 4.0) / 6.0;
    let b2 = (-3.0 * u3 + 3.0 * u2 + 3.0 * u + 1.0) / 6.0;
    let b3 = u3 / 6.0;

    [
        b0 * control_points[i][0]
            + b1 * control_points[i + 1][0]
            + b2 * control_points[i + 2][0]
            + b3 * control_points[i + 3][0],
        b0 * control_points[i][1]
            + b1 * control_points[i + 1][1]
            + b2 * control_points[i + 2][1]
            + b3 * control_points[i + 3][1],
        b0 * control_points[i][2]
            + b1 * control_points[i + 1][2]
            + b2 * control_points[i + 2][2]
            + b3 * control_points[i + 3][2],
        b0 * control_points[i][3]
            + b1 * control_points[i + 1][3]
            + b2 * control_points[i + 2][3]
            + b3 * control_points[i + 3][3],
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cubic_spline() {
        let points = vec![
            [0.0, 0.0, 0.0, 0.0],
            [1.0, 1.0, 1.0, 1.0],
            [2.0, 0.0, 0.0, 0.0],
        ];

        let spline = CubicSpline4D::new(points.clone());

        let start = spline.eval(0.0);
        assert_eq!(start, points[0]);

        let end = spline.eval(1.0);
        // Deve estar próximo do último ponto
        assert!((end[0] - points[2][0]).abs() < 0.1);
    }

    #[test]
    fn test_catmull_rom() {
        let p0 = [0.0, 0.0, 0.0, 0.0];
        let p1 = [1.0, 0.0, 0.0, 0.0];
        let p2 = [2.0, 0.0, 0.0, 0.0];
        let p3 = [3.0, 0.0, 0.0, 0.0];

        // t=0 deve retornar p1
        let start = catmull_rom_4d(&p0, &p1, &p2, &p3, 0.0, 0.0);
        assert_eq!(start, p1);

        // t=1 deve retornar p2
        let end = catmull_rom_4d(&p0, &p1, &p2, &p3, 1.0, 0.0);
        assert_eq!(end, p2);
    }

    #[test]
    fn test_bspline() {
        let points = vec![
            [0.0, 0.0, 0.0, 0.0],
            [1.0, 1.0, 1.0, 1.0],
            [2.0, 0.0, 0.0, 0.0],
            [3.0, 1.0, 1.0, 1.0],
        ];

        let start = bspline_4d(&points, 0.0);
        let end = bspline_4d(&points, 1.0);

        // B-spline não passa exatamente pelos pontos de controle,
        // mas deve estar perto
        assert!(start[0] >= 0.0 && start[0] <= 3.0);
        assert!(end[0] >= 0.0 && end[0] <= 3.0);
    }
}

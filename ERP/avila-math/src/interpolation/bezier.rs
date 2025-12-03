//! Curvas de Bézier 4D

/// Interpolação linear para uso interno
fn lerp_4d(a: &[f64; 4], b: &[f64; 4], t: f64) -> [f64; 4] {
    [
        a[0] + t * (b[0] - a[0]),
        a[1] + t * (b[1] - a[1]),
        a[2] + t * (b[2] - a[2]),
        a[3] + t * (b[3] - a[3]),
    ]
}

/// Curva de Bézier 4D de ordem arbitrária
pub struct BezierCurve4D {
    pub control_points: Vec<[f64; 4]>,
}

impl BezierCurve4D {
    pub fn new(control_points: Vec<[f64; 4]>) -> Self {
        Self { control_points }
    }

    /// Avalia a curva de Bézier no parâmetro t ∈ [0, 1]
    ///
    /// Usa algoritmo de De Casteljau para estabilidade numérica
    pub fn eval(&self, t: f64) -> [f64; 4] {
        if self.control_points.is_empty() {
            return [0.0; 4];
        }

        let mut points = self.control_points.clone();

        while points.len() > 1 {
            let mut next_points = Vec::with_capacity(points.len() - 1);
            for i in 0..points.len() - 1 {
                next_points.push(lerp_4d(&points[i], &points[i + 1], t));
            }
            points = next_points;
        }

        points[0]
    }

    /// Retorna a tangente (derivada) no parâmetro t
    pub fn tangent(&self, t: f64) -> [f64; 4] {
        if self.control_points.len() < 2 {
            return [0.0; 4];
        }

        let n = self.control_points.len() - 1;
        let mut derivative_points = Vec::with_capacity(n);

        for i in 0..n {
            let delta = [
                (n as f64) * (self.control_points[i + 1][0] - self.control_points[i][0]),
                (n as f64) * (self.control_points[i + 1][1] - self.control_points[i][1]),
                (n as f64) * (self.control_points[i + 1][2] - self.control_points[i][2]),
                (n as f64) * (self.control_points[i + 1][3] - self.control_points[i][3]),
            ];
            derivative_points.push(delta);
        }

        let derivative_curve = BezierCurve4D::new(derivative_points);
        derivative_curve.eval(t)
    }

    /// Comprimento aproximado da curva usando Simpson's rule
    pub fn arc_length(&self, samples: usize) -> f64 {
        let mut length = 0.0;
        let dt = 1.0 / (samples as f64);

        for i in 0..samples {
            let t = i as f64 * dt;
            let tangent = self.tangent(t);
            let speed =
                (tangent[0].powi(2) + tangent[1].powi(2) + tangent[2].powi(2) + tangent[3].powi(2))
                    .sqrt();
            length += speed * dt;
        }

        length
    }
}

/// Curva de Bézier quadrática 4D (3 pontos de controle)
pub fn bezier_quadratic_4d(p0: &[f64; 4], p1: &[f64; 4], p2: &[f64; 4], t: f64) -> [f64; 4] {
    let u = 1.0 - t;
    let a = u * u;
    let b = 2.0 * u * t;
    let c = t * t;

    [
        a * p0[0] + b * p1[0] + c * p2[0],
        a * p0[1] + b * p1[1] + c * p2[1],
        a * p0[2] + b * p1[2] + c * p2[2],
        a * p0[3] + b * p1[3] + c * p2[3],
    ]
}

/// Curva de Bézier cúbica 4D (4 pontos de controle)
pub fn bezier_cubic_4d(
    p0: &[f64; 4],
    p1: &[f64; 4],
    p2: &[f64; 4],
    p3: &[f64; 4],
    t: f64,
) -> [f64; 4] {
    let u = 1.0 - t;
    let a = u * u * u;
    let b = 3.0 * u * u * t;
    let c = 3.0 * u * t * t;
    let d = t * t * t;

    [
        a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
        a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
        a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
        a * p0[3] + b * p1[3] + c * p2[3] + d * p3[3],
    ]
}

/// Curva de Bézier genérica usando fórmula de Bernstein
pub fn bezier_curve_4d(control_points: &[[f64; 4]], t: f64) -> [f64; 4] {
    let curve = BezierCurve4D::new(control_points.to_vec());
    curve.eval(t)
}

/// Superfície de Bézier 4D (tensor product de curvas)
pub fn bezier_surface_4d(control_grid: &[Vec<[f64; 4]>], u: f64, v: f64) -> [f64; 4] {
    // Interpola ao longo de u primeiro
    let mut u_curves = Vec::new();
    for row in control_grid {
        let curve = BezierCurve4D::new(row.clone());
        u_curves.push(curve.eval(u));
    }

    // Depois interpola ao longo de v
    let v_curve = BezierCurve4D::new(u_curves);
    v_curve.eval(v)
}

/// Eleva o grau de uma curva de Bézier (degree elevation)
pub fn elevate_degree(control_points: &[[f64; 4]]) -> Vec<[f64; 4]> {
    let n = control_points.len() - 1;
    let mut elevated = Vec::with_capacity(n + 2);

    elevated.push(control_points[0]);

    for i in 1..=n {
        let alpha = (i as f64) / ((n + 1) as f64);
        let p = lerp_4d(&control_points[i - 1], &control_points[i], alpha);
        elevated.push(p);
    }

    elevated.push(control_points[n]);
    elevated
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bezier_linear() {
        let p0 = [0.0, 0.0, 0.0, 0.0];
        let p1 = [1.0, 1.0, 1.0, 1.0];

        let curve = BezierCurve4D::new(vec![p0, p1]);

        let start = curve.eval(0.0);
        assert_eq!(start, p0);

        let end = curve.eval(1.0);
        assert_eq!(end, p1);

        let mid = curve.eval(0.5);
        assert_eq!(mid, [0.5, 0.5, 0.5, 0.5]);
    }

    #[test]
    fn test_bezier_quadratic() {
        let p0 = [0.0, 0.0, 0.0, 0.0];
        let p1 = [1.0, 2.0, 3.0, 4.0]; // Ponto de controle
        let p2 = [2.0, 0.0, 0.0, 0.0];

        let result = bezier_quadratic_4d(&p0, &p1, &p2, 0.5);

        // No meio da curva quadrática
        assert_eq!(result[0], 1.0);
    }

    #[test]
    fn test_bezier_cubic() {
        let p0 = [0.0, 0.0, 0.0, 0.0];
        let p1 = [0.0, 1.0, 0.0, 0.0];
        let p2 = [1.0, 1.0, 0.0, 0.0];
        let p3 = [1.0, 0.0, 0.0, 0.0];

        let start = bezier_cubic_4d(&p0, &p1, &p2, &p3, 0.0);
        assert_eq!(start, p0);

        let end = bezier_cubic_4d(&p0, &p1, &p2, &p3, 1.0);
        assert_eq!(end, p3);
    }

    #[test]
    fn test_bezier_tangent() {
        let p0 = [0.0, 0.0, 0.0, 0.0];
        let p1 = [1.0, 0.0, 0.0, 0.0];

        let curve = BezierCurve4D::new(vec![p0, p1]);
        let tangent = curve.tangent(0.5);

        // Tangente de linha reta deve ser constante
        assert_eq!(tangent, [1.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn test_degree_elevation() {
        let p0 = [0.0, 0.0, 0.0, 0.0];
        let p1 = [1.0, 1.0, 1.0, 1.0];

        let elevated = elevate_degree(&[p0, p1]);
        assert_eq!(elevated.len(), 3);
    }
}

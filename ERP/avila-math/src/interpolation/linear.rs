//! Interpolação linear para dados 4D

/// Interpolação linear 1D entre dois pontos 4D
///
/// lerp(a, b, t) = a + t(b - a) = (1-t)a + tb
///
/// # Example
/// ```
/// use avila_math::interpolation::lerp_4d;
///
/// let a = [0.0, 0.0, 0.0, 0.0];
/// let b = [1.0, 1.0, 1.0, 1.0];
/// let result = lerp_4d(&a, &b, 0.5);
///
/// assert_eq!(result, [0.5, 0.5, 0.5, 0.5]);
/// ```
pub fn lerp_4d(a: &[f64; 4], b: &[f64; 4], t: f64) -> [f64; 4] {
    [
        a[0] + t * (b[0] - a[0]),
        a[1] + t * (b[1] - a[1]),
        a[2] + t * (b[2] - a[2]),
        a[3] + t * (b[3] - a[3]),
    ]
}

/// Interpolação bilinear 2D em espaço 4D
///
/// Interpola entre 4 pontos em um quadrado unitário
pub fn bilinear_4d(
    p00: &[f64; 4],
    p01: &[f64; 4],
    p10: &[f64; 4],
    p11: &[f64; 4],
    u: f64,
    v: f64,
) -> [f64; 4] {
    let p0 = lerp_4d(p00, p01, v);
    let p1 = lerp_4d(p10, p11, v);
    lerp_4d(&p0, &p1, u)
}

/// Interpolação trilinear 3D em espaço 4D
///
/// Interpola entre 8 pontos em um cubo unitário
#[allow(clippy::too_many_arguments)]
pub fn trilinear_4d(
    p000: &[f64; 4],
    p001: &[f64; 4],
    p010: &[f64; 4],
    p011: &[f64; 4],
    p100: &[f64; 4],
    p101: &[f64; 4],
    p110: &[f64; 4],
    p111: &[f64; 4],
    u: f64,
    v: f64,
    w: f64,
) -> [f64; 4] {
    let p00 = lerp_4d(p000, p001, w);
    let p01 = lerp_4d(p010, p011, w);
    let p10 = lerp_4d(p100, p101, w);
    let p11 = lerp_4d(p110, p111, w);

    bilinear_4d(&p00, &p01, &p10, &p11, u, v)
}

/// Interpolação quadrilinear 4D (hipercubo)
///
/// Interpola entre 16 pontos em um hipercubo unitário
#[allow(clippy::too_many_arguments)]
pub fn quadrilinear_4d(points: &[[f64; 4]; 16], u: f64, v: f64, w: f64, t: f64) -> [f64; 4] {
    // Interpolação trilinear nas duas "fatias" do hipercubo
    let slice0 = trilinear_4d(
        &points[0], &points[1], &points[2], &points[3], &points[4], &points[5], &points[6],
        &points[7], u, v, w,
    );

    let slice1 = trilinear_4d(
        &points[8],
        &points[9],
        &points[10],
        &points[11],
        &points[12],
        &points[13],
        &points[14],
        &points[15],
        u,
        v,
        w,
    );

    // Interpolação linear entre as fatias
    lerp_4d(&slice0, &slice1, t)
}

/// Interpolação coseno (suave)
pub fn cosine_interp_4d(a: &[f64; 4], b: &[f64; 4], t: f64) -> [f64; 4] {
    let mu = (1.0 - (t * std::f64::consts::PI).cos()) / 2.0;
    lerp_4d(a, b, mu)
}

/// Interpolação cúbica Hermite
pub fn cubic_hermite_4d(
    p0: &[f64; 4],
    m0: &[f64; 4],
    p1: &[f64; 4],
    m1: &[f64; 4],
    t: f64,
) -> [f64; 4] {
    let t2 = t * t;
    let t3 = t2 * t;

    let h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
    let h10 = t3 - 2.0 * t2 + t;
    let h01 = -2.0 * t3 + 3.0 * t2;
    let h11 = t3 - t2;

    [
        h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0],
        h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1],
        h00 * p0[2] + h10 * m0[2] + h01 * p1[2] + h11 * m1[2],
        h00 * p0[3] + h10 * m0[3] + h01 * p1[3] + h11 * m1[3],
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lerp_4d() {
        let a = [0.0, 0.0, 0.0, 0.0];
        let b = [1.0, 1.0, 1.0, 1.0];

        let mid = lerp_4d(&a, &b, 0.5);
        assert_eq!(mid, [0.5, 0.5, 0.5, 0.5]);

        let start = lerp_4d(&a, &b, 0.0);
        assert_eq!(start, a);

        let end = lerp_4d(&a, &b, 1.0);
        assert_eq!(end, b);
    }

    #[test]
    fn test_bilinear_4d() {
        let p00 = [0.0, 0.0, 0.0, 0.0];
        let p01 = [0.0, 1.0, 0.0, 0.0];
        let p10 = [1.0, 0.0, 0.0, 0.0];
        let p11 = [1.0, 1.0, 0.0, 0.0];

        let center = bilinear_4d(&p00, &p01, &p10, &p11, 0.5, 0.5);
        assert_eq!(center, [0.5, 0.5, 0.0, 0.0]);
    }

    #[test]
    fn test_cosine_interp() {
        let a = [0.0, 0.0, 0.0, 0.0];
        let b = [1.0, 1.0, 1.0, 1.0];

        let result = cosine_interp_4d(&a, &b, 0.5);
        assert!((result[0] - 0.5).abs() < 0.01);
    }
}

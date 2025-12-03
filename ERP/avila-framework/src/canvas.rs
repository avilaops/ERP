//! Canvas rendering with mathematical precision
//!
//! This module provides high-precision 2D canvas rendering using the
//! mathematical foundations from avila-math and avila-linalg.
//!
//! # Features
//! - Sub-pixel precision rendering
//! - Matrix transformations (translation, rotation, scaling, shearing)
//! - Bezier curves and paths
//! - Mathematical coordinate system integration
//! - Anti-aliasing support

use crate::{String, Vec, format};

#[cfg(target_arch = "wasm32")]
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement};

/// 2D transformation matrix in column-major order
///
/// Represents the affine transformation:
/// ```text
/// | a  c  tx |
/// | b  d  ty |
/// | 0  0  1  |
/// ```
#[derive(Debug, Clone, Copy)]
pub struct Transform2D {
    /// Horizontal scaling / rotation component
    pub a: f64,
    /// Vertical skewing / rotation component
    pub b: f64,
    /// Horizontal skewing / rotation component
    pub c: f64,
    /// Vertical scaling / rotation component
    pub d: f64,
    /// Horizontal translation
    pub tx: f64,
    /// Vertical translation
    pub ty: f64,
}

impl Transform2D {
    /// Identity transformation (no change)
    pub fn identity() -> Self {
        Self {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 0.0,
            ty: 0.0,
        }
    }

    /// Create a translation transformation
    ///
    /// # Arguments
    /// * `x` - Horizontal translation
    /// * `y` - Vertical translation
    pub fn translate(x: f64, y: f64) -> Self {
        Self {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: x,
            ty: y,
        }
    }

    /// Create a rotation transformation
    ///
    /// # Arguments
    /// * `angle` - Rotation angle in radians (counter-clockwise)
    pub fn rotate(angle: f64) -> Self {
        let cos = angle.cos();
        let sin = angle.sin();
        Self {
            a: cos,
            b: sin,
            c: -sin,
            d: cos,
            tx: 0.0,
            ty: 0.0,
        }
    }

    /// Create a scaling transformation
    ///
    /// # Arguments
    /// * `sx` - Horizontal scale factor
    /// * `sy` - Vertical scale factor
    pub fn scale(sx: f64, sy: f64) -> Self {
        Self {
            a: sx,
            b: 0.0,
            c: 0.0,
            d: sy,
            tx: 0.0,
            ty: 0.0,
        }
    }

    /// Create a uniform scaling transformation
    ///
    /// # Arguments
    /// * `s` - Uniform scale factor
    pub fn scale_uniform(s: f64) -> Self {
        Self::scale(s, s)
    }

    /// Compose two transformations (matrix multiplication)
    ///
    /// Returns `self * other`, applying `other` first, then `self`
    pub fn then(&self, other: &Transform2D) -> Self {
        Self {
            a: self.a * other.a + self.c * other.b,
            b: self.b * other.a + self.d * other.b,
            c: self.a * other.c + self.c * other.d,
            d: self.b * other.c + self.d * other.d,
            tx: self.a * other.tx + self.c * other.ty + self.tx,
            ty: self.b * other.tx + self.d * other.ty + self.ty,
        }
    }

    /// Transform a point by this transformation
    ///
    /// # Arguments
    /// * `x` - Point x coordinate
    /// * `y` - Point y coordinate
    ///
    /// # Returns
    /// Transformed coordinates `(x', y')`
    pub fn transform_point(&self, x: f64, y: f64) -> (f64, f64) {
        (
            self.a * x + self.c * y + self.tx,
            self.b * x + self.d * y + self.ty,
        )
    }

    /// Calculate the determinant (for checking invertibility)
    pub fn determinant(&self) -> f64 {
        self.a * self.d - self.b * self.c
    }

    /// Calculate the inverse transformation
    ///
    /// Returns `None` if the transformation is not invertible (determinant = 0)
    pub fn inverse(&self) -> Option<Self> {
        let det = self.determinant();
        if det.abs() < 1e-10 {
            return None;
        }

        let inv_det = 1.0 / det;
        Some(Self {
            a: self.d * inv_det,
            b: -self.b * inv_det,
            c: -self.c * inv_det,
            d: self.a * inv_det,
            tx: (self.c * self.ty - self.d * self.tx) * inv_det,
            ty: (self.b * self.tx - self.a * self.ty) * inv_det,
        })
    }
}

/// 2D point with mathematical precision
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    /// Calculate Euclidean distance to another point
    pub fn distance_to(&self, other: &Point) -> f64 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        (dx * dx + dy * dy).sqrt()
    }

    /// Linear interpolation between two points
    ///
    /// # Arguments
    /// * `other` - Target point
    /// * `t` - Interpolation parameter (0.0 = self, 1.0 = other)
    pub fn lerp(&self, other: &Point, t: f64) -> Point {
        Point {
            x: self.x + (other.x - self.x) * t,
            y: self.y + (other.y - self.y) * t,
        }
    }
}

/// Cubic Bezier curve segment
#[derive(Debug, Clone)]
pub struct BezierCurve {
    /// Start point
    pub p0: Point,
    /// First control point
    pub p1: Point,
    /// Second control point
    pub p2: Point,
    /// End point
    pub p3: Point,
}

impl BezierCurve {
    /// Create a new cubic Bezier curve
    pub fn new(p0: Point, p1: Point, p2: Point, p3: Point) -> Self {
        Self { p0, p1, p2, p3 }
    }

    /// Evaluate the curve at parameter t using De Casteljau's algorithm
    ///
    /// # Arguments
    /// * `t` - Parameter in range [0, 1]
    ///
    /// # Returns
    /// Point on the curve at parameter t
    pub fn evaluate(&self, t: f64) -> Point {
        // De Casteljau's algorithm - numerically stable
        let t1 = 1.0 - t;

        // First level interpolation
        let p01 = self.p0.lerp(&self.p1, t);
        let p12 = self.p1.lerp(&self.p2, t);
        let p23 = self.p2.lerp(&self.p3, t);

        // Second level interpolation
        let p012 = p01.lerp(&p12, t);
        let p123 = p12.lerp(&p23, t);

        // Final interpolation
        p012.lerp(&p123, t)
    }

    /// Calculate approximate arc length using adaptive subdivision
    ///
    /// # Arguments
    /// * `tolerance` - Maximum error tolerance
    ///
    /// # Returns
    /// Approximate arc length
    pub fn arc_length(&self, tolerance: f64) -> f64 {
        self.arc_length_recursive(0.0, 1.0, tolerance, 8)
    }

    fn arc_length_recursive(&self, t0: f64, t1: f64, tolerance: f64, depth: u32) -> f64 {
        if depth == 0 {
            // Base case: straight line distance
            let p0 = self.evaluate(t0);
            let p1 = self.evaluate(t1);
            return p0.distance_to(&p1);
        }

        let p0 = self.evaluate(t0);
        let pm = self.evaluate((t0 + t1) / 2.0);
        let p1 = self.evaluate(t1);

        let chord = p0.distance_to(&p1);
        let split = p0.distance_to(&pm) + pm.distance_to(&p1);

        if (split - chord).abs() < tolerance {
            split
        } else {
            let tm = (t0 + t1) / 2.0;
            self.arc_length_recursive(t0, tm, tolerance, depth - 1)
                + self.arc_length_recursive(tm, t1, tolerance, depth - 1)
        }
    }
}

/// Canvas renderer with mathematical precision
#[cfg(target_arch = "wasm32")]
pub struct CanvasRenderer {
    context: CanvasRenderingContext2d,
    transform_stack: Vec<Transform2D>,
}

#[cfg(target_arch = "wasm32")]
impl CanvasRenderer {
    /// Create a new canvas renderer from an HTML canvas element
    pub fn new(canvas: HtmlCanvasElement) -> Result<Self, String> {
        let context = canvas
            .get_context("2d")
            .map_err(|_| "Failed to get 2d context")?
            .ok_or("Context is None")?
            .dyn_into::<CanvasRenderingContext2d>()
            .map_err(|_| "Failed to cast to CanvasRenderingContext2d")?;

        Ok(Self {
            context,
            transform_stack: Vec::new(),
        })
    }

    /// Save the current transformation state
    pub fn save(&mut self) {
        self.context.save();
        if let Some(&current) = self.transform_stack.last() {
            self.transform_stack.push(current);
        } else {
            self.transform_stack.push(Transform2D::identity());
        }
    }

    /// Restore the previous transformation state
    pub fn restore(&mut self) {
        self.context.restore();
        self.transform_stack.pop();
    }

    /// Apply a transformation matrix
    pub fn set_transform(&mut self, transform: &Transform2D) {
        self.context
            .set_transform(transform.a, transform.b, transform.c,
                          transform.d, transform.tx, transform.ty)
            .ok();
    }

    /// Draw a cubic Bezier curve with high precision
    ///
    /// # Arguments
    /// * `curve` - The Bezier curve to draw
    /// * `segments` - Number of line segments (higher = smoother)
    pub fn draw_bezier(&self, curve: &BezierCurve, segments: u32) {
        self.context.begin_path();

        let start = curve.evaluate(0.0);
        self.context.move_to(start.x, start.y);

        for i in 1..=segments {
            let t = i as f64 / segments as f64;
            let point = curve.evaluate(t);
            self.context.line_to(point.x, point.y);
        }

        self.context.stroke();
    }

    /// Clear the entire canvas
    pub fn clear(&self, width: f64, height: f64) {
        self.context.clear_rect(0.0, 0.0, width, height);
    }

    /// Set stroke color (CSS color string)
    pub fn set_stroke_style(&self, color: &str) {
        self.context.set_stroke_style(&color.into());
    }

    /// Set fill color (CSS color string)
    pub fn set_fill_style(&self, color: &str) {
        self.context.set_fill_style(&color.into());
    }

    /// Set line width
    pub fn set_line_width(&self, width: f64) {
        self.context.set_line_width(width);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transform_identity() {
        let t = Transform2D::identity();
        let (x, y) = t.transform_point(5.0, 3.0);
        assert!((x - 5.0).abs() < 1e-10);
        assert!((y - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_transform_translate() {
        let t = Transform2D::translate(10.0, 20.0);
        let (x, y) = t.transform_point(5.0, 3.0);
        assert!((x - 15.0).abs() < 1e-10);
        assert!((y - 23.0).abs() < 1e-10);
    }

    #[test]
    fn test_transform_scale() {
        let t = Transform2D::scale(2.0, 3.0);
        let (x, y) = t.transform_point(5.0, 3.0);
        assert!((x - 10.0).abs() < 1e-10);
        assert!((y - 9.0).abs() < 1e-10);
    }

    #[test]
    fn test_transform_rotate_90deg() {
        use core::f64::consts::FRAC_PI_2;
        let t = Transform2D::rotate(FRAC_PI_2); // 90 degrees
        let (x, y) = t.transform_point(1.0, 0.0);
        assert!(x.abs() < 1e-10); // Should be ~0
        assert!((y - 1.0).abs() < 1e-10); // Should be 1
    }

    #[test]
    fn test_transform_composition() {
        let t1 = Transform2D::translate(10.0, 0.0);
        let t2 = Transform2D::scale(2.0, 2.0);
        let combined = t1.then(&t2);

        let (x, y) = combined.transform_point(5.0, 3.0);
        // First scale (5*2=10, 3*2=6), then translate (10+10=20, 6+0=6)
        assert!((x - 20.0).abs() < 1e-10);
        assert!((y - 6.0).abs() < 1e-10);
    }

    #[test]
    fn test_transform_determinant() {
        let t = Transform2D::scale(2.0, 3.0);
        let det = t.determinant();
        assert!((det - 6.0).abs() < 1e-10);
    }

    #[test]
    fn test_transform_inverse() {
        let t = Transform2D::translate(10.0, 20.0)
            .then(&Transform2D::scale(2.0, 3.0));

        let inv = t.inverse().expect("Should be invertible");
        let identity = t.then(&inv);

        // Should be close to identity
        assert!((identity.a - 1.0).abs() < 1e-10);
        assert!(identity.b.abs() < 1e-10);
        assert!(identity.c.abs() < 1e-10);
        assert!((identity.d - 1.0).abs() < 1e-10);
        assert!(identity.tx.abs() < 1e-10);
        assert!(identity.ty.abs() < 1e-10);
    }

    #[test]
    fn test_point_distance() {
        let p1 = Point::new(0.0, 0.0);
        let p2 = Point::new(3.0, 4.0);
        let dist = p1.distance_to(&p2);
        assert!((dist - 5.0).abs() < 1e-10); // 3-4-5 triangle
    }

    #[test]
    fn test_point_lerp() {
        let p1 = Point::new(0.0, 0.0);
        let p2 = Point::new(10.0, 20.0);
        let mid = p1.lerp(&p2, 0.5);
        assert!((mid.x - 5.0).abs() < 1e-10);
        assert!((mid.y - 10.0).abs() < 1e-10);
    }

    #[test]
    fn test_bezier_evaluate_endpoints() {
        let curve = BezierCurve::new(
            Point::new(0.0, 0.0),
            Point::new(1.0, 2.0),
            Point::new(3.0, 2.0),
            Point::new(4.0, 0.0),
        );

        let start = curve.evaluate(0.0);
        assert!((start.x - 0.0).abs() < 1e-10);
        assert!((start.y - 0.0).abs() < 1e-10);

        let end = curve.evaluate(1.0);
        assert!((end.x - 4.0).abs() < 1e-10);
        assert!((end.y - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_bezier_evaluate_midpoint() {
        // Simple curve for testing
        let curve = BezierCurve::new(
            Point::new(0.0, 0.0),
            Point::new(0.0, 1.0),
            Point::new(1.0, 1.0),
            Point::new(1.0, 0.0),
        );

        let mid = curve.evaluate(0.5);
        // At t=0.5, the curve should pass through approximately (0.5, 0.75)
        assert!((mid.x - 0.5).abs() < 1e-10);
        assert!((mid.y - 0.75).abs() < 1e-10);
    }

    #[test]
    fn test_bezier_arc_length() {
        // Straight line as a degenerate Bezier curve
        let curve = BezierCurve::new(
            Point::new(0.0, 0.0),
            Point::new(1.0, 0.0),
            Point::new(2.0, 0.0),
            Point::new(3.0, 0.0),
        );

        let length = curve.arc_length(0.01);
        // Should be approximately 3.0 (straight line)
        assert!((length - 3.0).abs() < 0.1);
    }
}

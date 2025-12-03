//! Component system with mathematical transformations

use crate::{String, Vec, format};

/// Base component trait
pub trait Component {
    /// Render the component to HTML
    fn render(&self) -> String;

    /// Update component state
    fn update(&mut self);
}

/// Component with mathematical properties
pub struct MathComponent {
    /// Position vector [x, y]
    pub position: [f64; 2],
    /// Scale factor
    pub scale: f64,
    /// Rotation angle (radians)
    pub rotation: f64,
    /// Inner HTML content
    pub content: String,
}

impl MathComponent {
    pub fn new(content: String) -> Self {
        Self {
            position: [0.0, 0.0],
            scale: 1.0,
            rotation: 0.0,
            content,
        }
    }

    /// Apply 2D transformation matrix
    /// Uses avila-linalg for matrix operations
    pub fn transform_matrix(&self) -> [f64; 6] {
        let cos_r = self.rotation.cos();
        let sin_r = self.rotation.sin();

        // CSS transform matrix: [a, b, c, d, tx, ty]
        [
            self.scale * cos_r,
            self.scale * sin_r,
            -self.scale * sin_r,
            self.scale * cos_r,
            self.position[0],
            self.position[1],
        ]
    }
}

impl Component for MathComponent {
    fn render(&self) -> String {
        let matrix = self.transform_matrix();
        format!(
            r#"<div style="transform: matrix({}, {}, {}, {}, {}, {});">{}</div>"#,
            matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5],
            self.content
        )
    }

    fn update(&mut self) {
        // Override in implementations
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::string::ToString;

    #[test]
    fn test_identity_transform() {
        let comp = MathComponent::new("test".to_string());
        let matrix = comp.transform_matrix();
        assert!((matrix[0] - 1.0).abs() < 1e-10);
        assert!(matrix[1].abs() < 1e-10);
        assert!(matrix[2].abs() < 1e-10);
        assert!((matrix[3] - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_scale_transform() {
        let mut comp = MathComponent::new("test".to_string());
        comp.scale = 2.0;
        let matrix = comp.transform_matrix();
        assert!((matrix[0] - 2.0).abs() < 1e-10);
        assert!((matrix[3] - 2.0).abs() < 1e-10);
    }
}

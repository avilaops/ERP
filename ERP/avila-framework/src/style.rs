//! Style system for component styling
//!
//! This module provides a CSS-like styling system with mathematical
//! color manipulation, unit conversion, and style composition.
//!
//! # Features
//! - Color (RGB, RGBA, HSL, HSLA, Hex)
//! - Units (px, em, rem, %, vh, vw)
//! - Styles (background, border, padding, margin)
//! - Style composition and inheritance
//! - Color manipulation (lighten, darken, saturate)

use crate::{String, Vec, format};

/// Color representation
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Color {
    pub r: f64,
    pub g: f64,
    pub b: f64,
    pub a: f64,
}

impl Color {
    /// Create color from RGBA components (0.0-1.0)
    pub fn rgba(r: f64, g: f64, b: f64, a: f64) -> Self {
        Self {
            r: r.clamp(0.0, 1.0),
            g: g.clamp(0.0, 1.0),
            b: b.clamp(0.0, 1.0),
            a: a.clamp(0.0, 1.0),
        }
    }

    /// Create color from RGB components (0.0-1.0)
    pub fn rgb(r: f64, g: f64, b: f64) -> Self {
        Self::rgba(r, g, b, 1.0)
    }

    /// Create color from HSL (hue: 0-360, sat: 0-1, light: 0-1)
    pub fn hsl(h: f64, s: f64, l: f64) -> Self {
        Self::hsla(h, s, l, 1.0)
    }

    /// Create color from HSLA
    pub fn hsla(h: f64, s: f64, l: f64, a: f64) -> Self {
        let h = h % 360.0;
        let s = s.clamp(0.0, 1.0);
        let l = l.clamp(0.0, 1.0);

        let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
        let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
        let m = l - c / 2.0;

        let (r1, g1, b1) = if h < 60.0 {
            (c, x, 0.0)
        } else if h < 120.0 {
            (x, c, 0.0)
        } else if h < 180.0 {
            (0.0, c, x)
        } else if h < 240.0 {
            (0.0, x, c)
        } else if h < 300.0 {
            (x, 0.0, c)
        } else {
            (c, 0.0, x)
        };

        Self::rgba(r1 + m, g1 + m, b1 + m, a)
    }

    /// Parse hex color (#RGB, #RGBA, #RRGGBB, #RRGGBBAA)
    pub fn from_hex(hex: &str) -> Option<Self> {
        let hex = hex.trim_start_matches('#');

        match hex.len() {
            3 => {
                let r = u8::from_str_radix(&hex[0..1].repeat(2), 16).ok()?;
                let g = u8::from_str_radix(&hex[1..2].repeat(2), 16).ok()?;
                let b = u8::from_str_radix(&hex[2..3].repeat(2), 16).ok()?;
                Some(Self::rgb(r as f64 / 255.0, g as f64 / 255.0, b as f64 / 255.0))
            }
            4 => {
                let r = u8::from_str_radix(&hex[0..1].repeat(2), 16).ok()?;
                let g = u8::from_str_radix(&hex[1..2].repeat(2), 16).ok()?;
                let b = u8::from_str_radix(&hex[2..3].repeat(2), 16).ok()?;
                let a = u8::from_str_radix(&hex[3..4].repeat(2), 16).ok()?;
                Some(Self::rgba(
                    r as f64 / 255.0,
                    g as f64 / 255.0,
                    b as f64 / 255.0,
                    a as f64 / 255.0,
                ))
            }
            6 => {
                let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
                let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
                let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
                Some(Self::rgb(r as f64 / 255.0, g as f64 / 255.0, b as f64 / 255.0))
            }
            8 => {
                let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
                let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
                let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
                let a = u8::from_str_radix(&hex[6..8], 16).ok()?;
                Some(Self::rgba(
                    r as f64 / 255.0,
                    g as f64 / 255.0,
                    b as f64 / 255.0,
                    a as f64 / 255.0,
                ))
            }
            _ => None,
        }
    }

    /// Convert to CSS string
    pub fn to_css(&self) -> String {
        if self.a < 1.0 {
            format!(
                "rgba({}, {}, {}, {})",
                (self.r * 255.0) as u8,
                (self.g * 255.0) as u8,
                (self.b * 255.0) as u8,
                self.a
            )
        } else {
            format!(
                "rgb({}, {}, {})",
                (self.r * 255.0) as u8,
                (self.g * 255.0) as u8,
                (self.b * 255.0) as u8
            )
        }
    }

    /// Lighten color by amount (0.0-1.0)
    pub fn lighten(&self, amount: f64) -> Self {
        let (h, s, l) = self.to_hsl();
        Self::hsla(h, s, (l + amount).clamp(0.0, 1.0), self.a)
    }

    /// Darken color by amount (0.0-1.0)
    pub fn darken(&self, amount: f64) -> Self {
        let (h, s, l) = self.to_hsl();
        Self::hsla(h, s, (l - amount).clamp(0.0, 1.0), self.a)
    }

    /// Saturate color by amount (0.0-1.0)
    pub fn saturate(&self, amount: f64) -> Self {
        let (h, s, l) = self.to_hsl();
        Self::hsla(h, (s + amount).clamp(0.0, 1.0), l, self.a)
    }

    /// Desaturate color by amount (0.0-1.0)
    pub fn desaturate(&self, amount: f64) -> Self {
        let (h, s, l) = self.to_hsl();
        Self::hsla(h, (s - amount).clamp(0.0, 1.0), l, self.a)
    }

    /// Convert to HSL
    pub fn to_hsl(&self) -> (f64, f64, f64) {
        let max = self.r.max(self.g).max(self.b);
        let min = self.r.min(self.g).min(self.b);
        let delta = max - min;

        let l = (max + min) / 2.0;

        if delta == 0.0 {
            return (0.0, 0.0, l);
        }

        let s = if l < 0.5 {
            delta / (max + min)
        } else {
            delta / (2.0 - max - min)
        };

        let h = if max == self.r {
            60.0 * (((self.g - self.b) / delta) % 6.0)
        } else if max == self.g {
            60.0 * (((self.b - self.r) / delta) + 2.0)
        } else {
            60.0 * (((self.r - self.g) / delta) + 4.0)
        };

        let h = if h < 0.0 { h + 360.0 } else { h };

        (h, s, l)
    }

    /// Common colors
    pub const BLACK: Color = Color { r: 0.0, g: 0.0, b: 0.0, a: 1.0 };
    pub const WHITE: Color = Color { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    pub const RED: Color = Color { r: 1.0, g: 0.0, b: 0.0, a: 1.0 };
    pub const GREEN: Color = Color { r: 0.0, g: 1.0, b: 0.0, a: 1.0 };
    pub const BLUE: Color = Color { r: 0.0, g: 0.0, b: 1.0, a: 1.0 };
    pub const TRANSPARENT: Color = Color { r: 0.0, g: 0.0, b: 0.0, a: 0.0 };
}

/// CSS unit types
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Unit {
    /// Pixels
    Px(f64),
    /// Em (relative to font size)
    Em(f64),
    /// Rem (relative to root font size)
    Rem(f64),
    /// Percentage
    Percent(f64),
    /// Viewport width
    Vw(f64),
    /// Viewport height
    Vh(f64),
    /// Auto
    Auto,
}

impl Unit {
    /// Convert to CSS string
    pub fn to_css(&self) -> String {
        use alloc::string::ToString;
        match self {
            Unit::Px(v) => format!("{}px", v),
            Unit::Em(v) => format!("{}em", v),
            Unit::Rem(v) => format!("{}rem", v),
            Unit::Percent(v) => format!("{}%", v),
            Unit::Vw(v) => format!("{}vw", v),
            Unit::Vh(v) => format!("{}vh", v),
            Unit::Auto => "auto".to_string(),
        }
    }

    /// Convert to pixels (requires context for relative units)
    pub fn to_px(&self, font_size: f64, viewport_width: f64, viewport_height: f64) -> Option<f64> {
        match self {
            Unit::Px(v) => Some(*v),
            Unit::Em(v) => Some(v * font_size),
            Unit::Rem(v) => Some(v * 16.0), // Assume 16px root font size
            Unit::Percent(v) => None, // Needs parent context
            Unit::Vw(v) => Some(v * viewport_width / 100.0),
            Unit::Vh(v) => Some(v * viewport_height / 100.0),
            Unit::Auto => None,
        }
    }
}

/// Border style
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BorderStyle {
    None,
    Solid,
    Dashed,
    Dotted,
    Double,
}

impl BorderStyle {
    pub fn to_css(&self) -> &str {
        match self {
            BorderStyle::None => "none",
            BorderStyle::Solid => "solid",
            BorderStyle::Dashed => "dashed",
            BorderStyle::Dotted => "dotted",
            BorderStyle::Double => "double",
        }
    }
}

/// Style properties
#[derive(Debug, Clone)]
pub struct Style {
    // Colors
    pub background_color: Option<Color>,
    pub color: Option<Color>,

    // Dimensions
    pub width: Option<Unit>,
    pub height: Option<Unit>,
    pub min_width: Option<Unit>,
    pub min_height: Option<Unit>,
    pub max_width: Option<Unit>,
    pub max_height: Option<Unit>,

    // Spacing
    pub padding_top: Option<Unit>,
    pub padding_right: Option<Unit>,
    pub padding_bottom: Option<Unit>,
    pub padding_left: Option<Unit>,
    pub margin_top: Option<Unit>,
    pub margin_right: Option<Unit>,
    pub margin_bottom: Option<Unit>,
    pub margin_left: Option<Unit>,

    // Border
    pub border_width: Option<Unit>,
    pub border_color: Option<Color>,
    pub border_style: Option<BorderStyle>,
    pub border_radius: Option<Unit>,

    // Typography
    pub font_size: Option<Unit>,
    pub line_height: Option<f64>,
    pub font_weight: Option<u16>,

    // Transform
    pub opacity: Option<f64>,
}

impl Style {
    pub fn new() -> Self {
        Self {
            background_color: None,
            color: None,
            width: None,
            height: None,
            min_width: None,
            min_height: None,
            max_width: None,
            max_height: None,
            padding_top: None,
            padding_right: None,
            padding_bottom: None,
            padding_left: None,
            margin_top: None,
            margin_right: None,
            margin_bottom: None,
            margin_left: None,
            border_width: None,
            border_color: None,
            border_style: None,
            border_radius: None,
            font_size: None,
            line_height: None,
            font_weight: None,
            opacity: None,
        }
    }

    /// Set padding for all sides
    pub fn padding(&mut self, value: Unit) {
        self.padding_top = Some(value);
        self.padding_right = Some(value);
        self.padding_bottom = Some(value);
        self.padding_left = Some(value);
    }

    /// Set margin for all sides
    pub fn margin(&mut self, value: Unit) {
        self.margin_top = Some(value);
        self.margin_right = Some(value);
        self.margin_bottom = Some(value);
        self.margin_left = Some(value);
    }

    /// Merge another style into this one (other takes priority)
    pub fn merge(&mut self, other: &Style) {
        if other.background_color.is_some() {
            self.background_color = other.background_color;
        }
        if other.color.is_some() {
            self.color = other.color;
        }
        if other.width.is_some() {
            self.width = other.width;
        }
        if other.height.is_some() {
            self.height = other.height;
        }
        // ... merge other properties similarly
    }

    /// Convert to CSS string (simplified)
    pub fn to_css(&self) -> String {
        let mut css = String::new();

        if let Some(color) = &self.background_color {
            css.push_str(&format!("background-color: {}; ", color.to_css()));
        }
        if let Some(color) = &self.color {
            css.push_str(&format!("color: {}; ", color.to_css()));
        }
        if let Some(width) = &self.width {
            css.push_str(&format!("width: {}; ", width.to_css()));
        }
        if let Some(height) = &self.height {
            css.push_str(&format!("height: {}; ", height.to_css()));
        }
        if let Some(opacity) = self.opacity {
            css.push_str(&format!("opacity: {}; ", opacity));
        }

        css
    }
}

impl Default for Style {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_color_rgb() {
        let color = Color::rgb(1.0, 0.5, 0.0);
        assert_eq!(color.r, 1.0);
        assert_eq!(color.g, 0.5);
        assert_eq!(color.b, 0.0);
        assert_eq!(color.a, 1.0);
    }

    #[test]
    fn test_color_hex() {
        let color = Color::from_hex("#FF8000").unwrap();
        assert!((color.r - 1.0).abs() < 0.01);
        assert!((color.g - 0.5).abs() < 0.01);
        assert!((color.b - 0.0).abs() < 0.01);
    }

    #[test]
    fn test_color_hex_short() {
        let color = Color::from_hex("#F80").unwrap();
        assert!((color.r - 1.0).abs() < 0.01);
        assert!((color.g - 0.53).abs() < 0.02); // #F80 = #FF8800
        assert!((color.b - 0.0).abs() < 0.01);
    }

    #[test]
    fn test_color_hsl() {
        let color = Color::hsl(0.0, 1.0, 0.5); // Pure red
        assert!((color.r - 1.0).abs() < 0.01);
        assert!(color.g.abs() < 0.01);
        assert!(color.b.abs() < 0.01);
    }

    #[test]
    fn test_color_lighten() {
        let color = Color::rgb(0.5, 0.5, 0.5);
        let lighter = color.lighten(0.2);
        let (_, _, l1) = color.to_hsl();
        let (_, _, l2) = lighter.to_hsl();
        assert!(l2 > l1);
    }

    #[test]
    fn test_color_darken() {
        let color = Color::rgb(0.5, 0.5, 0.5);
        let darker = color.darken(0.2);
        let (_, _, l1) = color.to_hsl();
        let (_, _, l2) = darker.to_hsl();
        assert!(l2 < l1);
    }

    #[test]
    fn test_color_saturate() {
        let color = Color::hsl(180.0, 0.5, 0.5);
        let saturated = color.saturate(0.3);
        let (_, s1, _) = color.to_hsl();
        let (_, s2, _) = saturated.to_hsl();
        assert!(s2 > s1);
    }

    #[test]
    fn test_color_to_css() {
        let color = Color::rgb(1.0, 0.5, 0.0);
        let css = color.to_css();
        assert!(css.contains("255"));
        assert!(css.contains("127") || css.contains("128")); // 0.5 * 255 ≈ 127.5
        assert!(css.contains("0"));
    }

    #[test]
    fn test_color_constants() {
        assert_eq!(Color::BLACK.r, 0.0);
        assert_eq!(Color::WHITE.r, 1.0);
        assert_eq!(Color::RED.r, 1.0);
        assert_eq!(Color::RED.g, 0.0);
    }

    #[test]
    fn test_unit_px() {
        let unit = Unit::Px(16.0);
        assert_eq!(unit.to_css(), "16px");
        assert_eq!(unit.to_px(14.0, 1024.0, 768.0), Some(16.0));
    }

    #[test]
    fn test_unit_em() {
        let unit = Unit::Em(2.0);
        assert_eq!(unit.to_css(), "2em");
        assert_eq!(unit.to_px(14.0, 1024.0, 768.0), Some(28.0)); // 2 * 14
    }

    #[test]
    fn test_unit_percent() {
        let unit = Unit::Percent(50.0);
        assert_eq!(unit.to_css(), "50%");
        assert_eq!(unit.to_px(14.0, 1024.0, 768.0), None); // Needs parent context
    }

    #[test]
    fn test_unit_vw() {
        let unit = Unit::Vw(50.0);
        assert_eq!(unit.to_css(), "50vw");
        assert_eq!(unit.to_px(14.0, 1024.0, 768.0), Some(512.0)); // 50% of 1024
    }

    #[test]
    fn test_unit_vh() {
        let unit = Unit::Vh(50.0);
        assert_eq!(unit.to_css(), "50vh");
        assert_eq!(unit.to_px(14.0, 1024.0, 768.0), Some(384.0)); // 50% of 768
    }

    #[test]
    fn test_border_style() {
        assert_eq!(BorderStyle::Solid.to_css(), "solid");
        assert_eq!(BorderStyle::Dashed.to_css(), "dashed");
        assert_eq!(BorderStyle::None.to_css(), "none");
    }

    #[test]
    fn test_style_new() {
        let style = Style::new();
        assert!(style.background_color.is_none());
        assert!(style.width.is_none());
    }

    #[test]
    fn test_style_padding() {
        let mut style = Style::new();
        style.padding(Unit::Px(10.0));

        assert_eq!(style.padding_top, Some(Unit::Px(10.0)));
        assert_eq!(style.padding_right, Some(Unit::Px(10.0)));
        assert_eq!(style.padding_bottom, Some(Unit::Px(10.0)));
        assert_eq!(style.padding_left, Some(Unit::Px(10.0)));
    }

    #[test]
    fn test_style_margin() {
        let mut style = Style::new();
        style.margin(Unit::Px(20.0));

        assert_eq!(style.margin_top, Some(Unit::Px(20.0)));
        assert_eq!(style.margin_right, Some(Unit::Px(20.0)));
    }

    #[test]
    fn test_style_to_css() {
        let mut style = Style::new();
        style.background_color = Some(Color::RED);
        style.width = Some(Unit::Px(100.0));
        style.opacity = Some(0.5);

        let css = style.to_css();
        assert!(css.contains("background-color"));
        assert!(css.contains("width"));
        assert!(css.contains("opacity"));
    }

    #[test]
    fn test_style_merge() {
        let mut style1 = Style::new();
        style1.width = Some(Unit::Px(100.0));
        style1.background_color = Some(Color::RED);

        let mut style2 = Style::new();
        style2.width = Some(Unit::Px(200.0)); // Override
        style2.height = Some(Unit::Px(150.0)); // New

        style1.merge(&style2);

        assert_eq!(style1.width, Some(Unit::Px(200.0)));
        assert_eq!(style1.height, Some(Unit::Px(150.0)));
        assert_eq!(style1.background_color, Some(Color::RED)); // Preserved
    }
}

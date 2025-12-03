//! Layout system with mathematical precision
//!
//! This module provides a flexible box layout system inspired by CSS Flexbox
//! but implemented with pure mathematical calculations using avila-linalg.
//!
//! # Features
//! - Flexbox-like layout algorithm
//! - Constraint-based sizing
//! - Alignment and justification
//! - Gap and padding calculations
//! - Nested layout support

use crate::{Vec, Box};
use core::cmp::Ordering;

/// Rectangle with position and size
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    pub fn new(x: f64, y: f64, width: f64, height: f64) -> Self {
        Self { x, y, width, height }
    }

    /// Create a rectangle from origin with given size
    pub fn from_size(width: f64, height: f64) -> Self {
        Self { x: 0.0, y: 0.0, width, height }
    }

    /// Get the center point of the rectangle
    pub fn center(&self) -> (f64, f64) {
        (self.x + self.width / 2.0, self.y + self.height / 2.0)
    }

    /// Check if a point is inside the rectangle
    pub fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.x + self.width &&
        y >= self.y && y <= self.y + self.height
    }

    /// Calculate the area
    pub fn area(&self) -> f64 {
        self.width * self.height
    }

    /// Check if this rectangle intersects with another
    pub fn intersects(&self, other: &Rect) -> bool {
        self.x < other.x + other.width &&
        self.x + self.width > other.x &&
        self.y < other.y + other.height &&
        self.y + self.height > other.y
    }

    /// Calculate intersection rectangle with another
    pub fn intersection(&self, other: &Rect) -> Option<Rect> {
        let x1 = self.x.max(other.x);
        let y1 = self.y.max(other.y);
        let x2 = (self.x + self.width).min(other.x + other.width);
        let y2 = (self.y + self.height).min(other.y + other.height);

        if x2 > x1 && y2 > y1 {
            Some(Rect::new(x1, y1, x2 - x1, y2 - y1))
        } else {
            None
        }
    }
}

/// Size constraints for layout calculations
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Constraints {
    pub min_width: f64,
    pub max_width: f64,
    pub min_height: f64,
    pub max_height: f64,
}

impl Constraints {
    /// Create constraints with minimum and maximum bounds
    pub fn new(min_width: f64, max_width: f64, min_height: f64, max_height: f64) -> Self {
        Self {
            min_width: min_width.max(0.0),
            max_width: max_width.max(min_width),
            min_height: min_height.max(0.0),
            max_height: max_height.max(min_height),
        }
    }

    /// Create tight constraints (min = max)
    pub fn tight(width: f64, height: f64) -> Self {
        Self {
            min_width: width,
            max_width: width,
            min_height: height,
            max_height: height,
        }
    }

    /// Create loose constraints (min = 0)
    pub fn loose(max_width: f64, max_height: f64) -> Self {
        Self {
            min_width: 0.0,
            max_width,
            min_height: 0.0,
            max_height,
        }
    }

    /// Create unbounded constraints
    pub fn unbounded() -> Self {
        Self {
            min_width: 0.0,
            max_width: f64::INFINITY,
            min_height: 0.0,
            max_height: f64::INFINITY,
        }
    }

    /// Constrain a size to fit within these constraints
    pub fn constrain(&self, width: f64, height: f64) -> (f64, f64) {
        (
            width.max(self.min_width).min(self.max_width),
            height.max(self.min_height).min(self.max_height),
        )
    }

    /// Check if these constraints are bounded
    pub fn is_bounded(&self) -> bool {
        self.max_width.is_finite() && self.max_height.is_finite()
    }

    /// Check if these constraints are tight
    pub fn is_tight(&self) -> bool {
        (self.max_width - self.min_width).abs() < 1e-10 &&
        (self.max_height - self.min_height).abs() < 1e-10
    }

    /// Shrink constraints by padding
    pub fn deflate(&self, padding: EdgeInsets) -> Self {
        let horizontal = padding.left + padding.right;
        let vertical = padding.top + padding.bottom;

        Self {
            min_width: (self.min_width - horizontal).max(0.0),
            max_width: (self.max_width - horizontal).max(0.0),
            min_height: (self.min_height - vertical).max(0.0),
            max_height: (self.max_height - vertical).max(0.0),
        }
    }
}

/// Edge insets for padding/margin
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EdgeInsets {
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub left: f64,
}

impl EdgeInsets {
    /// Create edge insets with individual values
    pub fn new(top: f64, right: f64, bottom: f64, left: f64) -> Self {
        Self { top, right, bottom, left }
    }

    /// Create uniform edge insets
    pub fn all(value: f64) -> Self {
        Self {
            top: value,
            right: value,
            bottom: value,
            left: value,
        }
    }

    /// Create symmetric edge insets
    pub fn symmetric(vertical: f64, horizontal: f64) -> Self {
        Self {
            top: vertical,
            right: horizontal,
            bottom: vertical,
            left: horizontal,
        }
    }

    /// Create zero edge insets
    pub fn zero() -> Self {
        Self::all(0.0)
    }

    /// Get horizontal total (left + right)
    pub fn horizontal(&self) -> f64 {
        self.left + self.right
    }

    /// Get vertical total (top + bottom)
    pub fn vertical(&self) -> f64 {
        self.top + self.bottom
    }
}

/// Flex direction for layout
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlexDirection {
    /// Horizontal layout (left to right)
    Row,
    /// Vertical layout (top to bottom)
    Column,
}

/// Main axis alignment
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MainAxisAlignment {
    /// Pack items at the start
    Start,
    /// Pack items at the end
    End,
    /// Center items
    Center,
    /// Distribute space between items
    SpaceBetween,
    /// Distribute space around items
    SpaceAround,
    /// Distribute space evenly
    SpaceEvenly,
}

/// Cross axis alignment
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CrossAxisAlignment {
    /// Align items at the start
    Start,
    /// Align items at the end
    End,
    /// Center items
    Center,
    /// Stretch items to fill
    Stretch,
}

/// Flex item properties
#[derive(Debug, Clone)]
pub struct FlexItem {
    /// Flex grow factor (how much item should grow)
    pub flex_grow: f64,
    /// Flex shrink factor (how much item should shrink)
    pub flex_shrink: f64,
    /// Base size before flex calculations
    pub flex_basis: Option<f64>,
    /// Minimum size
    pub min_size: Option<f64>,
    /// Maximum size
    pub max_size: Option<f64>,
    /// Item content size
    pub content_size: (f64, f64),
}

impl FlexItem {
    /// Create a new flex item with default properties
    pub fn new(content_size: (f64, f64)) -> Self {
        Self {
            flex_grow: 0.0,
            flex_shrink: 1.0,
            flex_basis: None,
            min_size: None,
            max_size: None,
            content_size,
        }
    }

    /// Create a flexible item that grows
    pub fn flexible(flex: f64, content_size: (f64, f64)) -> Self {
        Self {
            flex_grow: flex,
            flex_shrink: 1.0,
            flex_basis: None,
            min_size: None,
            max_size: None,
            content_size,
        }
    }

    /// Create a rigid item (doesn't grow or shrink)
    pub fn rigid(content_size: (f64, f64)) -> Self {
        Self {
            flex_grow: 0.0,
            flex_shrink: 0.0,
            flex_basis: None,
            min_size: None,
            max_size: None,
            content_size,
        }
    }
}

/// Flex container that calculates layout
pub struct FlexContainer {
    pub direction: FlexDirection,
    pub main_axis_alignment: MainAxisAlignment,
    pub cross_axis_alignment: CrossAxisAlignment,
    pub gap: f64,
    pub padding: EdgeInsets,
    items: Vec<FlexItem>,
}

impl FlexContainer {
    /// Create a new flex container
    pub fn new(direction: FlexDirection) -> Self {
        Self {
            direction,
            main_axis_alignment: MainAxisAlignment::Start,
            cross_axis_alignment: CrossAxisAlignment::Start,
            gap: 0.0,
            padding: EdgeInsets::zero(),
            items: Vec::new(),
        }
    }

    /// Add an item to the container
    pub fn add_item(&mut self, item: FlexItem) {
        self.items.push(item);
    }

    /// Calculate layout for all items within given constraints
    pub fn layout(&self, constraints: Constraints) -> Vec<Rect> {
        if self.items.is_empty() {
            return Vec::new();
        }

        let is_row = self.direction == FlexDirection::Row;

        // Available space after padding
        let inner_constraints = constraints.deflate(self.padding);
        let available_main = if is_row {
            inner_constraints.max_width
        } else {
            inner_constraints.max_height
        };
        let available_cross = if is_row {
            inner_constraints.max_height
        } else {
            inner_constraints.max_width
        };

        // Calculate total gap space
        let total_gap = self.gap * (self.items.len() - 1) as f64;
        let available_for_items = available_main - total_gap;

        // Calculate flex basis for each item
        let mut item_sizes = Vec::new();
        let mut total_basis = 0.0;
        let mut total_grow = 0.0;
        let mut total_shrink = 0.0;

        for item in &self.items {
            let basis = item.flex_basis.unwrap_or_else(|| {
                if is_row {
                    item.content_size.0
                } else {
                    item.content_size.1
                }
            });

            item_sizes.push(basis);
            total_basis += basis;
            total_grow += item.flex_grow;
            total_shrink += item.flex_shrink;
        }

        // Distribute remaining space
        let remaining = available_for_items - total_basis;

        if remaining > 0.0 && total_grow > 0.0 {
            // Grow items
            for (i, item) in self.items.iter().enumerate() {
                if item.flex_grow > 0.0 {
                    let grow_amount = remaining * (item.flex_grow / total_grow);
                    item_sizes[i] += grow_amount;

                    // Apply max constraint
                    if let Some(max) = item.max_size {
                        item_sizes[i] = item_sizes[i].min(max);
                    }
                }
            }
        } else if remaining < 0.0 && total_shrink > 0.0 {
            // Shrink items
            for (i, item) in self.items.iter().enumerate() {
                if item.flex_shrink > 0.0 {
                    let shrink_amount = -remaining * (item.flex_shrink / total_shrink);
                    item_sizes[i] -= shrink_amount;

                    // Apply min constraint
                    if let Some(min) = item.min_size {
                        item_sizes[i] = item_sizes[i].max(min);
                    }
                }
            }
        }

        // Calculate positions based on main axis alignment
        let total_used = item_sizes.iter().sum::<f64>() + total_gap;
        let mut main_pos = match self.main_axis_alignment {
            MainAxisAlignment::Start => 0.0,
            MainAxisAlignment::End => available_for_items - total_used,
            MainAxisAlignment::Center => (available_for_items - total_used) / 2.0,
            MainAxisAlignment::SpaceBetween => 0.0,
            MainAxisAlignment::SpaceAround => 0.0,
            MainAxisAlignment::SpaceEvenly => 0.0,
        };

        let spacing = match self.main_axis_alignment {
            MainAxisAlignment::SpaceBetween if self.items.len() > 1 => {
                (available_for_items - total_basis) / (self.items.len() - 1) as f64
            }
            MainAxisAlignment::SpaceAround => {
                let space = (available_for_items - total_basis) / self.items.len() as f64;
                main_pos += space / 2.0;
                space
            }
            MainAxisAlignment::SpaceEvenly => {
                let space = (available_for_items - total_basis) / (self.items.len() + 1) as f64;
                main_pos += space;
                space
            }
            _ => self.gap,
        };

        // Build rectangles
        let mut rects = Vec::new();
        for (i, item) in self.items.iter().enumerate() {
            let main_size = item_sizes[i];
            let cross_size = if is_row {
                item.content_size.1
            } else {
                item.content_size.0
            };

            let cross_pos = match self.cross_axis_alignment {
                CrossAxisAlignment::Start => 0.0,
                CrossAxisAlignment::End => available_cross - cross_size,
                CrossAxisAlignment::Center => (available_cross - cross_size) / 2.0,
                CrossAxisAlignment::Stretch => 0.0,
            };

            let final_cross_size = if self.cross_axis_alignment == CrossAxisAlignment::Stretch {
                available_cross
            } else {
                cross_size
            };

            let rect = if is_row {
                Rect::new(
                    main_pos + self.padding.left,
                    cross_pos + self.padding.top,
                    main_size,
                    final_cross_size,
                )
            } else {
                Rect::new(
                    cross_pos + self.padding.left,
                    main_pos + self.padding.top,
                    final_cross_size,
                    main_size,
                )
            };

            rects.push(rect);
            main_pos += main_size + spacing;
        }

        rects
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rect_center() {
        let rect = Rect::new(10.0, 20.0, 100.0, 50.0);
        let (cx, cy) = rect.center();
        assert!((cx - 60.0).abs() < 1e-10);
        assert!((cy - 45.0).abs() < 1e-10);
    }

    #[test]
    fn test_rect_contains() {
        let rect = Rect::new(0.0, 0.0, 100.0, 100.0);
        assert!(rect.contains(50.0, 50.0));
        assert!(rect.contains(0.0, 0.0));
        assert!(rect.contains(100.0, 100.0));
        assert!(!rect.contains(-1.0, 50.0));
        assert!(!rect.contains(50.0, 101.0));
    }

    #[test]
    fn test_rect_area() {
        let rect = Rect::new(0.0, 0.0, 10.0, 20.0);
        assert!((rect.area() - 200.0).abs() < 1e-10);
    }

    #[test]
    fn test_rect_intersects() {
        let rect1 = Rect::new(0.0, 0.0, 100.0, 100.0);
        let rect2 = Rect::new(50.0, 50.0, 100.0, 100.0);
        let rect3 = Rect::new(200.0, 200.0, 50.0, 50.0);

        assert!(rect1.intersects(&rect2));
        assert!(!rect1.intersects(&rect3));
    }

    #[test]
    fn test_rect_intersection() {
        let rect1 = Rect::new(0.0, 0.0, 100.0, 100.0);
        let rect2 = Rect::new(50.0, 50.0, 100.0, 100.0);

        let intersection = rect1.intersection(&rect2).unwrap();
        assert!((intersection.x - 50.0).abs() < 1e-10);
        assert!((intersection.y - 50.0).abs() < 1e-10);
        assert!((intersection.width - 50.0).abs() < 1e-10);
        assert!((intersection.height - 50.0).abs() < 1e-10);
    }

    #[test]
    fn test_constraints_constrain() {
        let constraints = Constraints::new(50.0, 200.0, 50.0, 200.0);

        let (w, h) = constraints.constrain(100.0, 100.0);
        assert!((w - 100.0).abs() < 1e-10);
        assert!((h - 100.0).abs() < 1e-10);

        let (w, h) = constraints.constrain(10.0, 10.0);
        assert!((w - 50.0).abs() < 1e-10);
        assert!((h - 50.0).abs() < 1e-10);

        let (w, h) = constraints.constrain(300.0, 300.0);
        assert!((w - 200.0).abs() < 1e-10);
        assert!((h - 200.0).abs() < 1e-10);
    }

    #[test]
    fn test_constraints_tight() {
        let constraints = Constraints::tight(100.0, 50.0);
        assert!(constraints.is_tight());

        let (w, h) = constraints.constrain(200.0, 200.0);
        assert!((w - 100.0).abs() < 1e-10);
        assert!((h - 50.0).abs() < 1e-10);
    }

    #[test]
    fn test_edge_insets_totals() {
        let insets = EdgeInsets::new(10.0, 20.0, 30.0, 40.0);
        assert!((insets.horizontal() - 60.0).abs() < 1e-10);
        assert!((insets.vertical() - 40.0).abs() < 1e-10);
    }

    #[test]
    fn test_flex_container_simple_row() {
        let mut container = FlexContainer::new(FlexDirection::Row);
        container.add_item(FlexItem::new((50.0, 50.0)));
        container.add_item(FlexItem::new((50.0, 50.0)));
        container.add_item(FlexItem::new((50.0, 50.0)));

        let constraints = Constraints::tight(200.0, 100.0);
        let rects = container.layout(constraints);

        assert_eq!(rects.len(), 3);
        assert!((rects[0].x - 0.0).abs() < 1e-10);
        assert!((rects[1].x - 50.0).abs() < 1e-10);
        assert!((rects[2].x - 100.0).abs() < 1e-10);
    }

    #[test]
    fn test_flex_container_with_gap() {
        let mut container = FlexContainer::new(FlexDirection::Row);
        container.gap = 10.0;
        container.add_item(FlexItem::new((50.0, 50.0)));
        container.add_item(FlexItem::new((50.0, 50.0)));

        let constraints = Constraints::tight(200.0, 100.0);
        let rects = container.layout(constraints);

        assert_eq!(rects.len(), 2);
        assert!((rects[0].x - 0.0).abs() < 1e-10);
        assert!((rects[1].x - 60.0).abs() < 1e-10); // 50 + 10 gap
    }

    #[test]
    fn test_flex_container_grow() {
        let mut container = FlexContainer::new(FlexDirection::Row);
        container.add_item(FlexItem::flexible(1.0, (0.0, 50.0)));
        container.add_item(FlexItem::flexible(2.0, (0.0, 50.0)));

        let constraints = Constraints::tight(300.0, 100.0);
        let rects = container.layout(constraints);

        assert_eq!(rects.len(), 2);
        // First item gets 1/3 of space
        assert!((rects[0].width - 100.0).abs() < 1e-9);
        // Second item gets 2/3 of space
        assert!((rects[1].width - 200.0).abs() < 1e-9);
    }

    #[test]
    fn test_flex_container_center_alignment() {
        let mut container = FlexContainer::new(FlexDirection::Row);
        container.main_axis_alignment = MainAxisAlignment::Center;
        container.add_item(FlexItem::new((50.0, 50.0)));
        container.add_item(FlexItem::new((50.0, 50.0)));

        let constraints = Constraints::tight(200.0, 100.0);
        let rects = container.layout(constraints);

        assert_eq!(rects.len(), 2);
        // Items should be centered: (200 - 100) / 2 = 50
        assert!((rects[0].x - 50.0).abs() < 1e-10);
        assert!((rects[1].x - 100.0).abs() < 1e-10);
    }

    #[test]
    fn test_flex_container_column() {
        let mut container = FlexContainer::new(FlexDirection::Column);
        container.add_item(FlexItem::new((50.0, 30.0)));
        container.add_item(FlexItem::new((50.0, 40.0)));

        let constraints = Constraints::tight(100.0, 200.0);
        let rects = container.layout(constraints);

        assert_eq!(rects.len(), 2);
        assert!((rects[0].y - 0.0).abs() < 1e-10);
        assert!((rects[0].height - 30.0).abs() < 1e-10);
        assert!((rects[1].y - 30.0).abs() < 1e-10);
        assert!((rects[1].height - 40.0).abs() < 1e-10);
    }
}

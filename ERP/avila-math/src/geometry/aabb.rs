/// Axis-Aligned Bounding Box for collision detection and spatial queries
use super::vector::Vector3;

/// Axis-Aligned Bounding Box (AABB)
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AABB {
    pub min: Vector3,
    pub max: Vector3,
}

impl AABB {
    /// Create AABB from min and max points
    #[inline]
    pub fn new(min: Vector3, max: Vector3) -> Self {
        Self { min, max }
    }

    /// Create AABB from center and size
    pub fn from_center_size(center: Vector3, size: Vector3) -> Self {
        let half_size = size * 0.5;
        Self {
            min: center - half_size,
            max: center + half_size,
        }
    }

    /// Create AABB from collection of points
    pub fn from_points(points: &[Vector3]) -> Option<Self> {
        if points.is_empty() {
            return None;
        }

        let mut min = points[0];
        let mut max = points[0];

        for &point in &points[1..] {
            min = min.min(point);
            max = max.max(point);
        }

        Some(Self { min, max })
    }

    /// Get center of AABB
    #[inline]
    pub fn center(&self) -> Vector3 {
        (self.min + self.max) * 0.5
    }

    /// Get size (extents) of AABB
    #[inline]
    pub fn size(&self) -> Vector3 {
        self.max - self.min
    }

    /// Get half-extents
    #[inline]
    pub fn half_size(&self) -> Vector3 {
        self.size() * 0.5
    }

    /// Volume of AABB
    #[inline]
    pub fn volume(&self) -> f64 {
        let size = self.size();
        size.x * size.y * size.z
    }

    /// Surface area of AABB
    #[inline]
    pub fn surface_area(&self) -> f64 {
        let size = self.size();
        2.0 * (size.x * size.y + size.y * size.z + size.z * size.x)
    }

    /// Check if AABB contains a point
    #[inline]
    pub fn contains_point(&self, point: Vector3) -> bool {
        point.x >= self.min.x
            && point.x <= self.max.x
            && point.y >= self.min.y
            && point.y <= self.max.y
            && point.z >= self.min.z
            && point.z <= self.max.z
    }

    /// Check if two AABBs intersect
    #[inline]
    pub fn intersects(&self, other: &AABB) -> bool {
        self.min.x <= other.max.x
            && self.max.x >= other.min.x
            && self.min.y <= other.max.y
            && self.max.y >= other.min.y
            && self.min.z <= other.max.z
            && self.max.z >= other.min.z
    }

    /// Check if this AABB completely contains another
    #[inline]
    pub fn contains(&self, other: &AABB) -> bool {
        self.min.x <= other.min.x
            && self.max.x >= other.max.x
            && self.min.y <= other.min.y
            && self.max.y >= other.max.y
            && self.min.z <= other.min.z
            && self.max.z >= other.max.z
    }

    /// Get intersection of two AABBs (returns None if they don't intersect)
    pub fn intersection(&self, other: &AABB) -> Option<AABB> {
        if !self.intersects(other) {
            return None;
        }

        Some(AABB {
            min: self.min.max(other.min),
            max: self.max.min(other.max),
        })
    }

    /// Merge two AABBs (union)
    #[inline]
    pub fn merge(&self, other: &AABB) -> AABB {
        AABB {
            min: self.min.min(other.min),
            max: self.max.max(other.max),
        }
    }

    /// Expand AABB by a margin
    #[inline]
    pub fn expand(&self, margin: f64) -> AABB {
        let expansion = Vector3::new(margin, margin, margin);
        AABB {
            min: self.min - expansion,
            max: self.max + expansion,
        }
    }

    /// Expand AABB to include a point
    #[inline]
    pub fn expand_to_include(&mut self, point: Vector3) {
        self.min = self.min.min(point);
        self.max = self.max.max(point);
    }

    /// Get closest point on AABB to a given point
    pub fn closest_point(&self, point: Vector3) -> Vector3 {
        Vector3::new(
            point.x.max(self.min.x).min(self.max.x),
            point.y.max(self.min.y).min(self.max.y),
            point.z.max(self.min.z).min(self.max.z),
        )
    }

    /// Distance from AABB to a point (0 if point is inside)
    pub fn distance_to_point(&self, point: Vector3) -> f64 {
        let closest = self.closest_point(point);
        point.distance(closest)
    }

    /// Get all 8 corners of the AABB
    pub fn corners(&self) -> [Vector3; 8] {
        [
            Vector3::new(self.min.x, self.min.y, self.min.z),
            Vector3::new(self.max.x, self.min.y, self.min.z),
            Vector3::new(self.min.x, self.max.y, self.min.z),
            Vector3::new(self.max.x, self.max.y, self.min.z),
            Vector3::new(self.min.x, self.min.y, self.max.z),
            Vector3::new(self.max.x, self.min.y, self.max.z),
            Vector3::new(self.min.x, self.max.y, self.max.z),
            Vector3::new(self.max.x, self.max.y, self.max.z),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aabb_creation() {
        let aabb = AABB::from_center_size(Vector3::zero(), Vector3::new(2.0, 2.0, 2.0));
        assert_eq!(aabb.min, Vector3::new(-1.0, -1.0, -1.0));
        assert_eq!(aabb.max, Vector3::new(1.0, 1.0, 1.0));
    }

    #[test]
    fn test_aabb_contains_point() {
        let aabb = AABB::from_center_size(Vector3::zero(), Vector3::new(2.0, 2.0, 2.0));
        assert!(aabb.contains_point(Vector3::zero()));
        assert!(aabb.contains_point(Vector3::new(0.5, 0.5, 0.5)));
        assert!(!aabb.contains_point(Vector3::new(2.0, 0.0, 0.0)));
    }

    #[test]
    fn test_aabb_intersection() {
        let aabb1 = AABB::from_center_size(Vector3::zero(), Vector3::new(2.0, 2.0, 2.0));
        let aabb2 =
            AABB::from_center_size(Vector3::new(1.0, 0.0, 0.0), Vector3::new(2.0, 2.0, 2.0));
        assert!(aabb1.intersects(&aabb2));

        let aabb3 =
            AABB::from_center_size(Vector3::new(5.0, 0.0, 0.0), Vector3::new(2.0, 2.0, 2.0));
        assert!(!aabb1.intersects(&aabb3));
    }

    #[test]
    fn test_aabb_volume() {
        let aabb = AABB::from_center_size(Vector3::zero(), Vector3::new(2.0, 2.0, 2.0));
        assert!((aabb.volume() - 8.0).abs() < 1e-10);
    }

    #[test]
    fn test_aabb_merge() {
        let aabb1 = AABB::new(Vector3::zero(), Vector3::new(1.0, 1.0, 1.0));
        let aabb2 = AABB::new(Vector3::new(2.0, 2.0, 2.0), Vector3::new(3.0, 3.0, 3.0));
        let merged = aabb1.merge(&aabb2);
        assert_eq!(merged.min, Vector3::zero());
        assert_eq!(merged.max, Vector3::new(3.0, 3.0, 3.0));
    }
}

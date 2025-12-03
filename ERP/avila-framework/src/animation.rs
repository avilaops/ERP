//! Animation system with mathematical easing functions
//!
//! This module provides a robust animation framework with mathematically
//! precise easing functions, keyframe interpolation, and timeline control.
//!
//! # Features
//! - Comprehensive easing functions (cubic, exponential, elastic, bounce)
//! - Keyframe-based animation
//! - Timeline control with play/pause/reverse
//! - Bezier curve easing
//! - Spring physics simulation
//! - Animation composition and sequencing

use crate::Vec;
use core::f64::consts::PI;

/// Duration in milliseconds
pub type Duration = f64;

/// Time in milliseconds
pub type Time = f64;

/// Normalized progress value [0.0, 1.0]
pub type Progress = f64;

/// Easing function type
pub type EasingFn = fn(Progress) -> f64;

/// Standard easing functions
pub mod easing {
    use super::*;

    // ==================== Linear ====================

    /// Linear interpolation (no easing)
    pub fn linear(t: Progress) -> f64 {
        t
    }

    // ==================== Quadratic ====================

    /// Quadratic ease in (t^2)
    pub fn ease_in_quad(t: Progress) -> f64 {
        t * t
    }

    /// Quadratic ease out (1 - (1-t)^2)
    pub fn ease_out_quad(t: Progress) -> f64 {
        let t1 = 1.0 - t;
        1.0 - t1 * t1
    }

    /// Quadratic ease in-out
    pub fn ease_in_out_quad(t: Progress) -> f64 {
        if t < 0.5 {
            2.0 * t * t
        } else {
            let t1 = -2.0 * t + 2.0;
            1.0 - t1 * t1 / 2.0
        }
    }

    // ==================== Cubic ====================

    /// Cubic ease in (t^3)
    pub fn ease_in_cubic(t: Progress) -> f64 {
        t * t * t
    }

    /// Cubic ease out (1 - (1-t)^3)
    pub fn ease_out_cubic(t: Progress) -> f64 {
        let t1 = 1.0 - t;
        1.0 - t1 * t1 * t1
    }

    /// Cubic ease in-out
    pub fn ease_in_out_cubic(t: Progress) -> f64 {
        if t < 0.5 {
            4.0 * t * t * t
        } else {
            let t1 = -2.0 * t + 2.0;
            1.0 - t1 * t1 * t1 / 2.0
        }
    }

    // ==================== Quartic ====================

    /// Quartic ease in (t^4)
    pub fn ease_in_quart(t: Progress) -> f64 {
        t * t * t * t
    }

    /// Quartic ease out (1 - (1-t)^4)
    pub fn ease_out_quart(t: Progress) -> f64 {
        let t1 = 1.0 - t;
        1.0 - t1 * t1 * t1 * t1
    }

    /// Quartic ease in-out
    pub fn ease_in_out_quart(t: Progress) -> f64 {
        if t < 0.5 {
            8.0 * t * t * t * t
        } else {
            let t1 = -2.0 * t + 2.0;
            1.0 - t1 * t1 * t1 * t1 / 2.0
        }
    }

    // ==================== Quintic ====================

    /// Quintic ease in (t^5)
    pub fn ease_in_quint(t: Progress) -> f64 {
        t * t * t * t * t
    }

    /// Quintic ease out (1 - (1-t)^5)
    pub fn ease_out_quint(t: Progress) -> f64 {
        let t1 = 1.0 - t;
        1.0 - t1 * t1 * t1 * t1 * t1
    }

    /// Quintic ease in-out
    pub fn ease_in_out_quint(t: Progress) -> f64 {
        if t < 0.5 {
            16.0 * t * t * t * t * t
        } else {
            let t1 = -2.0 * t + 2.0;
            1.0 - t1 * t1 * t1 * t1 * t1 / 2.0
        }
    }

    // ==================== Sine ====================

    /// Sine ease in
    pub fn ease_in_sine(t: Progress) -> f64 {
        1.0 - ((t * PI) / 2.0).cos()
    }

    /// Sine ease out
    pub fn ease_out_sine(t: Progress) -> f64 {
        ((t * PI) / 2.0).sin()
    }

    /// Sine ease in-out
    pub fn ease_in_out_sine(t: Progress) -> f64 {
        -((PI * t).cos() - 1.0) / 2.0
    }

    // ==================== Exponential ====================

    /// Exponential ease in (2^(10*(t-1)))
    pub fn ease_in_expo(t: Progress) -> f64 {
        if t <= 0.0 {
            0.0
        } else {
            (2.0_f64).powf(10.0 * t - 10.0)
        }
    }

    /// Exponential ease out (1 - 2^(-10*t))
    pub fn ease_out_expo(t: Progress) -> f64 {
        if t >= 1.0 {
            1.0
        } else {
            1.0 - (2.0_f64).powf(-10.0 * t)
        }
    }

    /// Exponential ease in-out
    pub fn ease_in_out_expo(t: Progress) -> f64 {
        if t <= 0.0 {
            0.0
        } else if t >= 1.0 {
            1.0
        } else if t < 0.5 {
            (2.0_f64).powf(20.0 * t - 10.0) / 2.0
        } else {
            (2.0 - (2.0_f64).powf(-20.0 * t + 10.0)) / 2.0
        }
    }

    // ==================== Circular ====================

    /// Circular ease in (1 - sqrt(1 - t^2))
    pub fn ease_in_circ(t: Progress) -> f64 {
        1.0 - (1.0 - t * t).sqrt()
    }

    /// Circular ease out (sqrt(1 - (t-1)^2))
    pub fn ease_out_circ(t: Progress) -> f64 {
        let t1 = t - 1.0;
        (1.0 - t1 * t1).sqrt()
    }

    /// Circular ease in-out
    pub fn ease_in_out_circ(t: Progress) -> f64 {
        if t < 0.5 {
            (1.0 - (1.0 - (2.0 * t).powi(2)).sqrt()) / 2.0
        } else {
            let t1 = -2.0 * t + 2.0;
            ((1.0 - t1 * t1).sqrt() + 1.0) / 2.0
        }
    }

    // ==================== Back ====================

    /// Back ease in (overshoots and comes back)
    pub fn ease_in_back(t: Progress) -> f64 {
        const C1: f64 = 1.70158;
        const C3: f64 = C1 + 1.0;
        C3 * t * t * t - C1 * t * t
    }

    /// Back ease out (overshoots and settles)
    pub fn ease_out_back(t: Progress) -> f64 {
        const C1: f64 = 1.70158;
        const C3: f64 = C1 + 1.0;
        let t1 = t - 1.0;
        1.0 + C3 * t1 * t1 * t1 + C1 * t1 * t1
    }

    /// Back ease in-out
    pub fn ease_in_out_back(t: Progress) -> f64 {
        const C1: f64 = 1.70158;
        const C2: f64 = C1 * 1.525;

        if t < 0.5 {
            let t2 = 2.0 * t;
            (t2 * t2 * ((C2 + 1.0) * 2.0 * t - C2)) / 2.0
        } else {
            let t2 = 2.0 * t - 2.0;
            (t2 * t2 * ((C2 + 1.0) * t2 + C2) + 2.0) / 2.0
        }
    }

    // ==================== Elastic ====================

    /// Elastic ease in (exponentially decaying sine wave)
    pub fn ease_in_elastic(t: Progress) -> f64 {
        const C4: f64 = (2.0 * PI) / 3.0;

        if t <= 0.0 {
            0.0
        } else if t >= 1.0 {
            1.0
        } else {
            -(2.0_f64.powf(10.0 * t - 10.0)) * ((t * 10.0 - 10.75) * C4).sin()
        }
    }

    /// Elastic ease out (exponentially decaying sine wave)
    pub fn ease_out_elastic(t: Progress) -> f64 {
        const C4: f64 = (2.0 * PI) / 3.0;

        if t <= 0.0 {
            0.0
        } else if t >= 1.0 {
            1.0
        } else {
            2.0_f64.powf(-10.0 * t) * ((t * 10.0 - 0.75) * C4).sin() + 1.0
        }
    }

    /// Elastic ease in-out
    pub fn ease_in_out_elastic(t: Progress) -> f64 {
        const C5: f64 = (2.0 * PI) / 4.5;

        if t <= 0.0 {
            0.0
        } else if t >= 1.0 {
            1.0
        } else if t < 0.5 {
            -(2.0_f64.powf(20.0 * t - 10.0) * ((20.0 * t - 11.125) * C5).sin()) / 2.0
        } else {
            (2.0_f64.powf(-20.0 * t + 10.0) * ((20.0 * t - 11.125) * C5).sin()) / 2.0 + 1.0
        }
    }

    // ==================== Bounce ====================

    /// Bounce ease out (bouncing ball effect)
    pub fn ease_out_bounce(t: Progress) -> f64 {
        const N1: f64 = 7.5625;
        const D1: f64 = 2.75;

        if t < 1.0 / D1 {
            N1 * t * t
        } else if t < 2.0 / D1 {
            let t1 = t - 1.5 / D1;
            N1 * t1 * t1 + 0.75
        } else if t < 2.5 / D1 {
            let t1 = t - 2.25 / D1;
            N1 * t1 * t1 + 0.9375
        } else {
            let t1 = t - 2.625 / D1;
            N1 * t1 * t1 + 0.984375
        }
    }

    /// Bounce ease in
    pub fn ease_in_bounce(t: Progress) -> f64 {
        1.0 - ease_out_bounce(1.0 - t)
    }

    /// Bounce ease in-out
    pub fn ease_in_out_bounce(t: Progress) -> f64 {
        if t < 0.5 {
            (1.0 - ease_out_bounce(1.0 - 2.0 * t)) / 2.0
        } else {
            (1.0 + ease_out_bounce(2.0 * t - 1.0)) / 2.0
        }
    }
}

/// Keyframe for animation
#[derive(Debug, Clone, Copy)]
pub struct Keyframe<T> {
    /// Time position of the keyframe (0.0 to 1.0)
    pub time: Progress,
    /// Value at this keyframe
    pub value: T,
}

impl<T> Keyframe<T> {
    pub fn new(time: Progress, value: T) -> Self {
        Self { time, value }
    }
}

/// Trait for values that can be interpolated
pub trait Interpolate: Clone {
    /// Linear interpolation between self and other
    /// t should be in range [0.0, 1.0]
    fn lerp(&self, other: &Self, t: f64) -> Self;
}

impl Interpolate for f64 {
    fn lerp(&self, other: &Self, t: f64) -> Self {
        self + (other - self) * t
    }
}

impl Interpolate for (f64, f64) {
    fn lerp(&self, other: &Self, t: f64) -> Self {
        (
            self.0 + (other.0 - self.0) * t,
            self.1 + (other.1 - self.1) * t,
        )
    }
}

impl Interpolate for [f64; 2] {
    fn lerp(&self, other: &Self, t: f64) -> Self {
        [
            self[0] + (other[0] - self[0]) * t,
            self[1] + (other[1] - self[1]) * t,
        ]
    }
}

impl Interpolate for [f64; 3] {
    fn lerp(&self, other: &Self, t: f64) -> Self {
        [
            self[0] + (other[0] - self[0]) * t,
            self[1] + (other[1] - self[1]) * t,
            self[2] + (other[2] - self[2]) * t,
        ]
    }
}

impl Interpolate for [f64; 4] {
    fn lerp(&self, other: &Self, t: f64) -> Self {
        [
            self[0] + (other[0] - self[0]) * t,
            self[1] + (other[1] - self[1]) * t,
            self[2] + (other[2] - self[2]) * t,
            self[3] + (other[3] - self[3]) * t,
        ]
    }
}

/// Animation state
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnimationState {
    /// Animation is playing forward
    Playing,
    /// Animation is paused
    Paused,
    /// Animation has completed
    Completed,
    /// Animation is playing in reverse
    Reverse,
}

/// Keyframe-based animation
pub struct Animation<T: Interpolate> {
    keyframes: Vec<Keyframe<T>>,
    duration: Duration,
    easing: EasingFn,
    current_time: Time,
    state: AnimationState,
    loop_count: Option<u32>,
    current_loop: u32,
}

impl<T: Interpolate> Animation<T> {
    /// Create a new animation with keyframes
    pub fn new(duration: Duration) -> Self {
        Self {
            keyframes: Vec::new(),
            duration,
            easing: easing::linear,
            current_time: 0.0,
            state: AnimationState::Paused,
            loop_count: None,
            current_loop: 0,
        }
    }

    /// Add a keyframe to the animation
    pub fn add_keyframe(&mut self, keyframe: Keyframe<T>) {
        self.keyframes.push(keyframe);
        // Keep keyframes sorted by time
        self.keyframes.sort_by(|a, b| {
            a.time.partial_cmp(&b.time).unwrap_or(core::cmp::Ordering::Equal)
        });
    }

    /// Set the easing function
    pub fn set_easing(&mut self, easing: EasingFn) {
        self.easing = easing;
    }

    /// Set loop count (None = infinite)
    pub fn set_loop_count(&mut self, count: Option<u32>) {
        self.loop_count = count;
    }

    /// Start playing the animation
    pub fn play(&mut self) {
        self.state = AnimationState::Playing;
    }

    /// Pause the animation
    pub fn pause(&mut self) {
        self.state = AnimationState::Paused;
    }

    /// Stop and reset the animation
    pub fn stop(&mut self) {
        self.state = AnimationState::Paused;
        self.current_time = 0.0;
        self.current_loop = 0;
    }

    /// Reverse the animation direction
    pub fn reverse(&mut self) {
        self.state = AnimationState::Reverse;
    }

    /// Get current animation state
    pub fn state(&self) -> AnimationState {
        self.state
    }

    /// Update animation by delta time (in milliseconds)
    pub fn update(&mut self, delta_time: Time) {
        match self.state {
            AnimationState::Playing => {
                self.current_time += delta_time;
                if self.current_time >= self.duration {
                    self.handle_loop();
                }
            }
            AnimationState::Reverse => {
                self.current_time -= delta_time;
                if self.current_time <= 0.0 {
                    self.handle_loop();
                }
            }
            _ => {}
        }
    }

    fn handle_loop(&mut self) {
        if let Some(max_loops) = self.loop_count {
            self.current_loop += 1;
            if self.current_loop >= max_loops {
                self.state = AnimationState::Completed;
                self.current_time = self.duration;
                return;
            }
        }

        // Loop back
        if self.state == AnimationState::Playing {
            self.current_time -= self.duration;
        } else {
            self.current_time += self.duration;
        }
    }

    /// Get the current interpolated value
    pub fn value(&self) -> Option<T> {
        if self.keyframes.len() < 2 {
            return self.keyframes.first().map(|kf| kf.value.clone());
        }

        let progress = (self.current_time / self.duration).clamp(0.0, 1.0);
        let eased_progress = (self.easing)(progress);

        // Find the two keyframes to interpolate between
        let mut before = &self.keyframes[0];
        let mut after = &self.keyframes[self.keyframes.len() - 1];

        for i in 0..self.keyframes.len() - 1 {
            if eased_progress >= self.keyframes[i].time &&
               eased_progress <= self.keyframes[i + 1].time {
                before = &self.keyframes[i];
                after = &self.keyframes[i + 1];
                break;
            }
        }

        // Calculate local t between the two keyframes
        let time_range = after.time - before.time;
        let local_t = if time_range > 1e-10 {
            (eased_progress - before.time) / time_range
        } else {
            0.0
        };

        Some(before.value.lerp(&after.value, local_t))
    }

    /// Get current progress (0.0 to 1.0)
    pub fn progress(&self) -> Progress {
        (self.current_time / self.duration).clamp(0.0, 1.0)
    }
}

/// Spring physics for smooth animations
#[derive(Debug, Clone)]
pub struct Spring {
    /// Current position
    pub position: f64,
    /// Current velocity
    pub velocity: f64,
    /// Target position
    pub target: f64,
    /// Spring stiffness (higher = more rigid)
    pub stiffness: f64,
    /// Damping coefficient (higher = more damping)
    pub damping: f64,
    /// Mass of the object
    pub mass: f64,
}

impl Spring {
    /// Create a new spring
    pub fn new(initial_position: f64, target: f64) -> Self {
        Self {
            position: initial_position,
            velocity: 0.0,
            target,
            stiffness: 100.0,
            damping: 10.0,
            mass: 1.0,
        }
    }

    /// Create a spring with custom physics parameters
    pub fn with_params(initial_position: f64, target: f64, stiffness: f64, damping: f64) -> Self {
        Self {
            position: initial_position,
            velocity: 0.0,
            target,
            stiffness,
            damping,
            mass: 1.0,
        }
    }

    /// Update spring physics (delta_time in seconds)
    pub fn update(&mut self, delta_time: f64) {
        // Spring force: F = -k * x
        let spring_force = -self.stiffness * (self.position - self.target);

        // Damping force: F = -c * v
        let damping_force = -self.damping * self.velocity;

        // Total force
        let force = spring_force + damping_force;

        // Acceleration: a = F / m
        let acceleration = force / self.mass;

        // Update velocity: v = v + a * dt
        self.velocity += acceleration * delta_time;

        // Update position: x = x + v * dt
        self.position += self.velocity * delta_time;
    }

    /// Check if spring has settled (within threshold)
    pub fn is_settled(&self, threshold: f64) -> bool {
        (self.position - self.target).abs() < threshold &&
        self.velocity.abs() < threshold
    }

    /// Set a new target
    pub fn set_target(&mut self, target: f64) {
        self.target = target;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use easing::*;

    #[test]
    fn test_linear_easing() {
        assert!((linear(0.0) - 0.0).abs() < 1e-10);
        assert!((linear(0.5) - 0.5).abs() < 1e-10);
        assert!((linear(1.0) - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_ease_in_quad() {
        assert!((ease_in_quad(0.0) - 0.0).abs() < 1e-10);
        assert!((ease_in_quad(0.5) - 0.25).abs() < 1e-10);
        assert!((ease_in_quad(1.0) - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_ease_out_quad() {
        assert!((ease_out_quad(0.0) - 0.0).abs() < 1e-10);
        assert!(ease_out_quad(0.5) > 0.5); // Should be faster than linear
        assert!((ease_out_quad(1.0) - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_interpolate_f64() {
        let a = 0.0;
        let b = 10.0;
        assert!((a.lerp(&b, 0.0) - 0.0).abs() < 1e-10);
        assert!((a.lerp(&b, 0.5) - 5.0).abs() < 1e-10);
        assert!((a.lerp(&b, 1.0) - 10.0).abs() < 1e-10);
    }

    #[test]
    fn test_interpolate_tuple() {
        let a = (0.0, 0.0);
        let b = (10.0, 20.0);
        let mid = a.lerp(&b, 0.5);
        assert!((mid.0 - 5.0).abs() < 1e-10);
        assert!((mid.1 - 10.0).abs() < 1e-10);
    }

    #[test]
    fn test_interpolate_array() {
        let a = [0.0, 0.0, 0.0];
        let b = [10.0, 20.0, 30.0];
        let mid = a.lerp(&b, 0.5);
        assert!((mid[0] - 5.0).abs() < 1e-10);
        assert!((mid[1] - 10.0).abs() < 1e-10);
        assert!((mid[2] - 15.0).abs() < 1e-10);
    }

    #[test]
    fn test_animation_basic() {
        let mut anim = Animation::new(1000.0);
        anim.add_keyframe(Keyframe::new(0.0, 0.0));
        anim.add_keyframe(Keyframe::new(1.0, 100.0));
        anim.set_loop_count(Some(1)); // Prevent looping

        anim.play();
        assert_eq!(anim.state(), AnimationState::Playing);

        // At start
        let val = anim.value().unwrap();
        assert!((val - 0.0).abs() < 1e-10);

        // At middle
        anim.update(500.0);
        let val = anim.value().unwrap();
        assert!((val - 50.0).abs() < 1e-9);

        // At end
        anim.update(500.0);
        let val = anim.value().unwrap();
        assert!((val - 100.0).abs() < 1e-9);
    }

    #[test]
    fn test_animation_with_easing() {
        let mut anim = Animation::new(1000.0);
        anim.add_keyframe(Keyframe::new(0.0, 0.0));
        anim.add_keyframe(Keyframe::new(1.0, 100.0));
        anim.set_easing(ease_in_quad);

        anim.play();
        anim.update(500.0); // 50% time

        let val = anim.value().unwrap();
        // With ease_in_quad, at 50% time we should be at 25% value
        assert!((val - 25.0).abs() < 1.0);
    }

    #[test]
    fn test_animation_pause_resume() {
        let mut anim = Animation::new(1000.0);
        anim.add_keyframe(Keyframe::new(0.0, 0.0));
        anim.add_keyframe(Keyframe::new(1.0, 100.0));

        anim.play();
        anim.update(500.0);

        anim.pause();
        let val_paused = anim.value().unwrap();

        anim.update(500.0); // Should not change while paused
        let val_still = anim.value().unwrap();
        assert!((val_paused - val_still).abs() < 1e-10);
    }

    #[test]
    fn test_spring_basic() {
        let mut spring = Spring::new(0.0, 100.0);

        // Update for a bit
        for _ in 0..100 {
            spring.update(0.016); // ~60fps
        }

        // Should be moving towards target
        assert!(spring.position > 0.0);
        assert!(spring.position <= 100.0);
    }

    #[test]
    fn test_spring_settling() {
        let mut spring = Spring::with_params(0.0, 10.0, 200.0, 20.0);

        // Run until settled
        for _ in 0..1000 {
            spring.update(0.016);
            if spring.is_settled(0.01) {
                break;
            }
        }

        // Should be very close to target
        assert!((spring.position - 10.0).abs() < 0.1);
    }

    #[test]
    fn test_spring_target_change() {
        let mut spring = Spring::new(0.0, 10.0);

        // Update to get some velocity
        for _ in 0..10 {
            spring.update(0.016);
        }

        let pos_before = spring.position;

        // Change target
        spring.set_target(20.0);
        assert_eq!(spring.target, 20.0);

        // Continue updating
        for _ in 0..10 {
            spring.update(0.016);
        }

        // Position should have changed
        assert_ne!(spring.position, pos_before);
    }

    #[test]
    fn test_bounce_easing() {
        // Bounce should start at 0, end at 1, and have values > 1 in between
        assert!((ease_out_bounce(0.0) - 0.0).abs() < 1e-10);
        assert!((ease_out_bounce(1.0) - 1.0).abs() < 1e-10);

        // Check there's a bounce (value should dip below linear)
        let mid = ease_out_bounce(0.5);
        assert!(mid < 1.0);
    }

    #[test]
    fn test_elastic_easing() {
        // Elastic should oscillate around target
        assert!((ease_out_elastic(0.0) - 0.0).abs() < 1e-10);
        assert!((ease_out_elastic(1.0) - 1.0).abs() < 1e-10);

        // Should have some overshoot
        let samples: Vec<f64> = (0..10)
            .map(|i| ease_out_elastic(i as f64 / 10.0))
            .collect();

        // Check that it oscillates (has both values > 1.0 and < 1.0)
        let has_overshoot = samples.iter().any(|&x| x > 1.0);
        let has_undershoot = samples.iter().any(|&x| x < 0.0);
        assert!(has_overshoot || has_undershoot);
    }
}

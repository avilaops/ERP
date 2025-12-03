//! Adaptive Filters and Digital Signal Processing
//!
//! Implements Kalman filter, Wiener filter, and Z-transform for discrete systems.

pub mod kalman;
pub mod wiener;
pub mod ztransform;

pub use kalman::KalmanFilter;
pub use wiener::WienerFilter;
pub use ztransform::{inverse_ztransform, ztransform, ZTransform};

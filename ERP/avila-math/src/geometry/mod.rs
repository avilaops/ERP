/// Módulo de Geometria - Quaternions, Geometria 4D e Transformações
///
/// Este módulo contém todas as estruturas e operações relacionadas à geometria,
/// incluindo quaternions 3D, quaternions duplos, rotações SO(4) e geometria euclidiana 4D.
pub mod aabb;
pub mod dual_quaternion;
pub mod geometry4d;
pub mod matrix;
pub mod quaternion3d;
pub mod vector;

pub use aabb::AABB;
pub use dual_quaternion::{DualQuat, SO4Rotation};
pub use geometry4d::{
    Cell24, Matrix4x4, Point4D, Projection4Dto3D, RigidBody4D, Simplex4D, Tesseract, Vector4D,
};
pub use matrix::Matrix4;
pub use quaternion3d::Quat3D;
pub use vector::{Vector2, Vector3, Vector4};

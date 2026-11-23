//! Inverse kinematics on positions and world space rotation deltas, so the
//! same solvers drive a three.js skeleton, a raw bone array or a test.
//!
//! - [`two_bone`]: analytic two bone solve with a pole vector and optional
//!   soft reach.
//! - [`chain`]: FABRIK with cone and hinge limits, CCD, and the rotation
//!   deltas that carry a solved position chain back onto bones.
//! - [`look`]: look at with yaw and pitch clamps spread over a neck and head
//!   chain, and eye aim clamped to the head.
//! - [`hand`]: palm frame and grip point from the knuckles, finger curl.
//! - [`contact`]: foot locking with an exponential release, and the pelvis
//!   drop that keeps both locked feet reachable.
//!
//! Every rotation returned is a world space delta: premultiply it onto the
//! bone's world rotation, then convert back to the parent's space.

#![cfg_attr(not(feature = "std"), no_std)]
#![allow(clippy::needless_range_loop)]

extern crate alloc;

pub mod chain;
pub mod contact;
pub mod golden;
pub mod hand;
pub mod look;
pub mod two_bone;

#[cfg(feature = "wasm")]
mod wasm;

pub use organic::{Quat, Vec3};

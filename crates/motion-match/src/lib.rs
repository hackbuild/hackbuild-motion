//! Classic motion matching, written for this library from the published
//! descriptions (Clavet 2016, Holden's motion matching notes, Bollo 2016
//! for inertialization).
//!
//! - [`clip`]: ground plane root transforms and clips with root, bone
//!   rotations, hip and foot positions and foot contacts per frame.
//! - [`db`]: the feature database (future trajectory positions and
//!   directions, foot positions and velocities, hip velocity), per group
//!   normalization and weights, brute force and bounding box search.
//! - [`trajectory`]: the desired future trajectory from a speed and turn
//!   rate command.
//! - [`matcher`]: the controller: plays a frame, searches on an interval,
//!   jumps with an inertialized transition, fills the shared motor state.
//! - [`synth`]: synthetic gait clips with planted feet, for tests.
//!
//! Positions are meters, +Y up; a root at yaw 0 faces +Z. Every
//! transcendental goes through `libm`, so native and wasm builds give the
//! same numbers.

#![cfg_attr(not(feature = "std"), no_std)]
#![allow(clippy::needless_range_loop, clippy::too_many_arguments)]

extern crate alloc;

pub mod clip;
pub mod db;
pub mod golden;
pub mod matcher;
pub mod synth;
pub mod trajectory;

#[cfg(feature = "wasm")]
mod wasm;

pub use clip::{Clip, Root};
pub use db::{Config, Database, Hit};
pub use matcher::{Matcher, MatcherParams};

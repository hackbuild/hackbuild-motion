//! Motion between rigs through the normalized humanoid space, written for
//! this library.
//!
//! - [`skeleton`]: joints with rest transforms, forward kinematics.
//! - [`motion`]: `HumanoidMotion`, the interchange format: per bone local
//!   rotations in the normalized space (T pose rest, +Z forward, left on
//!   +X) and hip travel in multiples of hip height, so one motion fits a
//!   child and a tall adult. A compact binary form too.
//! - [`retarget`]: a clip on any mapped skeleton to `HumanoidMotion` and
//!   back onto any other, with per bone rest correction (an A pose source
//!   works without a T pose frame), facing and unit fixes.
//! - [`rest_frame`] and [`floor`]: a T pose kept in the first frame becomes
//!   the rest; a clip that floats or sinks a little is settled on the floor.
//! - [`bvh`] and [`vmd`]: readers for BVH and MikuMikuDance motions.
//! - [`analyze`]: tags from what the body does (wave, squat, nod, spin, walk,
//!   dance, idle and more), so opaque clip names become searchable.

#![cfg_attr(not(feature = "std"), no_std)]
#![allow(clippy::needless_range_loop, clippy::too_many_arguments)]

extern crate alloc;

pub mod analyze;
pub mod bvh;
pub mod floor;
pub mod golden;
pub mod motion;
pub mod rest_frame;
pub mod retarget;
pub mod skeleton;
pub mod vmd;

#[cfg(feature = "wasm")]
mod wasm;

pub use motion::HumanoidMotion;
pub use retarget::{Rig, retarget_clip};
pub use skeleton::{Clip, Skeleton};

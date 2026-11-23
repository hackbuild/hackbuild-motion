//! Rig handling for the normalized humanoid space (VRM 1.0 bone names, T
//! pose, +Z forward, meters, feet at y = 0) and the limb chain model for
//! non humanoids.
//!
//! - [`mapper`]: source bone names to VRM humanoid bones by rules, with no
//!   per rig tables, plus a report of what did not map.
//! - [`chain`]: named limb chains with root, tip and pole for quadrupeds and
//!   other rigs.
//! - [`rest`]: facing, units, floor and arm pose of a rest skeleton, and the
//!   fixes that bring it into the normalized space.

#![cfg_attr(not(feature = "std"), no_std)]
#![allow(clippy::needless_range_loop)]

extern crate alloc;

pub mod bones;
pub mod chain;
pub mod golden;
pub mod mapper;
pub mod mmd;
pub mod reference;
pub mod rest;
pub mod tokens;

#[cfg(feature = "wasm")]
mod wasm;

pub use bones::HumanBone;
pub use mapper::{Dialect, RigMap, RigNode, map_rig};

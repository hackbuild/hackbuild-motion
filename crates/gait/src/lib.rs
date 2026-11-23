//! Procedural locomotion for legged rigs, written for this library from the
//! HACKLE dog body.
//!
//! - [`table`]: footfall tables (walk, pace, trot, canter, gallop for four
//!   legs; tripod, ripple and wave for six) as validated data, and footfall
//!   diagrams.
//! - [`froude`]: gait choice from the Froude number with hysteresis.
//! - [`gait`]: one phase oscillator per leg, landing prediction, minimum
//!   jerk swings, step in place when standing, forced relift.
//! - [`body`]: posture springs, terrain pitch and roll, gait bob, turn lean
//!   and load shift.
//! - [`secondary`]: spring chains for tails, wag modes, ear springs.
//! - [`steer`]: potential field steering toward a goal around obstacles.
//! - [`motor`]: the one motor state every source fills (phase, duty,
//!   stride frequency, contacts, source label), and phase from touchdown
//!   timing for sources without an oscillator.
//! - [`backend`]: the locomotion backend interface with declared
//!   capabilities, so callers ask a backend for its stop distance.
//!
//! Positions are meters, +Y up; a body at yaw 0 faces +Z. Foot heights are
//! above the ground: the caller adds its own ground height, so the crate
//! needs no terrain callback.

#![cfg_attr(not(feature = "std"), no_std)]
#![allow(clippy::needless_range_loop, clippy::too_many_arguments)]

extern crate alloc;

pub mod backend;
pub mod body;
pub mod froude;
pub mod gait;
pub mod golden;
pub mod motor;
pub mod secondary;
pub mod steer;
pub mod table;

#[cfg(feature = "wasm")]
mod wasm;

//! Springs, inertialization, stochastic processes and samplers for procedural
//! animation. Pure f64 math with no allocation in the per frame paths.
//!
//! Every transcendental function goes through `libm`, so a native build and a
//! `wasm32` build give bit identical numbers for the same seed
//! (`tests/golden.rs` and the TypeScript package test check this).
//!
//! The spring formulas follow Daniel Holden's published articles
//! "Spring-It-On" and "Dead Blending" (theorangeduck.com).

#![cfg_attr(not(feature = "std"), no_std)]
#![allow(clippy::needless_range_loop)]

extern crate alloc;

pub mod clock;
pub mod curve;
pub mod golden;
pub mod inertialize;
pub mod math;
pub mod noise;
pub mod rng;
pub mod sample;
pub mod spring;

#[cfg(feature = "wasm")]
mod wasm;

pub use math::{Quat, Vec3};
pub use rng::{Mulberry32, Rng, hash_seed};

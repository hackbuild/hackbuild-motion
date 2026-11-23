//! A runtime for a categorical codebook matching motion network, written
//! from a functional specification of the published quadruped network and
//! from Starke et al., "Categorical Codebook Matching for Embodied
//! Character Controllers" (SIGGRAPH 2024). No other implementation was read.
//!
//! - [`half`]: exact IEEE binary16 to binary32 conversion.
//! - [`kernels`]: the dot product every layer runs on, with a SIMD128 body
//!   on wasm32 and a scalar body elsewhere that adds in the same order, so
//!   both builds give bit identical numbers.
//! - [`net`]: dimensions, tensor slots keyed by the manifest names, and the
//!   forward pass (estimate, refine, decode 16 frames).
//! - [`rng`]: the 32 bit linear congruential generator the test vectors use.
//! - [`golden`]: a seeded random network and input whose outputs the native
//!   and wasm builds must reproduce bit for bit.
//!
//! The weights are CC BY-NC 4.0 (AI4AnimationPy) and are never part of this
//! crate; a caller hands them in at run time.

#![cfg_attr(not(feature = "std"), no_std)]
#![allow(clippy::needless_range_loop)]

extern crate alloc;

pub mod golden;
pub mod half;
pub mod kernels;
pub mod net;
pub mod rng;

#[cfg(feature = "wasm")]
mod wasm;

pub use net::{Dims, Dtype, Network, Prediction, SetError, Workspace};

/// The licence of the published weights this runtime is built to load.
pub const WEIGHT_LICENCE: &str = "weights: cc by-nc 4.0, paul starke and sebastian starke, meta, ai4animationpy. loaded at run time, never bundled.";

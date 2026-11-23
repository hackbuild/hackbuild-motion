//! A runtime for small motion networks, written for this library from the
//! published descriptions of the architectures it runs.
//!
//! - [`half`]: IEEE 754 half floats to f32, bit exact.
//! - [`kernels`]: matrix vector products with SIMD128 on wasm and the same
//!   summation order natively, so both builds give the same bits; f32 or
//!   f64 accumulation.
//! - [`store`]: named tensors loaded from a weight file the caller owns.
//! - [`mlp`]: dense layers with an activation each, input and output
//!   normalization.
//! - [`codebook`]: codebook matching (an estimator picks a soft code per
//!   group, a denoiser refines it, a FiLM decoder conditioned on time
//!   decodes a sequence of frames).
//!
//! No weights live in this crate. The caller loads a file it has the right
//! to use and names its licence.

#![cfg_attr(not(feature = "std"), no_std)]
#![allow(clippy::needless_range_loop, clippy::too_many_arguments)]

extern crate alloc;

pub mod codebook;
pub mod golden;
pub mod half;
pub mod kernels;
pub mod mlp;
pub mod store;

#[cfg(feature = "wasm")]
mod wasm;

pub use codebook::{Codebook, CodebookDims};
pub use kernels::{Accum, Activation};
pub use mlp::Mlp;
pub use store::{Store, Tensor};

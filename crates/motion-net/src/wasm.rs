//! The wasm surface. Two parts:
//!
//! - wasm-bindgen exports for the page (`goldenTrace`, `weightLicence`).
//! - A plain C ABI (`mn_*`) over linear memory. A worker built from a blob
//!   instantiates the same wasm bytes with no generated glue, so it runs
//!   from file:// where the worker cannot import a module script; the page
//!   fallback drives the same ABI, so both paths run the same code.
//!
//! Engine handles are pointers into linear memory. Buffers handed out by
//! `mn_input`, `mn_output` and `mn_code` stay valid until `mn_destroy`;
//! a JS view over them must be rebuilt after any call that can grow memory.

use crate::net::{Dims, Dtype, Network, Prediction, SetError, Workspace};
use alloc::boxed::Box;
use alloc::vec;
use alloc::vec::Vec;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = goldenTrace)]
pub fn golden_trace(seed: u32) -> Vec<f64> {
    crate::golden::trace(seed)
}

#[wasm_bindgen(js_name = weightLicence)]
pub fn weight_licence() -> String {
    crate::WEIGHT_LICENCE.into()
}

pub struct Engine {
    net: Network,
    ws: Workspace,
    input: Vec<f32>,
    pred: Prediction,
}

/// Reserves `n` bytes and returns their address.
#[unsafe(no_mangle)]
pub extern "C" fn mn_alloc(n: usize) -> *mut u8 {
    let mut v = vec![0u8; n.max(1)].into_boxed_slice();
    let p = v.as_mut_ptr();
    core::mem::forget(v);
    p
}

/// Releases a block from [`mn_alloc`].
///
/// # Safety
/// `p` and `n` come from one earlier `mn_alloc(n)` call, released once.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mn_free(p: *mut u8, n: usize) {
    // SAFETY: the caller passes back exactly what mn_alloc returned
    unsafe {
        drop(Box::from_raw(core::ptr::slice_from_raw_parts_mut(
            p,
            n.max(1),
        )))
    }
}

/// A new engine, or null when the dimensions are inconsistent.
#[unsafe(no_mangle)]
pub extern "C" fn mn_create(
    d_in: usize,
    d_out: usize,
    hidden: usize,
    group: usize,
    frames: usize,
    passes: usize,
) -> *mut Engine {
    let dims = Dims {
        d_in,
        d_out,
        hidden,
        group,
        frames,
        passes,
    };
    if !dims.valid() {
        return core::ptr::null_mut();
    }
    Box::into_raw(Box::new(Engine {
        net: Network::new(dims),
        ws: Workspace::new(&dims),
        input: vec![0.0; d_in],
        pred: Prediction::new(&dims),
    }))
}

/// # Safety
/// `e` comes from [`mn_create`] and is destroyed once.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mn_destroy(e: *mut Engine) {
    if !e.is_null() {
        // SAFETY: the caller owns the handle
        unsafe { drop(Box::from_raw(e)) }
    }
}

/// Fills one tensor. `dtype` 0 is binary16, 1 binary32. Returns 0 when
/// stored, 1 when the key is unused, 2 for a wrong count, 3 for short data,
/// 4 for a bad key or dtype.
///
/// # Safety
/// `e` is a live engine; the key and data ranges are readable.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mn_set(
    e: *mut Engine,
    key: *const u8,
    key_len: usize,
    dtype: u32,
    data: *const u8,
    count: usize,
) -> u32 {
    let dt = match dtype {
        0 => Dtype::F16,
        1 => Dtype::F32,
        _ => return 4,
    };
    // SAFETY: the caller guarantees the handle and both ranges
    let (eng, key, bytes) = unsafe {
        (
            &mut *e,
            core::slice::from_raw_parts(key, key_len),
            core::slice::from_raw_parts(data, count * dt.size()),
        )
    };
    let Ok(key) = core::str::from_utf8(key) else {
        return 4;
    };
    match eng.net.set(key, dt, count, bytes) {
        Ok(()) => 0,
        Err(SetError::Unused) => 1,
        Err(SetError::Count { .. }) => 2,
        Err(SetError::Short) => 3,
    }
}

/// 0 when every tensor is present, else 1 plus the index of the first
/// missing tensor in `tensor_keys` order.
///
/// # Safety
/// `e` is a live engine.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mn_missing(e: *const Engine) -> u32 {
    // SAFETY: live handle
    let eng = unsafe { &*e };
    match eng.net.missing() {
        None => 0,
        Some(k) => 1 + crate::net::tensor_keys().position(|x| x == k).unwrap_or(0) as u32,
    }
}

/// # Safety
/// `e` is a live engine.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mn_input(e: *mut Engine) -> *mut f32 {
    // SAFETY: live handle
    unsafe { (*e).input.as_mut_ptr() }
}

/// `which` 0 is the frames, 1 the refined code, 2 the code estimate.
///
/// # Safety
/// `e` is a live engine.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mn_output(e: *const Engine, which: u32) -> *const f32 {
    // SAFETY: live handle
    let p = unsafe { &(*e).pred };
    match which {
        1 => p.code.as_ptr(),
        2 => p.code0.as_ptr(),
        _ => p.frames.as_ptr(),
    }
}

/// Runs the network on the input buffer. Returns 0, or 1 when a tensor is
/// missing.
///
/// # Safety
/// `e` is a live engine.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mn_forward(e: *mut Engine) -> u32 {
    // SAFETY: live handle
    let eng = unsafe { &mut *e };
    if eng.net.missing().is_some() {
        return 1;
    }
    eng.net.forward(&eng.input, &mut eng.ws, &mut eng.pred);
    0
}

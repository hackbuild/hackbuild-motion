//! wasm-bindgen surface. Structured results cross as JSON strings and byte
//! arrays; the TypeScript wrapper turns them into typed objects.

use crate::clip::{BakeInput, bake, encode};
use crate::lock::{AssetEntry, Lock, sha256_hex};
use crate::optimize::{OptimizeOptions, optimize};
use crate::texture::{Replacements, TextureLimits, TextureOutput, list_textures};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = goldenTrace)]
pub fn golden_trace(seed: u32) -> Vec<f64> {
    crate::golden::trace(seed)
}

#[wasm_bindgen(js_name = syntheticGlb)]
pub fn synthetic_glb(seed: u32, grid: u32) -> Vec<u8> {
    crate::golden::synthetic_glb(seed, grid as usize)
}

#[wasm_bindgen(js_name = syntheticClips)]
pub fn synthetic_clips(seed: u32) -> String {
    serde_json::to_string(&crate::golden::synthetic_clips(seed)).unwrap_or_default()
}

#[wasm_bindgen(js_name = sha256Hex)]
pub fn sha256_hex_js(bytes: &[u8]) -> String {
    sha256_hex(bytes)
}

#[wasm_bindgen(js_name = listTextures)]
pub fn list_textures_js(glb: &[u8]) -> Result<String, JsError> {
    let l = list_textures(glb).map_err(|e| JsError::new(&e.0))?;
    Ok(serde_json::to_string(&l).unwrap_or_default())
}

#[wasm_bindgen]
pub struct Baked {
    bytes: Vec<u8>,
    report: String,
}

#[wasm_bindgen]
impl Baked {
    pub fn bytes(&self) -> Vec<u8> {
        self.bytes.clone()
    }
    pub fn report(&self) -> String {
        self.report.clone()
    }
}

/// `limits`: baseColor, emissive, normal, orm, other. Replacement images
/// arrive as parallel lists: image index, byte length, concatenated bytes,
/// and mime types joined by newlines.
#[wasm_bindgen(js_name = optimizeGlb)]
#[allow(clippy::too_many_arguments)]
pub fn optimize_glb(
    glb: &[u8],
    ratio: f32,
    error: f32,
    lock_border: bool,
    limits: &[u32],
    images: &[u32],
    lengths: &[u32],
    bytes: &[u8],
    mimes: &str,
) -> Result<Baked, JsError> {
    let l = |i: usize| limits.get(i).copied().unwrap_or(0);
    let opts = OptimizeOptions {
        ratio,
        error,
        lock_border,
        textures: TextureLimits {
            base_color: l(0),
            emissive: l(1),
            normal: l(2),
            orm: l(3),
            other: l(4),
        },
    };
    let mut rep = Replacements::default();
    let mut at = 0usize;
    let mut mime = mimes.split('\n');
    for (i, len) in images.iter().zip(lengths) {
        let len = *len as usize;
        let Some(b) = bytes.get(at..at + len) else {
            return Err(JsError::new(
                "bake: replacement bytes are shorter than their lengths",
            ));
        };
        at += len;
        rep.0.insert(
            *i as usize,
            TextureOutput {
                bytes: b.to_vec(),
                mime: mime.next().unwrap_or("").to_string(),
            },
        );
    }
    let (out, report) = optimize(glb, &opts, &mut rep).map_err(|e| JsError::new(&e.0))?;
    Ok(Baked {
        bytes: out,
        report: serde_json::to_string(&report).unwrap_or_default(),
    })
}

#[wasm_bindgen(js_name = bakeClips)]
pub fn bake_clips(input_json: &str) -> Result<Baked, JsError> {
    let input: BakeInput = serde_json::from_str(input_json)
        .map_err(|e| JsError::new(&format!("bake: clip input does not parse: {e}")))?;
    let (pack, reports) = bake(&input).map_err(|e| JsError::new(&e.0))?;
    Ok(Baked {
        bytes: encode(&pack),
        report: serde_json::to_string(&reports).unwrap_or_default(),
    })
}

/// Entries as JSON in, assets.lock.json text out.
#[wasm_bindgen(js_name = writeLock)]
pub fn write_lock(entries_json: &str) -> Result<String, JsError> {
    let assets: Vec<AssetEntry> = serde_json::from_str(entries_json)
        .map_err(|e| JsError::new(&format!("bake: entries do not parse: {e}")))?;
    let mut lock = Lock::default();
    assets.into_iter().for_each(|a| lock.upsert(a));
    Ok(lock.write())
}

/// Files as parallel lists: names joined by newlines, byte lengths, and the
/// concatenated bytes. Returns `{ ok, failures }` as JSON.
#[wasm_bindgen(js_name = checkLock)]
pub fn check_lock(
    lock_text: &str,
    names: &str,
    lengths: &[u32],
    bytes: &[u8],
    forbid: &str,
) -> Result<String, JsError> {
    let lock = Lock::parse(lock_text).map_err(|e| JsError::new(&e.0))?;
    let mut files = std::collections::BTreeMap::new();
    let mut at = 0usize;
    for (name, len) in names.split('\n').zip(lengths) {
        let len = *len as usize;
        if let Some(b) = bytes.get(at..at + len) {
            files.insert(name.to_string(), b.to_vec());
        }
        at += len;
    }
    let forbid: Vec<String> = forbid
        .split('\n')
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();
    let res = lock.check(&mut |p| files.get(p).cloned(), &forbid);
    Ok(serde_json::to_string(&res).unwrap_or_default())
}

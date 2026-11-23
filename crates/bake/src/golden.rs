//! Synthetic inputs (a walking leg rig, a bumpy grid GLB) and the fixed
//! trace for the native and wasm agreement test. No model files.

use crate::clip::{BakeInput, ContactRule, Skeleton, SourceClip, bake, encode};
use crate::glb::Glb;
use crate::lock::sha256_hex;
use crate::optimize::{OptimizeOptions, empty_document, optimize};
use crate::texture::{TextureHook, TextureInput, TextureOutput};
use organic::{Mulberry32, Rng};
use serde_json::{Value, json};

pub fn walk_skeleton() -> Skeleton {
    let roles = [
        "hips",
        "spine",
        "leftUpperLeg",
        "leftLowerLeg",
        "leftFoot",
        "rightUpperLeg",
        "rightLowerLeg",
        "rightFoot",
    ];
    Skeleton {
        roles: roles.iter().map(|s| s.to_string()).collect(),
        parents: vec![-1, 0, 0, 2, 3, 0, 5, 6],
        rest: vec![
            [0.0, 0.88, 0.0],
            [0.0, 0.12, 0.0],
            [0.1, -0.05, 0.0],
            [0.0, -0.42, 0.0],
            [0.0, -0.38, 0.0],
            [-0.1, -0.05, 0.0],
            [0.0, -0.42, 0.0],
            [0.0, -0.38, 0.0],
        ],
    }
}

fn axis_x(a: f32) -> [f32; 4] {
    [(a / 2.0).sin(), 0.0, 0.0, (a / 2.0).cos()]
}

fn axis_y(a: f32) -> [f32; 4] {
    [0.0, (a / 2.0).sin(), 0.0, (a / 2.0).cos()]
}

/// Leg rotations for a stride phase: hip swing about x, knee flex while the
/// leg swings forward.
fn walk_frame(ph: f32, spine: f32, out: &mut Vec<f32>) {
    let leg = |p: f32| (axis_x(0.4 * p.sin()), axis_x(1.1 * p.sin().max(0.0)));
    let (lh, lk) = leg(ph);
    let (rh, rk) = leg(ph + core::f32::consts::PI);
    for q in [
        [0.0, 0.0, 0.0, 1.0],
        axis_y(spine),
        lh,
        lk,
        [0.0, 0.0, 0.0, 1.0],
        rh,
        rk,
        [0.0, 0.0, 0.0, 1.0],
    ] {
        out.extend_from_slice(&q);
    }
}

/// Three clips: a closed walk loop, a loop that stops three quarters of the
/// way round, and a one shot spine wave with seeded jitter.
pub fn synthetic_clips(seed: u32) -> BakeInput {
    let mut rng = Mulberry32::new(seed);
    let tau = core::f32::consts::TAU;
    let mut walk = Vec::new();
    let mut broken = Vec::new();
    let mut wave = Vec::new();
    let mut root = Vec::new();
    for f in 0..31 {
        let t = f as f32 / 30.0;
        walk_frame(tau * t, 0.1 * (tau * t).sin(), &mut walk);
        walk_frame(0.75 * tau * t, 0.0, &mut broken);
        root.extend_from_slice(&[0.0, 0.88 + 0.02 * (2.0 * tau * t).cos(), 1.2 * t]);
    }
    for f in 0..24 {
        let jitter = (rng.next_f64() as f32 - 0.5) * 0.05;
        walk_frame(0.0, 0.6 * (f as f32 / 23.0 * tau).sin() + jitter, &mut wave);
    }
    BakeInput {
        fps: 30.0,
        skeleton: walk_skeleton(),
        clips: vec![
            SourceClip {
                name: "walk".into(),
                looped: true,
                q: walk,
                p: root,
            },
            SourceClip {
                name: "broken_loop".into(),
                looped: true,
                q: broken,
                p: Vec::new(),
            },
            SourceClip {
                name: "wave".into(),
                looped: false,
                q: wave,
                p: Vec::new(),
            },
        ],
        contacts: Some(ContactRule {
            speed: 5.0,
            ..ContactRule::default()
        }),
        seam_limit_deg: None,
    }
}

/// A bumpy g by g grid written as an unindexed triangle soup (every
/// corner duplicated), plus a line mesh, an unused accessor and one
/// embedded image, the shapes an exporter like Meshy leaves behind.
pub fn synthetic_glb(seed: u32, g: usize) -> Vec<u8> {
    let mut rng = Mulberry32::new(seed);
    let h: Vec<f32> = (0..(g + 1) * (g + 1))
        .map(|_| rng.next_f64() as f32 * 0.05)
        .collect();
    let at = |x: usize, z: usize| [x as f32 / g as f32, h[z * (g + 1) + x], z as f32 / g as f32];
    let mut pos = Vec::new();
    let mut nrm = Vec::new();
    let mut uv = Vec::new();
    for z in 0..g {
        for x in 0..g {
            for (cx, cz) in [
                (x, z),
                (x, z + 1),
                (x + 1, z),
                (x + 1, z),
                (x, z + 1),
                (x + 1, z + 1),
            ] {
                pos.extend_from_slice(&at(cx, cz));
                nrm.extend_from_slice(&[0.0f32, 1.0, 0.0]);
                uv.extend_from_slice(&[cx as f32 / g as f32, cz as f32 / g as f32]);
            }
        }
    }
    let n = pos.len() / 3;
    let mut bin: Vec<u8> = Vec::new();
    let mut views = Vec::new();
    let mut push = |bytes: Vec<u8>, bin: &mut Vec<u8>| {
        while !bin.len().is_multiple_of(4) {
            bin.push(0);
        }
        views.push(json!({ "buffer": 0, "byteOffset": bin.len(), "byteLength": bytes.len() }));
        bin.extend_from_slice(&bytes);
        views.len() - 1
    };
    let f = |v: &[f32]| v.iter().flat_map(|x| x.to_le_bytes()).collect::<Vec<u8>>();
    let vp = push(f(&pos), &mut bin);
    let vn = push(f(&nrm), &mut bin);
    let vt = push(f(&uv), &mut bin);
    let vl = push(f(&[0.0, 0.0, 0.0, 1.0, 1.0, 1.0]), &mut bin);
    let vu = push(f(&[9.0; 12]), &mut bin);
    let mut png = vec![
        0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, b'I', b'H', b'D', b'R',
    ];
    png.extend_from_slice(&2048u32.to_be_bytes());
    png.extend_from_slice(&1024u32.to_be_bytes());
    png.extend_from_slice(&[0u8; 40]);
    let vi = push(png, &mut bin);
    let mut doc = empty_document();
    doc.insert("bufferViews".into(), Value::Array(views));
    doc.insert(
        "accessors".into(),
        json!([
            { "bufferView": vp, "componentType": 5126, "count": n, "type": "VEC3", "min": [0, 0, 0], "max": [1, 0.05, 1] },
            { "bufferView": vn, "componentType": 5126, "count": n, "type": "VEC3" },
            { "bufferView": vt, "componentType": 5126, "count": n, "type": "VEC2" },
            { "bufferView": vl, "componentType": 5126, "count": 2, "type": "VEC3", "min": [0, 0, 0], "max": [1, 1, 1] },
            { "bufferView": vu, "componentType": 5126, "count": 4, "type": "VEC3" }
        ]),
    );
    doc.insert(
        "meshes".into(),
        json!([
            { "primitives": [{ "attributes": { "POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2 }, "material": 0 }] },
            { "primitives": [{ "attributes": { "POSITION": 3 }, "mode": 1 }] }
        ]),
    );
    doc.insert(
        "images".into(),
        json!([{ "bufferView": vi, "mimeType": "image/png" }]),
    );
    doc.insert("textures".into(), json!([{ "source": 0 }]));
    doc.insert(
        "materials".into(),
        json!([{ "pbrMetallicRoughness": { "baseColorTexture": { "index": 0 } } }]),
    );
    doc.insert("nodes".into(), json!([{ "mesh": 0 }, { "mesh": 1 }]));
    doc.insert("scenes".into(), json!([{ "nodes": [0, 1] }]));
    doc.insert("scene".into(), json!(0));
    Glb {
        json: Value::Object(doc),
        bin,
    }
    .write()
}

/// Halves every embedded image's byte count, as a stand in for a resize.
pub struct HalfBytes;

impl TextureHook for HalfBytes {
    fn resize(&mut self, t: &TextureInput<'_>) -> Option<TextureOutput> {
        if t.max_size == 0 || t.size.is_some_and(|(w, h)| w.max(h) <= t.max_size) {
            return None;
        }
        Some(TextureOutput {
            bytes: t.bytes[..t.bytes.len() / 2].to_vec(),
            mime: "image/webp".into(),
        })
    }
}

fn hash_words(bytes: &[u8]) -> [f64; 2] {
    let h = sha256_hex(bytes);
    let w = |s: &str| u32::from_str_radix(s, 16).unwrap_or(0) as f64;
    [w(&h[0..8]), w(&h[8..16])]
}

/// Numbers both builds must agree on: pack bytes hash, report figures,
/// optimized GLB hash and counts at two simplification ratios.
pub fn trace(seed: u32) -> Vec<f64> {
    let mut out = Vec::new();
    let Ok((pack, reports)) = bake(&synthetic_clips(seed)) else {
        return out;
    };
    out.extend(hash_words(&encode(&pack)));
    for r in &reports {
        out.push(r.max_angle_error_deg as f64);
        out.push(r.max_position_error_m as f64);
        out.push(r.seam_angle_deg.unwrap_or(-1.0) as f64);
        out.extend(r.contact_frames.iter().map(|&c| c as f64));
    }
    let glb = synthetic_glb(seed, 12);
    for ratio in [1.0f32, 0.3] {
        let opts = OptimizeOptions {
            ratio,
            error: 0.05,
            lock_border: true,
            textures: crate::texture::TextureLimits {
                base_color: 1024,
                ..Default::default()
            },
        };
        let Ok((bytes, rep)) = optimize(&glb, &opts, &mut HalfBytes) else {
            return out;
        };
        out.extend(hash_words(&bytes));
        out.extend(
            [
                rep.bytes_out,
                rep.vertices_in,
                rep.vertices_out,
                rep.triangles_in,
                rep.triangles_out,
            ]
            .map(|v| v as f64),
        );
    }
    out
}

//! Malformed input returns an error and never panics: huge offsets,
//! counts and strides in the GLB JSON, chunk lengths past the file, and
//! byte level damage to a clip pack. Seeded, so a failure reproduces.

use bake::clip::{bake, decode, encode};
use bake::glb::{Glb, read_accessor};
use bake::golden::{synthetic_clips, synthetic_glb};
use bake::optimize::{OptimizeOptions, optimize};
use bake::texture::{KeepTextures, list_textures};
use organic::Mulberry32;
use serde_json::{Value, json};
use std::panic::{AssertUnwindSafe, catch_unwind};

const EDGES: [u64; 10] = [
    0,
    1,
    3,
    255,
    1 << 31,
    (1 << 32) - 1,
    1 << 32,
    1 << 53,
    1 << 62,
    u64::MAX,
];

fn no_panic(label: &str, bytes: &[u8]) {
    let r = catch_unwind(AssertUnwindSafe(|| {
        let _ = optimize(bytes, &OptimizeOptions::default(), &mut KeepTextures);
        let _ = list_textures(bytes);
        if let Ok(g) = Glb::parse(bytes) {
            for i in 0..g.array("accessors").len() {
                let _ = read_accessor(&g, i);
            }
        }
    }));
    assert!(r.is_ok(), "{label} panicked");
}

fn with(f: impl FnOnce(&mut Value)) -> Vec<u8> {
    let mut g = Glb::parse(&synthetic_glb(11, 4)).unwrap();
    f(&mut g.json);
    g.write()
}

#[test]
fn huge_offsets_and_counts_are_errors() {
    let cases: Vec<(&str, Vec<u8>)> = vec![
        (
            "view byteOffset",
            with(|j| j["bufferViews"][0]["byteOffset"] = json!(u64::MAX - 4)),
        ),
        (
            "view byteLength",
            with(|j| j["bufferViews"][0]["byteLength"] = json!(u64::MAX - 4)),
        ),
        (
            "accessor byteOffset",
            with(|j| j["accessors"][0]["byteOffset"] = json!(u64::MAX - 4)),
        ),
        (
            "accessor count",
            with(|j| j["accessors"][0]["count"] = json!(1u64 << 62)),
        ),
        (
            "view byteStride",
            with(|j| j["bufferViews"][0]["byteStride"] = json!(u64::MAX / 2)),
        ),
    ];
    for (label, bytes) in cases {
        no_panic(label, &bytes);
        let g = Glb::parse(&bytes).unwrap();
        assert!(read_accessor(&g, 0).is_err(), "{label} read");
    }
}

#[test]
fn chunk_lengths_past_the_file_are_errors() {
    let mut b = synthetic_glb(11, 2);
    b[12..16].copy_from_slice(&0xFFFF_FFF0u32.to_le_bytes());
    assert!(Glb::parse(&b).is_err());
    no_panic("json chunk length", &b);
}

#[test]
fn seeded_json_damage_never_panics() {
    let base = Glb::parse(&synthetic_glb(11, 4)).unwrap();
    let keys = [
        ("bufferViews", "byteOffset"),
        ("bufferViews", "byteLength"),
        ("bufferViews", "byteStride"),
        ("accessors", "byteOffset"),
        ("accessors", "count"),
        ("accessors", "bufferView"),
        ("accessors", "componentType"),
        ("images", "bufferView"),
    ];
    let mut r = Mulberry32::new(20_261_123);
    for n in 0..600 {
        let mut g = Glb {
            json: base.json.clone(),
            bin: base.bin.clone(),
        };
        for _ in 0..1 + r.next_u32() % 3 {
            let (arr, key) = keys[r.next_u32() as usize % keys.len()];
            let len = g.array(arr).len();
            if len == 0 {
                continue;
            }
            let i = r.next_u32() as usize % len;
            let v = EDGES[r.next_u32() as usize % EDGES.len()];
            g.json[arr][i][key] = json!(v);
        }
        no_panic(&format!("json case {n}"), &g.write());
    }
}

#[test]
fn seeded_byte_damage_never_panics() {
    let glb = synthetic_glb(11, 3);
    let (pack, _) = bake(&synthetic_clips(3)).unwrap();
    let packed = encode(&pack);
    let mut r = Mulberry32::new(7);
    for n in 0..400 {
        let mut g = glb.clone();
        let mut p = packed.clone();
        for _ in 0..1 + r.next_u32() % 4 {
            let i = r.next_u32() as usize % g.len();
            g[i] = r.next_u32() as u8;
            let k = r.next_u32() as usize % p.len();
            p[k] = r.next_u32() as u8;
        }
        no_panic(&format!("glb bytes {n}"), &g);
        let ok = catch_unwind(|| {
            let _ = decode(&p);
        });
        assert!(ok.is_ok(), "pack bytes {n} panicked");
    }
}

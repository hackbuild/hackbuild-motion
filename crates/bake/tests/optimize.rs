//! GLB optimize on synthetic grids: weld, simplify, cache order, pruning
//! and texture hooks.

use bake::glb::{Glb, f32s, read_accessor, read_indices};
use bake::golden::{HalfBytes, synthetic_glb};
use bake::optimize::{OptimizeOptions, optimize};
use bake::texture::{KeepTextures, TextureLimits, list_textures};
use serde_json::json;

fn triangles(glb: &[u8]) -> Vec<[[i64; 3]; 3]> {
    let g = Glb::parse(glb).unwrap();
    let prim = g.json["meshes"][0]["primitives"][0].clone();
    let pa = prim["attributes"]["POSITION"].as_u64().unwrap() as usize;
    let pos = f32s(&read_accessor(&g, pa).unwrap().data);
    let idx = read_indices(&g, &prim, pos.len() / 3).unwrap();
    let key = |i: u32| {
        let i = i as usize * 3;
        [
            (pos[i] * 1e5) as i64,
            (pos[i + 1] * 1e5) as i64,
            (pos[i + 2] * 1e5) as i64,
        ]
    };
    let mut out: Vec<[[i64; 3]; 3]> = idx
        .chunks(3)
        .map(|t| {
            let mut tri = [key(t[0]), key(t[1]), key(t[2])];
            // rotate so the smallest corner leads; keeps winding
            let m = (0..3).min_by_key(|&k| tri[k]).unwrap();
            tri.rotate_left(m);
            tri
        })
        .collect();
    out.sort();
    out
}

#[test]
fn weld_keeps_every_triangle_and_shares_corners() {
    let glb = synthetic_glb(11, 12);
    let (out, rep) = optimize(&glb, &OptimizeOptions::default(), &mut KeepTextures).unwrap();
    assert_eq!(rep.vertices_in, 12 * 12 * 6);
    assert_eq!(rep.vertices_out, 13 * 13);
    assert_eq!(rep.triangles_in, 288);
    assert_eq!(rep.triangles_out, 288);
    assert_eq!(triangles(&glb), triangles(&out));
    assert!(out.len() < glb.len() / 3, "{} vs {}", out.len(), glb.len());
    assert_eq!(rep.skipped.len(), 1, "{:?}", rep.skipped);
    assert!(rep.skipped[0].contains("mode 1"));
}

#[test]
fn unused_data_is_pruned_and_the_line_mesh_survives() {
    let glb = synthetic_glb(11, 6);
    let (out, _) = optimize(&glb, &OptimizeOptions::default(), &mut KeepTextures).unwrap();
    let g = Glb::parse(&out).unwrap();
    // three attributes, one index buffer, the line positions
    assert_eq!(g.array("accessors").len(), 5);
    let line = g.json["meshes"][1]["primitives"][0]["attributes"]["POSITION"]
        .as_u64()
        .unwrap() as usize;
    assert_eq!(
        f32s(&read_accessor(&g, line).unwrap().data),
        vec![0.0, 0.0, 0.0, 1.0, 1.0, 1.0]
    );
    let pa = g.json["meshes"][0]["primitives"][0]["attributes"]["POSITION"]
        .as_u64()
        .unwrap() as usize;
    let acc = &g.array("accessors")[pa];
    assert_eq!(acc["min"][0], json!(0.0));
    assert_eq!(acc["max"][2], json!(1.0));
    // the image passed through untouched
    let before = list_textures(&glb).unwrap();
    let after = list_textures(&out).unwrap();
    assert_eq!(before, after);
    assert_eq!(after[0].role.name(), "baseColor");
    assert_eq!(after[0].width, Some(2048));
}

#[test]
fn simplify_cuts_triangles_on_request() {
    let glb = synthetic_glb(5, 16);
    let opts = OptimizeOptions {
        ratio: 0.25,
        error: 0.2,
        ..Default::default()
    };
    let (out, rep) = optimize(&glb, &opts, &mut KeepTextures).unwrap();
    assert!(rep.triangles_out < rep.triangles_in / 2, "{rep:?}");
    assert!(rep.triangles_out > 0);
    Glb::parse(&out).unwrap();
}

#[test]
fn texture_hook_swaps_bytes_over_the_limit() {
    let glb = synthetic_glb(5, 4);
    let opts = OptimizeOptions {
        textures: TextureLimits {
            base_color: 1024,
            ..Default::default()
        },
        ..Default::default()
    };
    let (out, rep) = optimize(&glb, &opts, &mut HalfBytes).unwrap();
    assert_eq!(rep.textures.len(), 1);
    assert_eq!(rep.textures[0].role, "baseColor");
    assert_eq!(rep.textures[0].bytes_out, rep.textures[0].bytes_in / 2);
    let t = list_textures(&out).unwrap();
    assert_eq!(t[0].mime, "image/webp");
    // no limit set, nothing swapped
    let (_, rep) = optimize(&glb, &OptimizeOptions::default(), &mut HalfBytes).unwrap();
    assert!(rep.textures.is_empty());
}

#[test]
fn refuses_what_it_cannot_rewrite() {
    let glb = synthetic_glb(5, 2);
    let mut g = Glb::parse(&glb).unwrap();
    g.json["extensionsUsed"] = json!(["KHR_draco_mesh_compression"]);
    let e = optimize(&g.write(), &OptimizeOptions::default(), &mut KeepTextures).unwrap_err();
    assert!(e.0.contains("draco"), "{e}");
    assert!(Glb::parse(b"not a glb at all").is_err());
    let mut g = Glb::parse(&glb).unwrap();
    g.json["extensionsUsed"] = json!(["EXT_someone_else"]);
    let (_, rep) = optimize(&g.write(), &OptimizeOptions::default(), &mut KeepTextures).unwrap();
    assert!(rep.skipped.iter().any(|s| s.contains("unknown extension")));
}

#[test]
fn sparse_morph_targets_keep_their_views() {
    // a sparse morph target on the line mesh: two displaced vertices, its
    // index and value views placed after every other view
    let src = synthetic_glb(11, 6);
    let mut g = Glb::parse(&src).unwrap();
    while !g.bin.len().is_multiple_of(4) {
        g.bin.push(0);
    }
    let ioff = g.bin.len();
    g.bin.extend_from_slice(&1u32.to_le_bytes());
    let voff = g.bin.len();
    for f in [0.5f32, 0.25, 0.125] {
        g.bin.extend_from_slice(&f.to_le_bytes());
    }
    let nv = g.array("bufferViews").len();
    let na = g.array("accessors").len();
    let views = g.json["bufferViews"].as_array_mut().unwrap();
    views.push(json!({ "buffer": 0, "byteOffset": ioff, "byteLength": 4 }));
    views.push(json!({ "buffer": 0, "byteOffset": voff, "byteLength": 12 }));
    g.json["accessors"].as_array_mut().unwrap().push(json!({
        "componentType": 5126, "count": 2, "type": "VEC3",
        "min": [0.0, 0.0, 0.0], "max": [0.5, 0.25, 0.125],
        "sparse": {
            "count": 1,
            "indices": { "bufferView": nv, "componentType": 5125 },
            "values": { "bufferView": nv + 1 }
        }
    }));
    g.json["meshes"][1]["primitives"][0]["targets"] = json!([{ "POSITION": na }]);
    let glb = g.write();

    let (out, _) = optimize(&glb, &OptimizeOptions::default(), &mut KeepTextures).unwrap();
    let g = Glb::parse(&out).unwrap();
    let t = g.json["meshes"][1]["primitives"][0]["targets"][0]["POSITION"]
        .as_u64()
        .unwrap() as usize;
    let sparse = &g.array("accessors")[t]["sparse"];
    let iv = sparse["indices"]["bufferView"].as_u64().unwrap() as usize;
    let vv = sparse["values"]["bufferView"].as_u64().unwrap() as usize;
    assert_eq!(g.view_bytes(iv).unwrap(), &1u32.to_le_bytes());
    assert_eq!(f32s(g.view_bytes(vv).unwrap()), vec![0.5, 0.25, 0.125]);
}

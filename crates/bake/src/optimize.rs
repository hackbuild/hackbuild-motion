//! GLB optimize: per triangle primitive, weld identical vertices, simplify
//! when asked (the meshoptimizer quadric simplifier through the pure Rust
//! port meshopt-pure), reorder triangles for the post transform vertex
//! cache, reorder vertices by first use, then write tightly packed buffers
//! and drop the views and accessors nothing references any more. Textures
//! go through the caller's [`TextureHook`].

use crate::glb::{BakeError, Glb, Packed, err, f32s, read_accessor, read_indices, uint};
use crate::texture::{
    TextureHook, TextureInput, TextureLimits, TextureRole, image_roles, image_size,
};
use serde::Serialize;
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, BTreeSet, HashMap};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct OptimizeOptions {
    /// Share of triangles to keep, 0 to 1. 1 skips simplification.
    pub ratio: f32,
    /// Largest simplification error relative to the mesh extent.
    pub error: f32,
    /// Keep open borders fixed while simplifying (garment seams, split meshes).
    pub lock_border: bool,
    pub textures: TextureLimits,
}

impl Default for OptimizeOptions {
    fn default() -> Self {
        OptimizeOptions {
            ratio: 1.0,
            error: 0.01,
            lock_border: true,
            textures: TextureLimits::default(),
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextureChange {
    pub image: usize,
    pub role: String,
    pub bytes_in: usize,
    pub bytes_out: usize,
    pub mime: String,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeReport {
    pub bytes_in: usize,
    pub bytes_out: usize,
    pub vertices_in: usize,
    pub vertices_out: usize,
    pub triangles_in: usize,
    pub triangles_out: usize,
    pub primitives: usize,
    pub textures: Vec<TextureChange>,
    pub skipped: Vec<String>,
}

/// Extensions known to reference no accessors or buffer views beyond the
/// ones this module rewrites. With any other extension in use, unused data
/// is kept in place of pruned, which is larger but safe.
const SAFE_EXTENSIONS: &[&str] = &[
    "KHR_materials_",
    "KHR_texture_transform",
    "KHR_texture_basisu",
    "KHR_lights_punctual",
    "KHR_mesh_quantization",
    "KHR_animation_pointer",
    "KHR_materials_variants",
    "EXT_texture_webp",
    "EXT_texture_avif",
    "EXT_mesh_gpu_instancing",
    "VRMC_",
    "VRM",
];

fn extensions_safe(json: &Value) -> bool {
    json.get("extensionsUsed")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .all(|e| SAFE_EXTENSIONS.iter().any(|s| e.starts_with(s)))
        })
        .unwrap_or(true)
}

fn push_view(g: &mut Glb, bytes: &[u8], target: Option<u32>) -> usize {
    while !g.bin.len().is_multiple_of(4) {
        g.bin.push(0);
    }
    let off = g.bin.len();
    g.bin.extend_from_slice(bytes);
    let mut v = json!({ "buffer": 0, "byteOffset": off, "byteLength": bytes.len() });
    if let Some(t) = target {
        v["target"] = json!(t);
    }
    let views = g
        .json
        .as_object_mut()
        .map(|o| o.entry("bufferViews").or_insert_with(|| json!([])));
    match views.and_then(Value::as_array_mut) {
        Some(a) => {
            a.push(v);
            a.len() - 1
        }
        None => 0,
    }
}

fn push_accessor(g: &mut Glb, a: Value) -> usize {
    let list = g
        .json
        .as_object_mut()
        .map(|o| o.entry("accessors").or_insert_with(|| json!([])));
    match list.and_then(Value::as_array_mut) {
        Some(l) => {
            l.push(a);
            l.len() - 1
        }
        None => 0,
    }
}

/// Swaps image bytes through the hook. Returns the changes.
fn textures(
    g: &mut Glb,
    limits: &TextureLimits,
    hook: &mut dyn TextureHook,
) -> Result<Vec<TextureChange>, BakeError> {
    let roles = image_roles(&g.json);
    let mut changes = Vec::new();
    let count = g.array("images").len();
    for i in 0..count {
        let img = g.array("images")[i].clone();
        let Some(view) = img.get("bufferView").and_then(Value::as_u64) else {
            continue;
        };
        let bytes = g.view_bytes(view as usize)?.to_vec();
        let mime = img
            .get("mimeType")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let role = roles.get(&i).copied().unwrap_or(TextureRole::Other);
        let input = TextureInput {
            image: i,
            role,
            mime: &mime,
            bytes: &bytes,
            size: image_size(&bytes),
            max_size: limits.for_role(role),
        };
        let Some(out) = hook.resize(&input) else {
            continue;
        };
        let nv = push_view(g, &out.bytes, None);
        let images = g.json["images"].as_array_mut();
        if let Some(im) = images.and_then(|a| a.get_mut(i)) {
            im["bufferView"] = json!(nv);
            im["mimeType"] = json!(out.mime);
        }
        changes.push(TextureChange {
            image: i,
            role: role.name().to_string(),
            bytes_in: bytes.len(),
            bytes_out: out.bytes.len(),
            mime: out.mime,
        });
    }
    Ok(changes)
}

/// The per vertex accessors of a primitive: attributes, then morph target
/// attributes, each in key order.
fn vertex_accessors(prim: &Value) -> Vec<(Vec<String>, usize)> {
    let mut out = Vec::new();
    if let Some(attrs) = prim.get("attributes").and_then(Value::as_object) {
        for (k, v) in attrs {
            if let Some(i) = v.as_u64() {
                out.push((vec!["attributes".to_string(), k.clone()], i as usize));
            }
        }
    }
    if let Some(targets) = prim.get("targets").and_then(Value::as_array) {
        for (t, tv) in targets.iter().enumerate() {
            if let Some(o) = tv.as_object() {
                for (k, v) in o {
                    if let Some(i) = v.as_u64() {
                        out.push((
                            vec!["targets".to_string(), t.to_string(), k.clone()],
                            i as usize,
                        ));
                    }
                }
            }
        }
    }
    out
}

struct PrimResult {
    accessors: Vec<(Vec<String>, usize)>,
    indices: usize,
    vertices_in: usize,
    vertices_out: usize,
    triangles_in: usize,
    triangles_out: usize,
}

fn optimize_primitive(
    g: &mut Glb,
    prim: &Value,
    opts: &OptimizeOptions,
) -> Result<PrimResult, BakeError> {
    let list = vertex_accessors(prim);
    let Some(pos_slot) = list
        .iter()
        .position(|(k, _)| k.len() == 2 && k[1] == "POSITION")
    else {
        return err("no POSITION attribute");
    };
    let packed: Vec<Packed> = list
        .iter()
        .map(|(_, i)| read_accessor(g, *i))
        .collect::<Result<_, _>>()?;
    let n = packed[0].count;
    if packed.iter().any(|p| p.count != n) {
        return err("attribute counts differ");
    }
    if packed[pos_slot].component_type != 5126 || packed[pos_slot].kind != "VEC3" {
        return err("POSITION is quantized");
    }
    let indices = read_indices(g, prim, n)?;
    if indices.len() % 3 != 0 || indices.iter().any(|&i| i as usize >= n) {
        return err("index data is not a triangle list inside the vertex range");
    }
    let stride: usize = packed.iter().map(|p| p.elem).sum();
    let mut blob = vec![0u8; stride * n];
    let mut col = 0;
    for p in &packed {
        for v in 0..n {
            blob[v * stride + col..v * stride + col + p.elem]
                .copy_from_slice(&p.data[v * p.elem..(v + 1) * p.elem]);
        }
        col += p.elem;
    }

    // weld: identical bytes across every attribute become one vertex, in
    // first use order
    let mut seen: HashMap<&[u8], u32> = HashMap::new();
    let mut remap = vec![u32::MAX; n];
    let mut unique: Vec<usize> = Vec::new();
    for &i in &indices {
        let i = i as usize;
        if remap[i] != u32::MAX {
            continue;
        }
        let key = &blob[i * stride..(i + 1) * stride];
        let id = *seen.entry(key).or_insert_with(|| {
            unique.push(i);
            (unique.len() - 1) as u32
        });
        remap[i] = id;
    }
    let mut idx: Vec<u32> = indices.iter().map(|&i| remap[i as usize]).collect();
    let mut verts = vec![0u8; stride * unique.len()];
    for (k, &src) in unique.iter().enumerate() {
        verts[k * stride..(k + 1) * stride]
            .copy_from_slice(&blob[src * stride..(src + 1) * stride]);
    }
    let vcount = unique.len();
    let pos_col: usize = packed[..pos_slot].iter().map(|p| p.elem).sum();
    let positions: Vec<f32> = (0..vcount)
        .flat_map(|v| f32s(&verts[v * stride + pos_col..v * stride + pos_col + 12]))
        .collect();

    if opts.ratio < 1.0 && idx.len() >= 3 {
        let target = ((idx.len() as f32 * opts.ratio.max(0.0)) as usize) / 3 * 3;
        let flags = if opts.lock_border {
            meshoptimizer::SIMPLIFY_LOCK_BORDER
        } else {
            0
        };
        let mut dst = vec![0u32; idx.len()];
        let m = meshoptimizer::simplify(
            &mut dst,
            &idx,
            idx.len(),
            &positions,
            vcount,
            12,
            target,
            opts.error,
            flags,
            None,
        )
        .map_err(|e| BakeError(format!("simplify: {e}")))?;
        dst.truncate(m);
        idx = dst;
    }
    if !idx.is_empty() {
        let src = idx.clone();
        meshoptimizer::optimize_vertex_cache(&mut idx, &src, src.len(), vcount)
            .map_err(|e| BakeError(format!("vertex cache: {e}")))?;
    }

    // fetch order: vertices by first use; unused ones fall away
    let mut order = vec![u32::MAX; vcount];
    let mut used: Vec<usize> = Vec::new();
    for i in idx.iter_mut() {
        let v = *i as usize;
        if order[v] == u32::MAX {
            order[v] = used.len() as u32;
            used.push(v);
        }
        *i = order[v];
    }
    let out_n = used.len();

    let mut new_list = Vec::new();
    let mut col = 0;
    for ((key, old), p) in list.iter().zip(&packed) {
        let mut data = Vec::with_capacity(p.elem * out_n);
        for &v in &used {
            data.extend_from_slice(&verts[v * stride + col..v * stride + col + p.elem]);
        }
        col += p.elem;
        let view = push_view(g, &data, Some(34962));
        let mut a = g.array("accessors")[*old].clone();
        if let Some(o) = a.as_object_mut() {
            o.remove("byteOffset");
            o.insert("bufferView".into(), json!(view));
            o.insert("count".into(), json!(out_n));
            let is_position = key.last().is_some_and(|k| k == "POSITION");
            if is_position || o.contains_key("min") {
                if p.component_type == 5126 {
                    let (mn, mx) = min_max(&f32s(&data), p.elem / 4);
                    o.insert("min".into(), json!(mn));
                    o.insert("max".into(), json!(mx));
                } else {
                    o.remove("min");
                    o.remove("max");
                }
            }
        }
        new_list.push((key.clone(), push_accessor(g, a)));
    }
    let (ibytes, ct) = if out_n <= 65_535 {
        (
            idx.iter()
                .flat_map(|&i| (i as u16).to_le_bytes())
                .collect::<Vec<u8>>(),
            5123,
        )
    } else {
        (
            idx.iter()
                .flat_map(|&i| i.to_le_bytes())
                .collect::<Vec<u8>>(),
            5125,
        )
    };
    let iview = push_view(g, &ibytes, Some(34963));
    let iacc = push_accessor(
        g,
        json!({ "bufferView": iview, "componentType": ct, "count": idx.len(), "type": "SCALAR" }),
    );
    Ok(PrimResult {
        accessors: new_list,
        indices: iacc,
        vertices_in: n,
        vertices_out: out_n,
        triangles_in: indices.len() / 3,
        triangles_out: idx.len() / 3,
    })
}

fn min_max(v: &[f32], width: usize) -> (Vec<f32>, Vec<f32>) {
    let mut mn = vec![f32::INFINITY; width];
    let mut mx = vec![f32::NEG_INFINITY; width];
    for c in v.chunks_exact(width.max(1)) {
        for k in 0..width {
            mn[k] = mn[k].min(c[k]);
            mx[k] = mx[k].max(c[k]);
        }
    }
    if v.is_empty() {
        mn.fill(0.0);
        mx.fill(0.0);
    }
    (mn, mx)
}

fn set_path(prim: &mut Value, key: &[String], value: usize) {
    let mut cur = prim;
    for k in key {
        cur = match cur {
            Value::Array(a) => match k.parse::<usize>().ok().and_then(|i| a.get_mut(i)) {
                Some(v) => v,
                None => return,
            },
            Value::Object(o) => o.entry(k.clone()).or_insert(Value::Null),
            _ => return,
        };
    }
    *cur = json!(value);
}

/// Every accessor index the document references.
fn used_accessors(json: &Value) -> BTreeSet<usize> {
    let mut s = BTreeSet::new();
    let mut add = |v: Option<&Value>| {
        if let Some(i) = v.and_then(Value::as_u64) {
            s.insert(i as usize);
        }
    };
    for m in json
        .get("meshes")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
    {
        for p in m
            .get("primitives")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[])
        {
            add(p.get("indices"));
            for (_, i) in vertex_accessors(p) {
                add(Some(&json!(i)));
            }
        }
    }
    for sk in json
        .get("skins")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
    {
        add(sk.get("inverseBindMatrices"));
    }
    for an in json
        .get("animations")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
    {
        for sm in an
            .get("samplers")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[])
        {
            add(sm.get("input"));
            add(sm.get("output"));
        }
    }
    for nd in json
        .get("nodes")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
    {
        if let Some(a) = nd
            .pointer("/extensions/EXT_mesh_gpu_instancing/attributes")
            .and_then(Value::as_object)
        {
            for v in a.values() {
                add(Some(v));
            }
        }
    }
    s
}

fn remap_accessor_refs(json: &mut Value, map: &BTreeMap<usize, usize>) {
    let fix = |v: &mut Value| {
        if let Some(i) = v.as_u64()
            && let Some(n) = map.get(&(i as usize))
        {
            *v = json!(*n);
        }
    };
    if let Some(meshes) = json.get_mut("meshes").and_then(Value::as_array_mut) {
        for m in meshes {
            for p in m
                .get_mut("primitives")
                .and_then(Value::as_array_mut)
                .map(|a| a.iter_mut())
                .into_iter()
                .flatten()
            {
                if let Some(v) = p.get_mut("indices") {
                    fix(v);
                }
                if let Some(a) = p.get_mut("attributes").and_then(Value::as_object_mut) {
                    a.values_mut().for_each(fix);
                }
                for t in p
                    .get_mut("targets")
                    .and_then(Value::as_array_mut)
                    .map(|a| a.iter_mut())
                    .into_iter()
                    .flatten()
                {
                    if let Some(o) = t.as_object_mut() {
                        o.values_mut().for_each(fix);
                    }
                }
            }
        }
    }
    for sk in json
        .get_mut("skins")
        .and_then(Value::as_array_mut)
        .map(|a| a.iter_mut())
        .into_iter()
        .flatten()
    {
        if let Some(v) = sk.get_mut("inverseBindMatrices") {
            fix(v);
        }
    }
    for an in json
        .get_mut("animations")
        .and_then(Value::as_array_mut)
        .map(|a| a.iter_mut())
        .into_iter()
        .flatten()
    {
        for sm in an
            .get_mut("samplers")
            .and_then(Value::as_array_mut)
            .map(|a| a.iter_mut())
            .into_iter()
            .flatten()
        {
            if let Some(v) = sm.get_mut("input") {
                fix(v);
            }
            if let Some(v) = sm.get_mut("output") {
                fix(v);
            }
        }
    }
    for nd in json
        .get_mut("nodes")
        .and_then(Value::as_array_mut)
        .map(|a| a.iter_mut())
        .into_iter()
        .flatten()
    {
        if let Some(a) = nd
            .pointer_mut("/extensions/EXT_mesh_gpu_instancing/attributes")
            .and_then(Value::as_object_mut)
        {
            a.values_mut().for_each(fix);
        }
    }
}

/// Every place an accessor names a buffer view: its own data and, for a
/// sparse accessor (Blender writes shape keys this way), the sparse index
/// and value arrays.
const ACCESSOR_VIEWS: [&str; 3] = [
    "/bufferView",
    "/sparse/indices/bufferView",
    "/sparse/values/bufferView",
];

/// Drops accessors and buffer views nothing references, then rewrites the
/// binary chunk with only the views still in use.
fn compact(g: &mut Glb) {
    let used = used_accessors(&g.json);
    let accessors = g.array("accessors").to_vec();
    let mut amap = BTreeMap::new();
    let mut kept = Vec::new();
    for (i, a) in accessors.into_iter().enumerate() {
        if used.contains(&i) {
            amap.insert(i, kept.len());
            kept.push(a);
        }
    }
    remap_accessor_refs(&mut g.json, &amap);
    let mut views_used = BTreeSet::new();
    for a in &kept {
        for p in ACCESSOR_VIEWS {
            if let Some(v) = a.pointer(p).and_then(Value::as_u64) {
                views_used.insert(v as usize);
            }
        }
    }
    for im in g.array("images") {
        if let Some(v) = im.get("bufferView").and_then(Value::as_u64) {
            views_used.insert(v as usize);
        }
    }
    let views = g.array("bufferViews").to_vec();
    let mut vmap = BTreeMap::new();
    let mut new_views = Vec::new();
    let mut bin = Vec::new();
    for (i, mut v) in views.into_iter().enumerate() {
        if !views_used.contains(&i) {
            continue;
        }
        let off = uint(&v, "byteOffset", 0);
        let len = uint(&v, "byteLength", 0);
        while !bin.len().is_multiple_of(4) {
            bin.push(0);
        }
        let start = bin.len();
        let bytes = off.checked_add(len).and_then(|end| g.bin.get(off..end));
        bin.extend_from_slice(bytes.unwrap_or(&[]));
        v["byteOffset"] = json!(start);
        v["buffer"] = json!(0);
        vmap.insert(i, new_views.len());
        new_views.push(v);
    }
    for a in kept.iter_mut() {
        for p in ACCESSOR_VIEWS {
            if let Some(slot) = a.pointer_mut(p)
                && let Some(v) = slot.as_u64()
                && let Some(n) = vmap.get(&(v as usize))
            {
                *slot = json!(*n);
            }
        }
    }
    if let Some(o) = g.json.as_object_mut() {
        o.insert("accessors".into(), Value::Array(kept));
        o.insert("bufferViews".into(), Value::Array(new_views));
        if let Some(images) = o.get_mut("images").and_then(Value::as_array_mut) {
            for im in images {
                if let Some(v) = im.get("bufferView").and_then(Value::as_u64)
                    && let Some(n) = vmap.get(&(v as usize))
                {
                    im["bufferView"] = json!(*n);
                }
            }
        }
    }
    g.bin = bin;
}

/// Optimizes a GLB. Primitives that cannot be rewritten (points, lines,
/// strips, sparse or quantized positions) pass through and are listed in
/// the report with the reason.
pub fn optimize(
    glb: &[u8],
    opts: &OptimizeOptions,
    hook: &mut dyn TextureHook,
) -> Result<(Vec<u8>, OptimizeReport), BakeError> {
    let mut g = Glb::parse(glb)?;
    let mut report = OptimizeReport {
        bytes_in: glb.len(),
        ..Default::default()
    };
    report.textures = textures(&mut g, &opts.textures, hook)?;
    let meshes = g.array("meshes").to_vec();
    let mut new_meshes = Vec::with_capacity(meshes.len());
    for (mi, mut mesh) in meshes.into_iter().enumerate() {
        let prims = mesh
            .get("primitives")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut out = Vec::with_capacity(prims.len());
        for (pi, mut prim) in prims.into_iter().enumerate() {
            let mode = prim.get("mode").and_then(Value::as_u64).unwrap_or(4);
            if mode != 4 {
                report.skipped.push(format!(
                    "mesh {mi} primitive {pi}: mode {mode} is not a triangle list"
                ));
                out.push(prim);
                continue;
            }
            if prim.get("extensions").is_some() {
                report.skipped.push(format!(
                    "mesh {mi} primitive {pi}: primitive extensions are kept as they are"
                ));
                out.push(prim);
                continue;
            }
            match optimize_primitive(&mut g, &prim, opts) {
                Ok(r) => {
                    for (k, a) in &r.accessors {
                        set_path(&mut prim, k, *a);
                    }
                    prim["indices"] = json!(r.indices);
                    report.primitives += 1;
                    report.vertices_in += r.vertices_in;
                    report.vertices_out += r.vertices_out;
                    report.triangles_in += r.triangles_in;
                    report.triangles_out += r.triangles_out;
                }
                Err(e) => report
                    .skipped
                    .push(format!("mesh {mi} primitive {pi}: {e}")),
            }
            out.push(prim);
        }
        mesh["primitives"] = Value::Array(out);
        new_meshes.push(mesh);
    }
    if let Some(o) = g.json.as_object_mut()
        && !new_meshes.is_empty()
    {
        o.insert("meshes".into(), Value::Array(new_meshes));
    }
    if extensions_safe(&g.json) {
        compact(&mut g);
    } else {
        report
            .skipped
            .push("an unknown extension is in use. unused buffer data was kept".into());
    }
    let out = g.write();
    report.bytes_out = out.len();
    Ok((out, report))
}

/// A minimal valid document map, for callers that build GLBs in code.
pub fn empty_document() -> Map<String, Value> {
    let mut m = Map::new();
    m.insert(
        "asset".into(),
        json!({ "version": "2.0", "generator": "hackbuild-bake" }),
    );
    m
}

//! A minimal GLB container: one JSON chunk and one embedded BIN chunk.
//! Files with external buffers, several buffers, or compressed geometry
//! extensions are refused with a message that names the reason.

use serde_json::{Value, json};

const MAGIC: u32 = 0x4654_6C67; // "glTF"
const CHUNK_JSON: u32 = 0x4E4F_534A;
const CHUNK_BIN: u32 = 0x004E_4942;

#[derive(Debug)]
pub struct Glb {
    pub json: Value,
    pub bin: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BakeError(pub String);

impl core::fmt::Display for BakeError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for BakeError {}

pub fn err<T>(msg: impl Into<String>) -> Result<T, BakeError> {
    Err(BakeError(msg.into()))
}

fn u32_at(b: &[u8], at: usize) -> Result<u32, BakeError> {
    match b.get(at..at + 4) {
        Some(s) => Ok(u32::from_le_bytes([s[0], s[1], s[2], s[3]])),
        None => err("glb: file ends inside a header"),
    }
}

impl Glb {
    pub fn parse(bytes: &[u8]) -> Result<Glb, BakeError> {
        if u32_at(bytes, 0)? != MAGIC {
            return err("glb: no glTF magic. only binary .glb files are read");
        }
        if u32_at(bytes, 4)? != 2 {
            return err("glb: only glTF 2.0 is read");
        }
        let total = (u32_at(bytes, 8)? as usize).min(bytes.len());
        let mut at = 12;
        let mut json = None;
        let mut bin = Vec::new();
        while at + 8 <= total {
            let len = u32_at(bytes, at)? as usize;
            let kind = u32_at(bytes, at + 4)?;
            let body = match bytes.get(at + 8..at + 8 + len) {
                Some(b) => b,
                None => return err("glb: chunk runs past the end of the file"),
            };
            match kind {
                CHUNK_JSON => {
                    let text = core::str::from_utf8(body)
                        .map_err(|_| BakeError("glb: json chunk is not utf-8".into()))?;
                    json = Some(
                        serde_json::from_str::<Value>(text.trim_end_matches(['\0', ' '])).map_err(
                            |e| BakeError(format!("glb: json chunk does not parse: {e}")),
                        )?,
                    );
                }
                CHUNK_BIN if bin.is_empty() => bin = body.to_vec(),
                _ => {}
            }
            at += 8 + len;
        }
        let json = match json {
            Some(j) => j,
            None => return err("glb: no json chunk"),
        };
        let g = Glb { json, bin };
        g.check_buffers()?;
        Ok(g)
    }

    fn check_buffers(&self) -> Result<(), BakeError> {
        let buffers = self.json.get("buffers").and_then(Value::as_array);
        if let Some(b) = buffers {
            if b.len() > 1 {
                return err("glb: more than one buffer. merge buffers before baking");
            }
            if b.first().and_then(|x| x.get("uri")).is_some() {
                return err("glb: the buffer points at an external uri. embed it first");
            }
        }
        for ext in [
            "KHR_draco_mesh_compression",
            "EXT_meshopt_compression",
            "KHR_meshopt_compression",
        ] {
            let used = self
                .json
                .get("extensionsUsed")
                .and_then(Value::as_array)
                .is_some_and(|a| a.iter().any(|v| v == ext));
            if used {
                return err(format!(
                    "glb: {ext} geometry is compressed. decode it before baking"
                ));
            }
        }
        Ok(())
    }

    /// Writes the container. The JSON chunk is padded with spaces and the
    /// BIN chunk with zeros to 4 byte boundaries.
    pub fn write(&self) -> Vec<u8> {
        let mut json = self.json.clone();
        if !self.bin.is_empty() {
            json["buffers"] = json!([{ "byteLength": self.bin.len() }]);
        } else if let Some(o) = json.as_object_mut() {
            o.remove("buffers");
        }
        let mut text = serde_json::to_vec(&json).unwrap_or_default();
        while !text.len().is_multiple_of(4) {
            text.push(b' ');
        }
        let mut bin = self.bin.clone();
        while !bin.len().is_multiple_of(4) {
            bin.push(0);
        }
        let total = 12 + 8 + text.len() + if bin.is_empty() { 0 } else { 8 + bin.len() };
        let mut out = Vec::with_capacity(total);
        out.extend_from_slice(&MAGIC.to_le_bytes());
        out.extend_from_slice(&2u32.to_le_bytes());
        out.extend_from_slice(&(total as u32).to_le_bytes());
        out.extend_from_slice(&(text.len() as u32).to_le_bytes());
        out.extend_from_slice(&CHUNK_JSON.to_le_bytes());
        out.extend_from_slice(&text);
        if !bin.is_empty() {
            out.extend_from_slice(&(bin.len() as u32).to_le_bytes());
            out.extend_from_slice(&CHUNK_BIN.to_le_bytes());
            out.extend_from_slice(&bin);
        }
        out
    }

    pub fn array(&self, key: &str) -> &[Value] {
        self.json
            .get(key)
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    /// Bytes of a buffer view.
    pub fn view_bytes(&self, view: usize) -> Result<&[u8], BakeError> {
        let v = match self.array("bufferViews").get(view) {
            Some(v) => v,
            None => return err(format!("glb: buffer view {view} is missing")),
        };
        let off = uint(v, "byteOffset", 0);
        let len = uint(v, "byteLength", 0);
        match self.bin.get(off..off + len) {
            Some(b) => Ok(b),
            None => err(format!("glb: buffer view {view} runs past the buffer")),
        }
    }
}

pub fn uint(v: &Value, key: &str, default: usize) -> usize {
    v.get(key)
        .and_then(Value::as_u64)
        .map(|x| x as usize)
        .unwrap_or(default)
}

/// Byte size of one component of an accessor component type.
pub fn component_size(ct: u64) -> Option<usize> {
    match ct {
        5120 | 5121 => Some(1),
        5122 | 5123 => Some(2),
        5125 | 5126 => Some(4),
        _ => None,
    }
}

pub fn type_count(t: &str) -> Option<usize> {
    match t {
        "SCALAR" => Some(1),
        "VEC2" => Some(2),
        "VEC3" => Some(3),
        "VEC4" | "MAT2" => Some(4),
        "MAT3" => Some(9),
        "MAT4" => Some(16),
        _ => None,
    }
}

/// One accessor read into tightly packed element bytes.
#[derive(Clone, Debug)]
pub struct Packed {
    pub component_type: u64,
    pub kind: String,
    pub normalized: bool,
    pub count: usize,
    pub elem: usize,
    pub data: Vec<u8>,
}

/// Reads an accessor, honouring byteStride. Sparse accessors are refused.
pub fn read_accessor(g: &Glb, index: usize) -> Result<Packed, BakeError> {
    let a = match g.array("accessors").get(index) {
        Some(a) => a,
        None => return err(format!("glb: accessor {index} is missing")),
    };
    if a.get("sparse").is_some() {
        return err(format!("glb: accessor {index} is sparse"));
    }
    let ct = a.get("componentType").and_then(Value::as_u64).unwrap_or(0);
    let kind = a
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let (cs, tc) = match (component_size(ct), type_count(&kind)) {
        (Some(c), Some(t)) => (c, t),
        _ => return err(format!("glb: accessor {index} has an unknown layout")),
    };
    if tc > 4 {
        return err(format!("glb: accessor {index} is a matrix"));
    }
    let elem = cs * tc;
    let count = uint(a, "count", 0);
    let normalized = a
        .get("normalized")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let mut data = vec![0u8; elem * count];
    if let Some(view) = a.get("bufferView").and_then(Value::as_u64) {
        let view = view as usize;
        let bytes = g.view_bytes(view)?;
        let stride = g
            .array("bufferViews")
            .get(view)
            .map(|v| uint(v, "byteStride", 0))
            .unwrap_or(0);
        let stride = if stride == 0 { elem } else { stride };
        let base = uint(a, "byteOffset", 0);
        for i in 0..count {
            let s = base + i * stride;
            match bytes.get(s..s + elem) {
                Some(src) => data[i * elem..(i + 1) * elem].copy_from_slice(src),
                None => return err(format!("glb: accessor {index} runs past its buffer view")),
            }
        }
    }
    Ok(Packed {
        component_type: ct,
        kind,
        normalized,
        count,
        elem,
        data,
    })
}

/// Index data of a primitive as u32, or 0..n when the primitive has none.
pub fn read_indices(g: &Glb, prim: &Value, vertex_count: usize) -> Result<Vec<u32>, BakeError> {
    let Some(ix) = prim.get("indices").and_then(Value::as_u64) else {
        return Ok((0..vertex_count as u32).collect());
    };
    let p = read_accessor(g, ix as usize)?;
    let out = match p.component_type {
        5121 => p.data.iter().map(|&b| b as u32).collect(),
        5123 => p
            .data
            .as_chunks::<2>()
            .0
            .iter()
            .map(|c| u16::from_le_bytes(*c) as u32)
            .collect(),
        5125 => p
            .data
            .as_chunks::<4>()
            .0
            .iter()
            .map(|c| u32::from_le_bytes(*c))
            .collect(),
        _ => return err("glb: index accessor has a non integer type"),
    };
    Ok(out)
}

pub fn f32s(bytes: &[u8]) -> Vec<f32> {
    bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|c| f32::from_le_bytes(*c))
        .collect()
}

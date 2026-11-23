//! Texture hooks. The crate does no image decoding: the caller resizes or
//! re-encodes through [`TextureHook`] (a command in the CLI, an async
//! function in the TypeScript wrapper), and the optimizer swaps the bytes
//! into the GLB. With no hook, textures pass through untouched.

use crate::glb::{BakeError, Glb};
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TextureRole {
    BaseColor,
    Emissive,
    Normal,
    Orm,
    Other,
}

impl TextureRole {
    pub fn name(self) -> &'static str {
        match self {
            TextureRole::BaseColor => "baseColor",
            TextureRole::Emissive => "emissive",
            TextureRole::Normal => "normal",
            TextureRole::Orm => "orm",
            TextureRole::Other => "other",
        }
    }
    fn rank(self) -> u8 {
        match self {
            TextureRole::BaseColor => 0,
            TextureRole::Emissive => 1,
            TextureRole::Normal => 2,
            TextureRole::Orm => 3,
            TextureRole::Other => 4,
        }
    }
}

/// Longest side limits per role in pixels; 0 leaves the role alone.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TextureLimits {
    pub base_color: u32,
    pub emissive: u32,
    pub normal: u32,
    pub orm: u32,
    pub other: u32,
}

impl TextureLimits {
    pub fn for_role(&self, r: TextureRole) -> u32 {
        match r {
            TextureRole::BaseColor => self.base_color,
            TextureRole::Emissive => self.emissive,
            TextureRole::Normal => self.normal,
            TextureRole::Orm => self.orm,
            TextureRole::Other => self.other,
        }
    }
}

/// An embedded image as the hook sees it.
pub struct TextureInput<'a> {
    pub image: usize,
    pub role: TextureRole,
    pub mime: &'a str,
    pub bytes: &'a [u8],
    /// Width and height read from a PNG or JPEG header, when readable.
    pub size: Option<(u32, u32)>,
    /// The limit for this role, 0 when none was set.
    pub max_size: u32,
}

pub struct TextureOutput {
    pub bytes: Vec<u8>,
    pub mime: String,
}

pub trait TextureHook {
    fn resize(&mut self, t: &TextureInput<'_>) -> Option<TextureOutput>;
}

/// Leaves every texture as it is.
pub struct KeepTextures;

impl TextureHook for KeepTextures {
    fn resize(&mut self, _t: &TextureInput<'_>) -> Option<TextureOutput> {
        None
    }
}

/// Replacement bytes prepared ahead of time, keyed by image index. The
/// wasm build uses this: the TypeScript wrapper awaits its async hook for
/// each listed image, then passes the results in one call.
#[derive(Default)]
pub struct Replacements(pub BTreeMap<usize, TextureOutput>);

impl TextureHook for Replacements {
    fn resize(&mut self, t: &TextureInput<'_>) -> Option<TextureOutput> {
        self.0.remove(&t.image)
    }
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextureInfo {
    pub image: usize,
    pub role: TextureRole,
    pub mime: String,
    pub bytes: usize,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/// Role per image index, from the materials that sample it. An image used
/// in several roles takes the most visible one (base colour first).
pub fn image_roles(json: &Value) -> BTreeMap<usize, TextureRole> {
    let textures = json
        .get("textures")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut roles: BTreeMap<usize, TextureRole> = BTreeMap::new();
    let mut mark = |tex: Option<&Value>, role: TextureRole| {
        let Some(ti) = tex.and_then(|t| t.get("index")).and_then(Value::as_u64) else {
            return;
        };
        let Some(t) = textures.get(ti as usize) else {
            return;
        };
        let mut src = t.get("source").and_then(Value::as_u64);
        if let Some(ext) = t.get("extensions").and_then(Value::as_object) {
            for e in ext.values() {
                if let Some(s) = e.get("source").and_then(Value::as_u64) {
                    src = Some(s);
                }
            }
        }
        if let Some(s) = src {
            let s = s as usize;
            let keep = roles.get(&s).is_some_and(|old| old.rank() <= role.rank());
            if !keep {
                roles.insert(s, role);
            }
        }
    };
    for m in json
        .get("materials")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
    {
        let pbr = m.get("pbrMetallicRoughness");
        mark(
            pbr.and_then(|p| p.get("baseColorTexture")),
            TextureRole::BaseColor,
        );
        mark(
            pbr.and_then(|p| p.get("metallicRoughnessTexture")),
            TextureRole::Orm,
        );
        mark(m.get("normalTexture"), TextureRole::Normal);
        mark(m.get("occlusionTexture"), TextureRole::Orm);
        mark(m.get("emissiveTexture"), TextureRole::Emissive);
    }
    roles
}

/// Embedded images with their roles, for a caller that resizes ahead of
/// [`crate::optimize::optimize`].
pub fn list_textures(glb: &[u8]) -> Result<Vec<TextureInfo>, BakeError> {
    let g = Glb::parse(glb)?;
    let roles = image_roles(&g.json);
    let mut out = Vec::new();
    for (i, img) in g.array("images").iter().enumerate() {
        let Some(view) = img.get("bufferView").and_then(Value::as_u64) else {
            continue;
        };
        let bytes = g.view_bytes(view as usize)?;
        let size = image_size(bytes);
        out.push(TextureInfo {
            image: i,
            role: roles.get(&i).copied().unwrap_or(TextureRole::Other),
            mime: img
                .get("mimeType")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            bytes: bytes.len(),
            width: size.map(|s| s.0),
            height: size.map(|s| s.1),
        });
    }
    Ok(out)
}

/// Width and height from a PNG IHDR or a JPEG start of frame marker.
pub fn image_size(b: &[u8]) -> Option<(u32, u32)> {
    if b.len() >= 24 && b[..8] == [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A] {
        let w = u32::from_be_bytes([b[16], b[17], b[18], b[19]]);
        let h = u32::from_be_bytes([b[20], b[21], b[22], b[23]]);
        return Some((w, h));
    }
    if b.len() > 4 && b[0] == 0xFF && b[1] == 0xD8 {
        let mut i = 2;
        while i + 9 < b.len() {
            if b[i] != 0xFF {
                i += 1;
                continue;
            }
            let m = b[i + 1];
            let len = u16::from_be_bytes([b[i + 2], b[i + 3]]) as usize;
            let sof = matches!(m, 0xC0..=0xCF) && !matches!(m, 0xC4 | 0xC8 | 0xCC);
            if sof {
                let h = u16::from_be_bytes([b[i + 5], b[i + 6]]) as u32;
                let w = u16::from_be_bytes([b[i + 7], b[i + 8]]) as u32;
                return Some((w, h));
            }
            i += 2 + len;
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn png_and_jpeg_headers_give_sizes() {
        let mut png = vec![
            0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, b'I', b'H', b'D', b'R',
        ];
        png.extend_from_slice(&640u32.to_be_bytes());
        png.extend_from_slice(&480u32.to_be_bytes());
        assert_eq!(image_size(&png), Some((640, 480)));
        let jpg = [
            0xFF, 0xD8, 0xFF, 0xE0, 0, 4, 0, 0, 0xFF, 0xC0, 0, 17, 8, 0, 200, 1, 44, 3, 0, 0,
        ];
        assert_eq!(image_size(&jpg), Some((300, 200)));
        assert_eq!(image_size(b"RIFF....WEBP"), None);
    }
}

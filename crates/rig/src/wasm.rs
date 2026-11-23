//! wasm-bindgen surface.

use crate::bones::{ALL, HumanBone};
use crate::chain::limb_chains;
use crate::mapper::{RigMap, RigNode, map_rig};
use crate::reference::reference_rest;
use crate::rest::{RestReport, analyze_rest};
use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;
use organic::Vec3;
use wasm_bindgen::prelude::*;

fn nodes(names: Vec<String>, parents: &[i32]) -> Vec<RigNode> {
    names
        .into_iter()
        .enumerate()
        .map(|(i, name)| RigNode {
            name,
            parent: parents
                .get(i)
                .copied()
                .filter(|p| *p >= 0)
                .map(|p| p as usize),
        })
        .collect()
}

#[wasm_bindgen(js_name = boneNames)]
pub fn bone_names() -> Vec<String> {
    ALL.iter().map(|b| b.name().into()).collect()
}

#[wasm_bindgen(js_name = goldenTrace)]
pub fn golden_trace(seed: u32) -> Vec<f64> {
    crate::golden::trace(seed)
}

/// Reference humanoid joint positions, `x y z` per bone in `boneNames` order.
#[wasm_bindgen(js_name = referenceRest)]
pub fn reference_rest_js() -> Vec<f64> {
    reference_rest()
        .iter()
        .flat_map(|v| [v.x, v.y, v.z])
        .collect()
}

#[wasm_bindgen(js_name = RigMapResult)]
pub struct RigMapJs(RigMap);

#[wasm_bindgen(js_class = RigMapResult)]
impl RigMapJs {
    /// Bone index per node, -1 when unmapped.
    pub fn bones(&self) -> Vec<i32> {
        self.0
            .bones
            .iter()
            .map(|b| b.map_or(-1, |b| b.index() as i32))
            .collect()
    }
    #[wasm_bindgen(js_name = missingRequired)]
    pub fn missing_required(&self) -> Vec<u8> {
        self.0
            .missing_required
            .iter()
            .map(|b| b.index() as u8)
            .collect()
    }
    pub fn unmapped(&self) -> Vec<u32> {
        self.0.unmapped.iter().map(|i| *i as u32).collect()
    }
    pub fn helpers(&self) -> Vec<u32> {
        self.0.helpers.iter().map(|i| *i as u32).collect()
    }
    /// Pairs of node index and bone index.
    pub fn ambiguous(&self) -> Vec<u32> {
        self.0
            .ambiguous
            .iter()
            .flat_map(|(i, b)| [*i as u32, b.index() as u32])
            .collect()
    }
    /// Pairs of node index and bone index for MMD D deform bones.
    pub fn deform(&self) -> Vec<u32> {
        self.0
            .deform
            .iter()
            .flat_map(|(i, b)| [*i as u32, b.index() as u32])
            .collect()
    }
    pub fn dialect(&self) -> String {
        self.0.dialect.name().into()
    }
    pub fn coverage(&self) -> f64 {
        self.0.coverage()
    }
}

/// Maps bone names to humanoid bones. `parents[i]` is the parent index of
/// node `i`, or -1 for a root.
#[wasm_bindgen(js_name = mapRig)]
pub fn map_rig_js(names: Vec<String>, parents: &[i32]) -> RigMapJs {
    RigMapJs(map_rig(&nodes(names, parents)))
}

/// Limb chains as JSON: `[{name, region, side, bones, pole}]`. `positions`
/// holds rest world `x y z` per node, or is empty.
#[wasm_bindgen(js_name = limbChains)]
pub fn limb_chains_js(names: Vec<String>, parents: &[i32], positions: &[f64]) -> String {
    let ns = nodes(names, parents);
    let pos: Vec<Vec3> = positions
        .as_chunks::<3>()
        .0
        .iter()
        .map(|c| Vec3::from_slice(c))
        .collect();
    let rest = if pos.len() == ns.len() {
        Some(pos.as_slice())
    } else {
        None
    };
    let chains = limb_chains(&ns, rest);
    let items: Vec<String> = chains
        .iter()
        .map(|c| {
            let bones: Vec<String> = c.bones.iter().map(|b| format!("{b}")).collect();
            let side = match c.side {
                Some(crate::bones::Side::Left) => "\"left\"",
                Some(crate::bones::Side::Right) => "\"right\"",
                None => "null",
            };
            format!(
                "{{\"name\":\"{}\",\"region\":\"{:?}\",\"side\":{},\"bones\":[{}],\"pole\":[{:?},{:?},{:?}]}}",
                c.name,
                c.region,
                side,
                bones.join(","),
                c.pole.x,
                c.pole.y,
                c.pole.z
            )
        })
        .collect();
    format!("[{}]", items.join(","))
}

/// Rest analysis. `positions` holds `x y z` per humanoid bone in
/// `boneNames` order, NaN for a missing bone. Returns the flat report
/// (see `RestReport::to_flat`), or an empty array when the hips, head or
/// arms are missing.
#[wasm_bindgen(js_name = analyzeRest)]
pub fn analyze_rest_js(positions: &[f64]) -> Vec<f64> {
    let pos: Vec<Option<Vec3>> = (0..ALL.len())
        .map(|i| {
            let s = positions.get(i * 3..i * 3 + 3)?;
            if s.iter().all(|x| x.is_finite()) {
                Some(Vec3::from_slice(s))
            } else {
                None
            }
        })
        .collect();
    analyze_rest(&pos)
        .map(|r| r.to_flat().to_vec())
        .unwrap_or_default()
}

#[wasm_bindgen(js_name = restFlatLength)]
pub fn rest_flat_length() -> usize {
    RestReport::FLAT_LEN
}

#[wasm_bindgen(js_name = boneParent)]
pub fn bone_parent(i: usize) -> i32 {
    HumanBone::from_index(i)
        .and_then(|b| b.parent())
        .map_or(-1, |p| p.index() as i32)
}

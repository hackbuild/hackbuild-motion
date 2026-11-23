//! Named tensors. The caller reads a manifest (name, offset, count, shape,
//! dtype) and hands each tensor over; halves are widened to f32 once.

use alloc::collections::BTreeMap;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

#[derive(Clone, Debug, Default)]
pub struct Tensor {
    pub data: Vec<f32>,
    pub shape: Vec<usize>,
}

impl Tensor {
    pub fn len(&self) -> usize {
        self.data.len()
    }
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }
}

#[derive(Clone, Debug, Default)]
pub struct Store {
    map: BTreeMap<String, Tensor>,
}

impl Store {
    pub fn new() -> Self {
        Store::default()
    }
    pub fn insert_f32(&mut self, name: &str, data: Vec<f32>, shape: Vec<usize>) {
        self.map.insert(name.to_string(), Tensor { data, shape });
    }
    pub fn insert_f16(&mut self, name: &str, halves: &[u16], shape: Vec<usize>) {
        let mut data = alloc::vec![0.0f32; halves.len()];
        crate::half::decode(halves, &mut data);
        self.insert_f32(name, data, shape);
    }
    pub fn get(&self, name: &str) -> Option<&Tensor> {
        self.map.get(name)
    }
    /// Moves a tensor out, checking its element count.
    pub fn take(&mut self, name: &str, count: usize) -> Result<Vec<f32>, String> {
        let t = self
            .map
            .remove(name)
            .ok_or_else(|| alloc::format!("missing tensor {name}"))?;
        if t.data.len() != count {
            return Err(alloc::format!(
                "tensor {name} has {} values, expected {count}",
                t.data.len()
            ));
        }
        Ok(t.data)
    }
    pub fn names(&self) -> Vec<String> {
        self.map.keys().cloned().collect()
    }
    pub fn bytes(&self) -> usize {
        self.map.values().map(|t| t.data.len() * 4).sum()
    }
}

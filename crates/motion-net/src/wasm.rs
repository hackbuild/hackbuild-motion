//! wasm-bindgen surface. The TypeScript side reads the manifest, hands
//! each tensor over by name, then builds a model from the store.

use crate::codebook::{Codebook, CodebookDims};
use crate::kernels::{Accum, Activation};
use crate::mlp::Mlp;
use crate::store::Store;
use alloc::string::String;
use alloc::vec::Vec;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = goldenTrace)]
pub fn golden_trace(seed: u32) -> Vec<f64> {
    crate::golden::trace(seed)
}

#[wasm_bindgen(js_name = f16ToF32)]
pub fn f16_to_f32(h: &[u16]) -> Vec<f32> {
    let mut out = alloc::vec![0.0; h.len()];
    crate::half::decode(h, &mut out);
    out
}

const fn accum(f64_sums: bool) -> Accum {
    if f64_sums { Accum::F64 } else { Accum::F32 }
}

#[wasm_bindgen(js_name = TensorStore)]
pub struct StoreJs {
    store: Store,
}

#[wasm_bindgen(js_class = TensorStore)]
impl StoreJs {
    #[wasm_bindgen(constructor)]
    pub fn new() -> StoreJs {
        StoreJs {
            store: Store::new(),
        }
    }
    #[wasm_bindgen(js_name = addF32)]
    pub fn add_f32(&mut self, name: &str, data: Vec<f32>, shape: Vec<u32>) {
        self.store
            .insert_f32(name, data, shape.iter().map(|s| *s as usize).collect());
    }
    #[wasm_bindgen(js_name = addF16)]
    pub fn add_f16(&mut self, name: &str, halves: &[u16], shape: Vec<u32>) {
        self.store
            .insert_f16(name, halves, shape.iter().map(|s| *s as usize).collect());
    }
    pub fn bytes(&self) -> usize {
        self.store.bytes()
    }
}

impl Default for StoreJs {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen(js_name = CodebookNet)]
pub struct CodebookJs {
    net: Codebook,
}

#[wasm_bindgen(js_class = CodebookNet)]
impl CodebookJs {
    /// `dims`: input, latent, group, iterations, frames, output. Takes the
    /// tensors it needs out of the store.
    #[wasm_bindgen(constructor)]
    pub fn new(store: &mut StoreJs, dims: &[u32], f64_sums: bool) -> Result<CodebookJs, String> {
        if dims.len() != 6 {
            return Err(String::from("codebook: six dims"));
        }
        let d = CodebookDims {
            input: dims[0] as usize,
            latent: dims[1] as usize,
            group: dims[2] as usize,
            iterations: dims[3] as usize,
            frames: dims[4] as usize,
            output: dims[5] as usize,
        };
        Ok(CodebookJs {
            net: Codebook::from_store(&mut store.store, d, accum(f64_sums))?,
        })
    }
    pub fn run(&mut self, input: &[f32], frames: u32) -> Vec<f32> {
        self.net.run(input, frames as usize)
    }
    pub fn macs(&self, frames: u32) -> f64 {
        self.net.macs(frames as usize) as f64
    }
}

#[wasm_bindgen(js_name = MlpNet)]
pub struct MlpJs {
    net: Mlp,
}

#[wasm_bindgen(js_class = MlpNet)]
impl MlpJs {
    /// `acts` per layer: 0 none, 1 elu, 2 relu, 3 tanh.
    #[wasm_bindgen(constructor)]
    pub fn new(
        store: &mut StoreJs,
        prefix: &str,
        dims: &[u32],
        acts: &[u8],
        stats: bool,
        f64_sums: bool,
    ) -> Result<MlpJs, String> {
        let dims: Vec<usize> = dims.iter().map(|d| *d as usize).collect();
        let acts: Vec<Activation> = acts.iter().map(|a| Activation::from_code(*a)).collect();
        Ok(MlpJs {
            net: Mlp::from_store(
                &mut store.store,
                prefix,
                &dims,
                &acts,
                stats,
                accum(f64_sums),
            )?,
        })
    }
    pub fn run(&mut self, input: &[f32]) -> Vec<f32> {
        self.net.run(input)
    }
}

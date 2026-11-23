//! hackbuild-bake: GLB optimize with texture hooks, clip bake into compact
//! packs, and the assets.lock.json writer and checker. The library runs
//! natively (the `hackbuild-bake` command) and in wasm (the
//! `@hackbuild/bake` package) with the same results.

pub mod clip;
pub mod glb;
pub mod golden;
pub mod lock;
pub mod optimize;
pub mod texture;

#[cfg(feature = "wasm")]
pub mod wasm;

pub use clip::{BakeInput, ClipPack, ClipReport, bake, decode, encode};
pub use glb::{BakeError, Glb};
pub use lock::{AssetEntry, Lock, LockCheck, sha256_hex};
pub use optimize::{OptimizeOptions, OptimizeReport, optimize};
pub use texture::{
    KeepTextures, Replacements, TextureHook, TextureInput, TextureLimits, TextureOutput,
    TextureRole, list_textures,
};

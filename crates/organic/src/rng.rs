//! Seeded random numbers. Mulberry32 is small, fast and gives the same
//! stream in Rust, wasm and the TypeScript `seededRng`, bit for bit.

/// A source of uniform numbers in `[0, 1)`.
pub trait Rng {
    fn next_f64(&mut self) -> f64;
}

impl<F: FnMut() -> f64> Rng for F {
    fn next_f64(&mut self) -> f64 {
        self()
    }
}

#[derive(Clone, Debug)]
pub struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    pub fn new(seed: u32) -> Self {
        Mulberry32 { state: seed }
    }
    /// Seeded from a string through [`hash_seed`].
    pub fn from_str_seed(s: &str) -> Self {
        Mulberry32::new(hash_seed(s))
    }
    pub fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_add(0x6D2B_79F5);
        let a = self.state;
        let mut t = (a ^ (a >> 15)).wrapping_mul(1 | a);
        t = t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t)) ^ t;
        t ^ (t >> 14)
    }
    pub fn state(&self) -> u32 {
        self.state
    }
}

impl Rng for Mulberry32 {
    fn next_f64(&mut self) -> f64 {
        self.next_u32() as f64 / 4_294_967_296.0
    }
}

/// FNV-1a over the UTF-16 code units of `s`, so a JavaScript string hashes
/// to the same seed.
pub fn hash_seed(s: &str) -> u32 {
    let mut h: u32 = 2_166_136_261;
    for unit in s.encode_utf16() {
        h ^= unit as u32;
        h = h.wrapping_mul(16_777_619);
    }
    h
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_first_values() {
        // mulberry32(1) reference values, computed with the JavaScript original
        let mut r = Mulberry32::new(1);
        let a = r.next_u32();
        let b = r.next_u32();
        assert_eq!(a, 2_693_262_067);
        assert_eq!(b, 11_749_833);
    }

    #[test]
    fn uniform_range() {
        let mut r = Mulberry32::new(7);
        for _ in 0..10_000 {
            let x = r.next_f64();
            assert!((0.0..1.0).contains(&x));
        }
    }
}

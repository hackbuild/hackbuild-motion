//! The 32 bit linear congruential generator of the test vectors:
//! s = 1664525 s + 1013904223 mod 2^32, returning s / 2^32.

pub struct Lcg {
    pub state: u32,
}

impl Lcg {
    pub fn new(seed: u32) -> Self {
        Lcg { state: seed }
    }
    pub fn next_u32(&mut self) -> u32 {
        self.state = self
            .state
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        self.state
    }
    pub fn next_f64(&mut self) -> f64 {
        self.next_u32() as f64 / 4_294_967_296.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_one_matches_the_specification() {
        let mut r = Lcg::new(1);
        assert_eq!(r.next_f64(), 0.236_455_525_271_594_52);
        assert_eq!(r.next_f64(), 0.369_270_673_720_166_1);
        assert_eq!(r.next_f64(), 0.504_242_032_300_680_9);
    }
}

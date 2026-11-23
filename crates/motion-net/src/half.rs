//! Half float decoding. Every half value is exact in f32, so the table and
//! the bit math agree everywhere.

/// One IEEE 754 binary16 value, as its bits, to f32.
pub fn f16_to_f32(h: u16) -> f32 {
    let sign = ((h as u32) & 0x8000) << 16;
    let exp = ((h >> 10) & 0x1f) as u32;
    let man = (h & 0x3ff) as u32;
    let bits = if exp == 0 {
        if man == 0 {
            sign
        } else {
            // subnormal: shift the mantissa up until its leading one is implicit
            let mut e = 113u32;
            let mut m = man;
            while m & 0x400 == 0 {
                m <<= 1;
                e -= 1;
            }
            sign | (e << 23) | ((m & 0x3ff) << 13)
        }
    } else if exp == 31 {
        sign | 0x7f80_0000 | (man << 13)
    } else {
        sign | ((exp + 112) << 23) | (man << 13)
    };
    f32::from_bits(bits)
}

/// Decodes a run of halves.
pub fn decode(src: &[u16], out: &mut [f32]) {
    for (o, h) in out.iter_mut().zip(src) {
        *o = f16_to_f32(*h);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_values() {
        assert_eq!(f16_to_f32(0x3c00), 1.0);
        assert_eq!(f16_to_f32(0xc000), -2.0);
        assert_eq!(f16_to_f32(0x7bff), 65504.0);
        assert_eq!(f16_to_f32(0x0001), 2f32.powi(-24));
        assert_eq!(f16_to_f32(0x03ff), 1023.0 * 2f32.powi(-24));
        assert!(f16_to_f32(0x7c00).is_infinite());
        assert!(f16_to_f32(0x7e00).is_nan());
        assert_eq!(f16_to_f32(0x8000).to_bits(), 0x8000_0000);
    }

    #[test]
    fn matches_the_formula_for_every_finite_half() {
        for h in 0u16..=0xffff {
            let e = (h >> 10) & 0x1f;
            if e == 31 {
                continue;
            }
            let m = (h & 0x3ff) as f64;
            let s = if h & 0x8000 != 0 { -1.0 } else { 1.0 };
            let v = if e == 0 {
                s * m * 2f64.powi(-24)
            } else {
                s * (1.0 + m / 1024.0) * 2f64.powi(e as i32 - 15)
            };
            assert_eq!(f16_to_f32(h) as f64, v, "{h:#06x}");
        }
    }
}

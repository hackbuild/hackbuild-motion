//! IEEE 754 binary16 to binary32. Every binary16 value, subnormals
//! included, is exactly representable in binary32, so the conversion is
//! exact bit manipulation with no rounding.

pub fn f16_to_f32(h: u16) -> f32 {
    let sign = ((h >> 15) as u32) << 31;
    let exp = ((h >> 10) & 0x1f) as u32;
    let man = (h & 0x3ff) as u32;
    let bits = match exp {
        0 if man == 0 => sign,
        0 => {
            // subnormal: man * 2^-24. Shift the leading one up to the hidden
            // bit position, lowering the exponent once per shift.
            let mut e = 113u32;
            let mut m = man;
            while m & 0x400 == 0 {
                m <<= 1;
                e -= 1;
            }
            sign | (e << 23) | ((m & 0x3ff) << 13)
        }
        31 => sign | 0x7f80_0000 | (man << 13),
        _ => sign | ((exp + 112) << 23) | (man << 13),
    };
    f32::from_bits(bits)
}

/// Decodes little endian binary16 bytes into `out`.
pub fn decode_f16(bytes: &[u8], out: &mut [f32]) {
    for (o, b) in out.iter_mut().zip(bytes.as_chunks::<2>().0) {
        *o = f16_to_f32(u16::from_le_bytes(*b));
    }
}

/// Decodes little endian binary32 bytes into `out`.
pub fn decode_f32(bytes: &[u8], out: &mut [f32]) {
    for (o, b) in out.iter_mut().zip(bytes.as_chunks::<4>().0) {
        *o = f32::from_le_bytes(*b);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_values() {
        assert_eq!(f16_to_f32(0x0000).to_bits(), 0);
        assert_eq!(f16_to_f32(0x8000).to_bits(), 0x8000_0000);
        assert_eq!(f16_to_f32(0x3c00), 1.0);
        assert_eq!(f16_to_f32(0xc000), -2.0);
        assert_eq!(f16_to_f32(0x7bff), 65504.0);
        assert_eq!(f16_to_f32(0x0400), libm::powf(2.0, -14.0));
        assert_eq!(f16_to_f32(0x0001), libm::powf(2.0, -24.0));
        assert_eq!(f16_to_f32(0x03ff), 1023.0 * libm::powf(2.0, -24.0));
        assert_eq!(f16_to_f32(0x3555), 0.333_251_95);
        assert!(f16_to_f32(0x7c00).is_infinite());
        assert!(f16_to_f32(0x7e00).is_nan());
    }

    #[test]
    fn every_finite_pattern_round_trips_through_scaling() {
        // each finite binary16 value is k * 2^-24 for an integer k below 2^16 * 2^15
        for h in 0u16..0x7c00 {
            let v = f16_to_f32(h) as f64;
            let k = v * libm::pow(2.0, 24.0);
            assert_eq!(k, libm::floor(k), "pattern {h:#x}");
            assert_eq!(f16_to_f32(h | 0x8000), -(v as f32));
        }
    }
}

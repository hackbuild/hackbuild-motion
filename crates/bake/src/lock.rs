//! assets.lock.json: one entry per shipped asset with its source, licence,
//! SHA-256, size and an optional size budget. The checker recomputes the
//! hash and size of each file and fails on drift, a missing licence, a
//! licence the caller forbids, or a file past its budget.

use crate::glb::{BakeError, err};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssetEntry {
    pub path: String,
    pub source: String,
    pub licence: String,
    pub sha256: String,
    pub bytes: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub budget: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Lock {
    pub version: u32,
    pub assets: Vec<AssetEntry>,
}

impl Default for Lock {
    fn default() -> Self {
        Lock {
            version: 1,
            assets: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct LockCheck {
    pub ok: bool,
    pub failures: Vec<String>,
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let d = Sha256::digest(bytes);
    d.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn entry(
    path: &str,
    bytes: &[u8],
    source: &str,
    licence: &str,
    budget: Option<u64>,
) -> AssetEntry {
    AssetEntry {
        path: path.to_string(),
        source: source.to_string(),
        licence: licence.to_string(),
        sha256: sha256_hex(bytes),
        bytes: bytes.len() as u64,
        budget,
    }
}

impl Lock {
    pub fn parse(text: &str) -> Result<Lock, BakeError> {
        let l: Lock = serde_json::from_str(text)
            .map_err(|e| BakeError(format!("lock: does not parse: {e}")))?;
        if l.version != 1 {
            return err(format!("lock: version {} is unknown", l.version));
        }
        Ok(l)
    }

    /// Adds or replaces the entry with the same path.
    pub fn upsert(&mut self, e: AssetEntry) {
        match self.assets.iter_mut().find(|a| a.path == e.path) {
            Some(a) => *a = e,
            None => self.assets.push(e),
        }
    }

    /// Pretty JSON sorted by path, with a trailing newline, so diffs stay small.
    pub fn write(&self) -> String {
        let mut l = self.clone();
        l.assets.sort_by(|a, b| a.path.cmp(&b.path));
        let mut s = serde_json::to_string_pretty(&l).unwrap_or_default();
        s.push('\n');
        s
    }

    /// `read` returns a file's bytes by its lock path. `forbid` lists
    /// licence substrings that fail the check (for example "NC").
    pub fn check(
        &self,
        read: &mut dyn FnMut(&str) -> Option<Vec<u8>>,
        forbid: &[String],
    ) -> LockCheck {
        let mut failures = Vec::new();
        for a in &self.assets {
            if a.licence.trim().is_empty() {
                failures.push(format!("{}: no licence", a.path));
            }
            if a.source.trim().is_empty() {
                failures.push(format!("{}: no source", a.path));
            }
            if let Some(f) = forbid
                .iter()
                .find(|f| !f.is_empty() && a.licence.contains(f.as_str()))
            {
                failures.push(format!(
                    "{}: licence {} matches forbidden {}",
                    a.path, a.licence, f
                ));
            }
            let Some(bytes) = read(&a.path) else {
                failures.push(format!("{}: file is missing", a.path));
                continue;
            };
            if bytes.len() as u64 != a.bytes {
                failures.push(format!(
                    "{}: {} bytes, lock says {}",
                    a.path,
                    bytes.len(),
                    a.bytes
                ));
            }
            let h = sha256_hex(&bytes);
            if h != a.sha256 {
                failures.push(format!(
                    "{}: sha-256 {} differs from the lock",
                    a.path,
                    &h[..12]
                ));
            }
            if let Some(b) = a.budget
                && bytes.len() as u64 > b
            {
                failures.push(format!(
                    "{}: {} bytes is over its budget of {}",
                    a.path,
                    bytes.len(),
                    b
                ));
            }
        }
        LockCheck {
            ok: failures.is_empty(),
            failures,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_matches_the_standard_vector() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn check_finds_drift_budget_and_licence() {
        let mut l = Lock::default();
        l.upsert(entry("b.glb", b"hello", "UAL", "CC0-1.0", Some(10)));
        l.upsert(entry("a.bin", b"world", "net", "CC-BY-NC-4.0", None));
        l.upsert(entry(
            "b.glb",
            b"hello",
            "Quaternius UAL",
            "CC0-1.0",
            Some(10),
        ));
        let text = l.write();
        let back = Lock::parse(&text).unwrap();
        assert_eq!(back.assets[0].path, "a.bin");
        assert_eq!(back.assets[1].source, "Quaternius UAL");
        let ok = back.check(
            &mut |p| {
                Some(if p == "a.bin" {
                    b"world".to_vec()
                } else {
                    b"hello".to_vec()
                })
            },
            &[],
        );
        assert!(ok.ok, "{:?}", ok.failures);
        let bad = back.check(
            &mut |p| {
                if p == "a.bin" {
                    None
                } else {
                    Some(b"hello there".to_vec())
                }
            },
            &["NC".into()],
        );
        assert!(!bad.ok);
        let joined = bad.failures.join("\n");
        assert!(joined.contains("a.bin: file is missing"));
        assert!(joined.contains("forbidden NC"));
        assert!(joined.contains("over its budget"));
        assert!(joined.contains("differs from the lock"));
    }
}

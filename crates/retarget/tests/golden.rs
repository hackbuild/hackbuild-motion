//! The native build reproduces the committed golden trace bit for bit. The
//! TypeScript package runs the same trace through the wasm build and checks
//! it against the same file, so both builds agree.

use std::fs;
use std::path::PathBuf;

fn golden_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/golden.json")
}

fn render(values: &[f64]) -> String {
    let body: Vec<String> = values.iter().map(|v| format!("{v:?}")).collect();
    format!(
        "{{\n  \"seed\": 20261122,\n  \"values\": [\n    {}\n  ]\n}}\n",
        body.join(",\n    ")
    )
}

#[test]
fn native_matches_golden() {
    let values = retarget::golden::trace(20_261_122);
    let text = render(&values);
    if std::env::var("HB_REGEN_GOLDEN").is_ok() {
        fs::write(golden_path(), &text).unwrap();
    }
    let committed = fs::read_to_string(golden_path())
        .expect("tests/golden.json, run with HB_REGEN_GOLDEN=1 once");
    assert_eq!(committed, text);
}

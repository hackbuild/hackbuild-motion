//! The command line tool end to end in a temporary folder.

use std::path::PathBuf;
use std::process::Command;

fn bin() -> Command {
    Command::new(env!("CARGO_BIN_EXE_hackbuild-bake"))
}

fn scratch(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("hb-bake-cli-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

#[test]
fn optimize_lock_and_check() {
    let d = scratch("lock");
    std::fs::write(d.join("in.glb"), bake::golden::synthetic_glb(3, 8)).unwrap();
    let out = bin()
        .arg("optimize")
        .arg(d.join("in.glb"))
        .arg(d.join("out.glb"))
        .args(["--ratio", "0.5"])
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let report: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(report["verticesIn"], 384);
    let lock = d.join("assets.lock.json");
    let add = bin()
        .args(["lock", "add"])
        .arg(d.join("out.glb"))
        .args([
            "--source",
            "synthetic grid",
            "--licence",
            "CC0-1.0",
            "--as",
            "out.glb",
            "--budget",
            "100000",
            "--lock",
        ])
        .arg(&lock)
        .output()
        .unwrap();
    assert!(
        add.status.success(),
        "{}",
        String::from_utf8_lossy(&add.stderr)
    );
    let check = bin()
        .args(["lock", "check", "--lock"])
        .arg(&lock)
        .output()
        .unwrap();
    assert!(
        check.status.success(),
        "{}",
        String::from_utf8_lossy(&check.stderr)
    );
    std::fs::write(d.join("out.glb"), b"changed").unwrap();
    let check = bin()
        .args(["lock", "check", "--lock"])
        .arg(&lock)
        .output()
        .unwrap();
    assert!(!check.status.success());
    assert!(String::from_utf8_lossy(&check.stderr).contains("differs from the lock"));
    let _ = std::fs::remove_dir_all(&d);
}

#[test]
fn clips_write_a_pack_and_usage_exits_two() {
    let d = scratch("clips");
    let input = serde_json::to_string(&bake::golden::synthetic_clips(1)).unwrap();
    std::fs::write(d.join("clips.json"), input).unwrap();
    let out = bin()
        .arg("clips")
        .arg(d.join("clips.json"))
        .arg(d.join("pack.hbcp"))
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(String::from_utf8_lossy(&out.stderr).contains("seam"));
    let pack = bake::decode(&std::fs::read(d.join("pack.hbcp")).unwrap()).unwrap();
    assert_eq!(pack.clips.len(), 3);
    assert_eq!(bin().arg("nonsense").status().unwrap().code(), Some(2));
    let _ = std::fs::remove_dir_all(&d);
}

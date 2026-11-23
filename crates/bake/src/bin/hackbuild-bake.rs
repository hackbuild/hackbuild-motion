//! hackbuild-bake: the command line face of the bake crate.
//!
//!     hackbuild-bake optimize in.glb out.glb [--ratio 0.5] [--error 0.01]
//!         [--no-lock-border] [--texture-max baseColor=1024 ...]
//!         [--texture-hook ./resize.sh]
//!     hackbuild-bake textures in.glb
//!     hackbuild-bake clips clips.json out.hbcp [--report report.json]
//!     hackbuild-bake lock add file --source S --licence L [--budget BYTES]
//!         [--lock assets.lock.json] [--as path/in/lock]
//!     hackbuild-bake lock check [--lock assets.lock.json] [--forbid NC ...]
//!     hackbuild-bake hash file
//!
//! A texture hook is a program the caller names. It runs as
//! `hook <role> <max> <in> <out>`, writes the new image to `<out>` and
//! prints its mime type on stdout. No output, or a non zero exit, keeps
//! the original image. Without a hook textures are left untouched.

use bake::clip::BakeInput;
use bake::lock::{Lock, entry};
use bake::optimize::{OptimizeOptions, optimize};
use bake::texture::{KeepTextures, TextureHook, TextureInput, TextureOutput, list_textures};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

const USAGE: &str =
    "usage: hackbuild-bake optimize|textures|clips|lock add|lock check|hash. see the crate readme.";

struct CommandHook {
    program: String,
    dir: PathBuf,
    count: usize,
}

impl TextureHook for CommandHook {
    fn resize(&mut self, t: &TextureInput<'_>) -> Option<TextureOutput> {
        self.count += 1;
        let input = self
            .dir
            .join(format!("hb-bake-{}-{}-in", std::process::id(), self.count));
        let output = self
            .dir
            .join(format!("hb-bake-{}-{}-out", std::process::id(), self.count));
        std::fs::write(&input, t.bytes).ok()?;
        let run = Command::new(&self.program)
            .arg(t.role.name())
            .arg(t.max_size.to_string())
            .arg(&input)
            .arg(&output)
            .output();
        let _ = std::fs::remove_file(&input);
        let run = run.ok()?;
        let bytes = std::fs::read(&output).ok();
        let _ = std::fs::remove_file(&output);
        let mime = String::from_utf8_lossy(&run.stdout).trim().to_string();
        if !run.status.success() || mime.is_empty() {
            return None;
        }
        Some(TextureOutput {
            bytes: bytes?,
            mime,
        })
    }
}

/// Flags that take a value, and flags that stand alone. Anything else
/// starting with `--`, including the `--name=value` form, is an error.
const VALUE_FLAGS: [&str; 9] = [
    "--ratio",
    "--error",
    "--texture-max",
    "--texture-hook",
    "--report",
    "--source",
    "--licence",
    "--budget",
    "--lock",
];
const VALUE_FLAGS_MORE: [&str; 2] = ["--as", "--forbid"];
const BARE_FLAGS: [&str; 1] = ["--no-lock-border"];

fn check_flags(args: &[String]) -> Result<(), String> {
    let mut i = 0;
    while i < args.len() {
        let a = args[i].as_str();
        if a.starts_with("--") {
            if VALUE_FLAGS.contains(&a) || VALUE_FLAGS_MORE.contains(&a) {
                if args.get(i + 1).is_none() {
                    return Err(format!("{a} needs a value"));
                }
                i += 1;
            } else if !BARE_FLAGS.contains(&a) {
                return Err(format!("unknown flag {a}. write flags as --name value"));
            }
        }
        i += 1;
    }
    Ok(())
}

/// A private folder for texture hook files, made with create_dir so an
/// existing path (a planted symlink) is never reused.
fn private_dir() -> Result<PathBuf, String> {
    let base = std::env::temp_dir();
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    for k in 0..32u32 {
        let d = base.join(format!("hb-bake-{}-{t:x}-{k}", std::process::id()));
        if std::fs::create_dir(&d).is_ok() {
            return Ok(d);
        }
    }
    Err("cannot make a private temp folder for the texture hook".into())
}

/// Lock entry path of `file`: relative to the lock file's folder, with
/// `/` separators, so `lock check` finds it again from any working folder.
fn lock_name(file: &str, lock_path: &str) -> Result<String, String> {
    let f = std::fs::canonicalize(file).map_err(|e| format!("cannot read {file}: {e}"))?;
    let dir = Path::new(lock_path)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let dir =
        std::fs::canonicalize(dir).map_err(|e| format!("cannot read {}: {e}", dir.display()))?;
    let rel = f
        .strip_prefix(&dir)
        .map_err(|_| format!("{file} is outside the lock file's folder. name it with --as"))?;
    Ok(rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

fn flag<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1))
        .map(String::as_str)
}

fn flags<'a>(args: &'a [String], name: &str) -> Vec<&'a str> {
    args.windows(2)
        .filter(|w| w[0] == name)
        .map(|w| w[1].as_str())
        .collect()
}

fn positional(args: &[String]) -> Vec<&str> {
    let mut out = Vec::new();
    let mut skip = false;
    for a in args {
        if skip {
            skip = false;
            continue;
        }
        if a.starts_with("--") {
            skip = !matches!(a.as_str(), "--no-lock-border");
            continue;
        }
        out.push(a.as_str());
    }
    out
}

fn read(path: &str) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|e| format!("cannot read {path}: {e}"))
}

fn write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    std::fs::write(path, bytes).map_err(|e| format!("cannot write {}: {e}", path.display()))
}

fn run(args: &[String]) -> Result<(), String> {
    check_flags(args)?;
    let pos = positional(args);
    match pos.as_slice() {
        ["optimize", input, output] => {
            let mut opts = OptimizeOptions::default();
            if let Some(r) = flag(args, "--ratio") {
                opts.ratio = r
                    .parse()
                    .ok()
                    .filter(|x: &f32| (0.0..=1.0).contains(x))
                    .ok_or("--ratio takes a number from 0 to 1")?;
            }
            if let Some(e) = flag(args, "--error") {
                opts.error = e
                    .parse()
                    .ok()
                    .filter(|x: &f32| x.is_finite() && *x >= 0.0)
                    .ok_or("--error takes a number from 0 up")?;
            }
            let same = match (std::fs::canonicalize(input), std::fs::canonicalize(output)) {
                (Ok(a), Ok(b)) => a == b,
                _ => input == output,
            };
            if same {
                return Err("optimize would overwrite its input. name another output".into());
            }
            opts.lock_border = !args.iter().any(|a| a == "--no-lock-border");
            for t in flags(args, "--texture-max") {
                let (role, px) = t.split_once('=').ok_or("--texture-max takes role=pixels")?;
                let px: u32 = px
                    .parse()
                    .map_err(|_| "--texture-max pixels is not a number")?;
                match role {
                    "baseColor" => opts.textures.base_color = px,
                    "emissive" => opts.textures.emissive = px,
                    "normal" => opts.textures.normal = px,
                    "orm" => opts.textures.orm = px,
                    "other" => opts.textures.other = px,
                    _ => return Err(format!("unknown texture role {role}")),
                }
            }
            let glb = read(input)?;
            let result = match flag(args, "--texture-hook") {
                Some(p) => {
                    let mut cmd = CommandHook {
                        program: p.to_string(),
                        dir: private_dir()?,
                        count: 0,
                    };
                    let r = optimize(&glb, &opts, &mut cmd);
                    let _ = std::fs::remove_dir_all(&cmd.dir);
                    r
                }
                None => optimize(&glb, &opts, &mut KeepTextures),
            };
            let (bytes, report) = result.map_err(|e| e.0)?;
            write(Path::new(output), &bytes)?;
            println!(
                "{}",
                serde_json::to_string_pretty(&report).unwrap_or_default()
            );
            Ok(())
        }
        ["textures", input] => {
            let list = list_textures(&read(input)?).map_err(|e| e.0)?;
            println!(
                "{}",
                serde_json::to_string_pretty(&list).unwrap_or_default()
            );
            Ok(())
        }
        ["clips", input, output] => {
            let text = String::from_utf8(read(input)?).map_err(|_| "clip input is not utf-8")?;
            let bi: BakeInput = serde_json::from_str(&text)
                .map_err(|e| format!("clip input does not parse: {e}"))?;
            let (pack, reports) = bake::bake(&bi).map_err(|e| e.0)?;
            write(Path::new(output), &bake::encode(&pack))?;
            let rep = serde_json::to_string_pretty(&reports).unwrap_or_default();
            match flag(args, "--report") {
                Some(p) => write(Path::new(p), rep.as_bytes())?,
                None => println!("{rep}"),
            }
            if reports.iter().any(|r| r.seam_ok == Some(false)) {
                eprintln!("a loop clip has a seam over the limit. see seamOk in the report.");
            }
            Ok(())
        }
        ["lock", "add", file] => {
            let lock_path = flag(args, "--lock").unwrap_or("assets.lock.json");
            let source = flag(args, "--source").ok_or("lock add needs --source")?;
            let licence = flag(args, "--licence").ok_or("lock add needs --licence")?;
            let budget = match flag(args, "--budget") {
                Some(b) => Some(b.parse::<u64>().map_err(|_| "--budget takes bytes")?),
                None => None,
            };
            let mut lock = match std::fs::read_to_string(lock_path) {
                Ok(t) => Lock::parse(&t).map_err(|e| e.0)?,
                Err(_) => Lock::default(),
            };
            let name = match flag(args, "--as") {
                Some(n) => n.trim_start_matches("./").to_string(),
                None => lock_name(file, lock_path)?,
            };
            lock.upsert(entry(&name, &read(file)?, source, licence, budget));
            write(Path::new(lock_path), lock.write().as_bytes())
        }
        ["lock", "check"] => {
            let lock_path = flag(args, "--lock").unwrap_or("assets.lock.json");
            let text = std::fs::read_to_string(lock_path)
                .map_err(|e| format!("cannot read {lock_path}: {e}"))?;
            let lock = Lock::parse(&text).map_err(|e| e.0)?;
            let base = Path::new(lock_path)
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_default();
            let forbid: Vec<String> = flags(args, "--forbid")
                .into_iter()
                .map(String::from)
                .collect();
            let res = lock.check(&mut |p| std::fs::read(base.join(p)).ok(), &forbid);
            if res.ok {
                println!("{} assets match the lock", lock.assets.len());
                Ok(())
            } else {
                Err(res.failures.join("\n"))
            }
        }
        ["hash", file] => {
            println!("{}", bake::sha256_hex(&read(file)?));
            Ok(())
        }
        _ => Err(USAGE.to_string()),
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            if e == USAGE {
                ExitCode::from(2)
            } else {
                ExitCode::FAILURE
            }
        }
    }
}

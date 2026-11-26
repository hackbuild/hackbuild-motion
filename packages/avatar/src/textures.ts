// Lenient texture lookup for model packs whose texture references are
// wrong: backslash paths, any case, copy suffixes (`eyes.png.004`,
// `Torso.001`), generic words (texture, diffuse, albedo), and the model's
// own name as a prefix (`ModelName_Body_Texture.png` finds `body.png`).
// Files nearer the model win a tie. Words split on Unicode letters and
// digits, so Japanese and other non Latin names keep their key words. MMD
// sphere maps (`.spa`, `.sph`) are a lighting lookup and never match as a
// color. Plain strings, no three.js.

const IMAGE = /\.(png|jpe?g|webp|tga|bmp|gif|ktx2|dds|tiff?)$/i;
const GENERIC = new Set(["texture", "tex", "diffuse", "albedo", "basecolor", "base", "color", "colour", "col", "map", "diff", "d", "c", "img", "image"]);

/** MMD sphere maps: a lighting lookup, never a surface color. */
export const SPHERE_MAP = /\.(spa|sph)$/i;

const slash = (p: string) => p.replace(/\\/g, "/");
const baseName = (p: string) => slash(p).split("/").pop() ?? p;

/** File name with copy suffixes and the image extension removed, lowercase. */
export function cleanStem(p: string): string {
  let s = baseName(p).toLowerCase();
  for (let k = 0; k < 3; k++) {
    s = s.replace(/\.\d{3}$/, "");
    s = s.replace(IMAGE, "");
  }
  return s;
}

const words = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** One candidate file for a texture reference and how well it matched. */
export interface TextureMatch {
  file: string;
  /** 4 exact path, 3 same file name, 2 same cleaned stem, 1 same key words. */
  score: number;
}

/** Finds the dropped image file a model's texture reference means, by exact path, file name, cleaned stem or key words. */
export class TextureIndex {
  readonly files: string[];
  private readonly modelWords: string[];
  private readonly entries: { file: string; lower: string; name: string; stem: string; key: string; depth: number }[];

  /** `files` are paths relative to the model file; `modelName` its file name without extension. */
  constructor(files: readonly string[], modelName = "") {
    this.files = files.filter((f) => IMAGE.test(slash(f).replace(/(\.\d{3})+$/, "")));
    this.modelWords = words(modelName);
    this.entries = this.files.map((file) => {
      const lower = slash(file).toLowerCase().replace(/^\.\//, "");
      const stem = cleanStem(file);
      return { file, lower, name: baseName(lower), stem, key: this.key(stem), depth: lower.split("/").length - 1 };
    });
  }

  /** Key words of a stem: generic words and leading model name words dropped. */
  key(stem: string): string {
    let w = words(stem);
    let k = 0;
    while (k < this.modelWords.length && w[0] === this.modelWords[k]) {
      w = w.slice(1);
      k++;
    }
    w = w.filter((x) => !GENERIC.has(x));
    return w.join(" ");
  }

  /** The best file for a reference as written in the model, or null. */
  match(ref: string): TextureMatch | null {
    if (SPHERE_MAP.test(slash(ref).replace(/(\.\d{3})+$/, ""))) return null;
    const lower = slash(ref).toLowerCase().replace(/^\.\//, "");
    const name = baseName(lower);
    const stem = cleanStem(ref);
    const key = this.key(stem);
    let best: TextureMatch | null = null;
    let bestDepth = Infinity;
    for (const e of this.entries) {
      let score = 0;
      if (e.lower === lower || e.lower.endsWith("/" + lower)) score = 4;
      else if (e.name === name) score = 3;
      else if (e.stem === stem) score = 2;
      else if (key && e.key === key) score = 1;
      if (score === 0) continue;
      if (!best || score > best.score || (score === best.score && e.depth < bestDepth)) {
        best = { file: e.file, score };
        bestDepth = e.depth;
      }
    }
    return best;
  }

  forReference(ref: string): string | null {
    return this.match(ref)?.file ?? null;
  }
}

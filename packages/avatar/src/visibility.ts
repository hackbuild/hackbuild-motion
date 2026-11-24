// Meshes an FBX file stores switched off. FBXLoader shows every mesh, but
// a file can mark a model hidden with a Properties70 "Visibility" of 0 or a
// "Show" of false. Binary files store each property as length prefixed
// strings ("S", u32 length, bytes) followed by the typed value; ASCII files
// as P: "Visibility", "Visibility", "", "A",0. Plain bytes, no three.js.

const MODEL = "\u0000\u0001Model";

// the name sits right before "\0\1Model" in the same string property
function modelName(text: string, view: DataView, at: number): string | null {
  for (let len = 0; len < 256 && at - len - 5 >= 0; len++) {
    const start = at - len;
    if (view.getUint8(start - 5) === 0x53 && view.getUint32(start - 4, true) === len + MODEL.length) return text.slice(start, at);
  }
  return null;
}

function binaryHidden(body: string, view: DataView, offset: number): boolean {
  for (const prop of ["Visibility", "Show"]) {
    const key = `S${String.fromCharCode(prop.length, 0, 0, 0)}${prop}`;
    let i = body.indexOf(key);
    if (i < 0) continue;
    // skip the other three strings of the property record
    i += key.length;
    for (let s = 0; s < 3 && body[i] === "S"; s++) i += 5 + view.getUint32(offset + i + 1, true);
    const type = body[i];
    const v = offset + i + 1;
    if (v + 8 > view.byteLength && type === "D") continue;
    const value = type === "D" ? view.getFloat64(v, true) : type === "I" ? view.getInt32(v, true) : type === "C" ? view.getUint8(v) : 1;
    if (value === 0) return true;
  }
  return false;
}

/** Model names the file marks invisible, from binary or ASCII FBX bytes. */
export function hiddenInFile(bytes: Uint8Array | ArrayBuffer): Set<string> {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const text = new TextDecoder("latin1").decode(u8);
  const out = new Set<string>();
  if (text.startsWith("Kaydara FBX Binary")) {
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let at = text.indexOf(MODEL);
    while (at >= 0) {
      const next = text.indexOf(MODEL, at + MODEL.length);
      const name = modelName(text, view, at);
      const body = text.slice(at, next < 0 ? undefined : next);
      if (name && binaryHidden(body, view, at)) out.add(name);
      at = next;
    }
  } else {
    for (const m of text.matchAll(/Model: [^,]+, "Model::([^"]*)", "Mesh" \{([\s\S]*?)\n\t\}/g)) {
      if (/P: "(Visibility|Show)", "[^"]*", "[^"]*", "[^"]*",\s*0(?:\.0+)?\s*$/m.test(m[2]!)) out.add(m[1]!);
    }
  }
  return out;
}

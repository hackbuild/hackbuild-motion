// Reads a drag and drop into a flat file list, walking dropped folders and
// keeping each file's path relative to the drop, so a model finds the
// textures in the folders beside it.

/** The parts of FileSystemEntry the walk reads; tests pass plain objects. */
export interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  fullPath: string;
  file?(ok: (f: File) => void, fail?: (e: unknown) => void): void;
  createReader?(): { readEntries(ok: (batch: EntryLike[]) => void, fail?: (e: unknown) => void): void };
}

/** The parts of a DataTransfer that `filesFromDrop` reads: entries and files. */
export interface DropLike {
  items?: ArrayLike<{ webkitGetAsEntry?(): EntryLike | null }>;
  files?: ArrayLike<File>;
}

/** Every file under the entries, each with `webkitRelativePath` set from its place in the drop. */
export async function filesFromEntries(entries: readonly EntryLike[]): Promise<File[]> {
  const out: File[] = [];
  const readAll = (e: EntryLike): Promise<EntryLike[]> =>
    new Promise((ok, fail) => {
      const reader = e.createReader!();
      const acc: EntryLike[] = [];
      // readEntries hands out batches until an empty one
      const more = (): void =>
        reader.readEntries((batch) => {
          if (!batch.length) ok(acc);
          else {
            acc.push(...batch);
            more();
          }
        }, fail);
      more();
    });
  const visit = async (e: EntryLike): Promise<void> => {
    if (e.isFile && e.file) {
      const f = await new Promise<File>((ok, fail) => e.file!(ok, fail));
      Object.defineProperty(f, "webkitRelativePath", { value: e.fullPath.replace(/^\//, ""), configurable: true });
      out.push(f);
    } else if (e.isDirectory && e.createReader) {
      for (const child of await readAll(e)) await visit(child);
    }
  };
  for (const e of entries) await visit(e);
  return out;
}

/** The files of a drop; folders are walked when the browser gives entries. */
export async function droppedFiles(dt: DropLike): Promise<File[]> {
  const entries = Array.from(dt.items ?? [])
    .map((i) => i.webkitGetAsEntry?.() ?? null)
    .filter((e): e is EntryLike => !!e);
  if (!entries.some((e) => e.isDirectory)) return Array.from(dt.files ?? []);
  return filesFromEntries(entries);
}

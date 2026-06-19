// Collect all files from a DataTransfer, recursing into dropped folders
// via the webkitGetAsEntry API (supported in Chrome, Safari, Firefox, Edge).

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => {
    readEntries: (cb: (entries: FsEntry[]) => void, err?: (e: unknown) => void) => void;
  };
};

function readEntryFile(entry: FsEntry): Promise<File | null> {
  return new Promise((resolve) => {
    if (!entry.file) return resolve(null);
    entry.file((f) => resolve(f), () => resolve(null));
  });
}

function readDirEntries(entry: FsEntry): Promise<FsEntry[]> {
  return new Promise((resolve) => {
    const reader = entry.createReader?.();
    if (!reader) return resolve([]);
    const all: FsEntry[] = [];
    const read = () => {
      reader.readEntries(
        (entries) => {
          if (entries.length === 0) resolve(all);
          else { all.push(...entries); read(); }
        },
        () => resolve(all),
      );
    };
    read();
  });
}

async function walkEntry(entry: FsEntry, out: File[]) {
  if (entry.isFile) {
    const f = await readEntryFile(entry);
    if (f) out.push(f);
  } else if (entry.isDirectory) {
    const entries = await readDirEntries(entry);
    for (const child of entries) await walkEntry(child, out);
  }
}

export async function collectFilesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const items = dt.items;
  const out: File[] = [];
  if (items && items.length > 0) {
    const entries: FsEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry: FsEntry | null = (item as any).webkitGetAsEntry?.() ?? null;
      if (entry) entries.push(entry);
      else if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) out.push(f);
      }
    }
    for (const e of entries) await walkEntry(e, out);
    if (out.length) return out;
  }
  // Fallback: plain files
  return Array.from(dt.files ?? []);
}

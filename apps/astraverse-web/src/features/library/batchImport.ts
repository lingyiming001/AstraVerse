export type ImportOutcome = { name: string; ok: boolean; skipped?: boolean; messages: string[] };

/** Serialize large files and isolate failures so later selections still import. */
export async function importBatch<T extends { name: string }>(files: readonly T[], importOne: (file: T, report: (message: string) => void) => Promise<boolean | "skipped">, progress: (done: ImportOutcome[]) => void) {
  const outcomes: ImportOutcome[] = [];
  for (const file of files) {
    const messages: string[] = [];
    let ok = false, skipped = false;
    try { const result = await importOne(file, message => messages.push(message)); ok = result === true; skipped = result === "skipped"; }
    catch (error) { messages.push(error instanceof Error ? error.message : "文件导入失败"); }
    outcomes.push({ name: file.name, ok, skipped, messages });
    progress([...outcomes]);
  }
  return outcomes;
}

// Module: input -- reads `FILE.json | -` for `post`/`act`
// (kb/spec/cli-contract.md).
import * as fs from "node:fs/promises";

/** @returns the file's content, or stdin's if `pathOrDash` is exactly `-`. */
export async function readInput(pathOrDash: string): Promise<string> {
  if (pathOrDash === "-") return readStdin();
  return fs.readFile(pathOrDash, "utf8");
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

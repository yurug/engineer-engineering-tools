import { access, readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const rootMarkdown = (await readdir(".")).filter((name) => name.endsWith(".md"));
const files = [
  ...rootMarkdown,
  ...(await readdir("docs")).map((name) => `docs/${name}`),
];
const failures = [];
const linkPattern = /\[[^\]]*]\(([^)]+)\)/g;

for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(linkPattern)) {
    const target = match[1];
    if (
      target.startsWith("http:") ||
      target.startsWith("https:") ||
      target.startsWith("#") ||
      target.startsWith("mailto:")
    ) {
      continue;
    }
    const withoutFragment = target.split("#", 1)[0];
    if (!withoutFragment) continue;
    const path = resolve(dirname(file), decodeURIComponent(withoutFragment));
    try {
      await access(path);
    } catch {
      failures.push(`${file}: ${target}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Broken local documentation links:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`${files.length} user-facing Markdown files checked`);

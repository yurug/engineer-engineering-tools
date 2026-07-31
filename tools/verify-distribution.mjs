import { readFile, readdir } from "node:fs/promises";

const provenance = JSON.parse(await readFile("PROVENANCE.json", "utf8"));
const packageDirectories = (await readdir("packages", { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const declared = [...provenance.packages].sort();

const missing = declared.filter((name) => !packageDirectories.includes(name));
const undeclared = packageDirectories.filter((name) => !declared.includes(name));
const expectedSources = ["backbrief", "brief", "forebrief", "inbrief"];
const sources = Object.keys(provenance.publishedFrom).sort();
const skills = (await readdir("skills", { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const expectedSkills = ["backbrief", "forebrief", "inbrief"];

if (
  missing.length > 0 ||
  undeclared.length > 0 ||
  JSON.stringify(sources) !== JSON.stringify(expectedSources) ||
  JSON.stringify(skills) !== JSON.stringify(expectedSkills)
) {
  console.error(
    JSON.stringify(
      { missing, undeclared, expectedSources, sources, expectedSkills, skills },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(`${declared.length} declared packages and ${skills.length} agent skills are present`);

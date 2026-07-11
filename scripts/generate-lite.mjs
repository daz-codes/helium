import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HEADER = "// Generated from helium.js by scripts/generate-lite.mjs. Do not edit directly.\n";

// Semantic transforms applied after the @standard sections are stripped.
// Matching tolerates indentation, blank lines, trailing spaces, and line
// endings, so a transform only fails when its code genuinely changes.
const transforms = [
  [
    "export { defaultTeardown, disableDefault, registerSSE };",
    "export { defaultHelium as helium, defaultTeardown as heliumTeardown };",
  ],
  [
    "export function createHelium(options = {}) {\n  const engine = options.engine ?? defaultEngine;\n  const engineName = engine.diagnosticName || \"helium\";\n  const configuredRoot = options.root;",
    "function createHelium(configuredRoot) {\n  const engine = defaultEngine;\n  const engineName = \"lite\";",
  ],
  ["createHelium({ ...options, root: target })", "createHelium(target)"],
  ["(typeof configuredRoot === \"string\" ? document.querySelector(configuredRoot) : configuredRoot)", "configuredRoot"],
  ["if (!defaultDisabled && !defaultInitialized)", "if (!defaultInitialized)"],
];

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Compile a transform snippet to a regex that matches it regardless of
// indentation, blank lines, trailing spaces, or widened internal spacing.
const flexiblePattern = from => new RegExp(
  from.split("\n").map((line, index) => {
    const indent = line.match(/^[ \t]*/)[0];
    const body = escapeRegex(line.slice(indent.length)).replace(/[ \t]+/g, "[ \\t]+");
    return index === 0 && indent ? `[ \\t]+${body}` : body;
  }).join("[ \\t]*(?:\\n[ \\t]*)+"),
);

export function stripStandard(source) {
  let standardDepth = 0;
  const lines = source.split("\n").filter(line => {
    const marker = line.trim();
    if (marker === "// @standard-start") {
      standardDepth++;
      return false;
    }
    if (marker === "// @standard-end") {
      standardDepth--;
      if (standardDepth < 0) throw new Error("Unmatched @standard-end in helium.js");
      return false;
    }
    return standardDepth === 0;
  });
  if (standardDepth) throw new Error("Unclosed @standard-start in helium.js");
  return lines.join("\n");
}

export function generateLite(source) {
  let lite = stripStandard(source.replace(/\r\n?/g, "\n"));
  for (const [from, to] of transforms) {
    const pattern = flexiblePattern(from);
    if (!pattern.test(lite)) throw new Error(`Lite transform no longer matches: ${from.split("\n")[0].trim()}`);
    lite = lite.replace(pattern, () => to);
  }
  return `${HEADER}${lite}`;
}

export async function runGenerate() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const source = await readFile(resolve(root, "helium.js"), "utf8");
  await writeFile(resolve(root, "helium-lite.js"), generateLite(source));
  console.log("helium.js -> helium-lite.js");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runGenerate();
}

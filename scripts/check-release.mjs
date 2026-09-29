// Release guards that are easy to break without noticing:
// 1. Every production bundle stays within the documented browser floor.
// 2. Docs pin CDN and npm examples to the version in package.json.
import { readFile, readdir } from "node:fs/promises";
import { transformSync } from "esbuild";

// Keep in sync with "Browser support" in README.md.
const BROWSER_FLOOR = ["chrome92", "edge92", "firefox90", "safari15.4"];

// Built-ins newer than the floor. Syntax is checked by esbuild; these are
// runtime APIs it cannot see, so they are matched by name in the bundles.
const NEWER_APIS = [
  /\bstructuredClone\(/,
  /\bAbortSignal\.(?:any|timeout)\(/,
  /\bPromise\.withResolvers\(/,
  /\b(?:Object|Map)\.groupBy\(/,
  /\bArray\.fromAsync\(/,
  /\.(?:findLast|findLastIndex|toSorted|toReversed|toSpliced|requestSubmit|checkVisibility|isSubsetOf|isSupersetOf|symmetricDifference)\(/,
];

const DOCS = ["README.md", "LLM_GUIDE.md"];

const failures = [];
const { version } = JSON.parse(await readFile("package.json", "utf8"));

const bundles = (await readdir("dist")).filter(name => name.endsWith(".min.js"));
for (const name of bundles) {
  const source = await readFile(`dist/${name}`, "utf8");
  const reference = transformSync(source, { format: "esm", target: "esnext" }).code;
  const lowered = transformSync(source, { format: "esm", target: BROWSER_FLOOR }).code;
  if (lowered !== reference) {
    failures.push(`${name} uses syntax newer than ${BROWSER_FLOOR.join(", ")}`);
  }
  for (const api of NEWER_APIS) {
    const match = source.match(api);
    if (match) failures.push(`${name} uses ${match[0]} which is newer than the browser floor`);
  }
}

for (const doc of DOCS) {
  const text = await readFile(doc, "utf8");
  if (/cdn\.jsdelivr\.net\/gh\/daz-codes\/helium\//.test(text)) {
    failures.push(`${doc} has an unpinned GitHub CDN URL; use cdn.jsdelivr.net/npm/@daz4126/helium@${version}`);
  }
  for (const [, pinned] of text.matchAll(/@daz4126\/helium@([\w.-]+)/g)) {
    if (pinned !== version && pinned !== "next") {
      failures.push(`${doc} pins @daz4126/helium@${pinned}, but package.json is ${version}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Release checks passed: ${bundles.length} bundles within ${BROWSER_FLOOR.join(", ")}; docs pinned to ${version}.`);

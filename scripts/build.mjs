import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build as bundle } from "esbuild";
import { minify } from "terser";
import { runGenerate } from "./generate-lite.mjs";

await runGenerate();

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "dist");

// These names are private implementation fields. Restricting property mangling
// to this allow-list keeps public APIs, user state, DOM APIs, and custom engines stable.
const privateProperties = /^(observer|bindings|listeners|cleanups|processed|parentKeys|fnCache|proxyCache|root|cleanup|dependencies|initialExecution|classTokens|compiled|prop|calc|isHiddenAttr|keys|ok|result|receiver|handler|inits|parent|scopes|loop|owner|revision|singular|plural)$/;
const litePrivateProperties = /^(observer|bindings|listeners|cleanups|processed|parentKeys|fnCache|proxyCache|root|cleanup|dependencies|initialExecution|classTokens|compiled|prop|calc|isHiddenAttr|keys|ok|result|receiver|handler|inits|parent|el|refs|event|execute|getIds|revision|singular|plural)$/;

const entries = [
  ["helium.js", "helium.min.js", false, privateProperties],
  ["helium-lite.js", "helium-lite.min.js", false, litePrivateProperties],
  ["helium-sse.js", "helium-sse.min.js", true, privateProperties],
  ["helium-csp.js", "helium-csp.min.js", true, privateProperties],
  ["helium-csp-sse.js", "helium-csp-sse.min.js", true, privateProperties],
];

const terserOptions = privatePropertyNames => ({
  module: true,
  ecma: 2020,
  compress: { passes: 5 },
  mangle: { properties: { regex: privatePropertyNames } },
  format: { comments: false },
});

async function sourceFor(input, shouldBundle) {
  const inputPath = resolve(root, input);
  if (!shouldBundle) return readFile(inputPath, "utf8");

  const result = await bundle({
    absWorkingDir: root,
    entryPoints: [inputPath],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2020",
    treeShaking: true,
    legalComments: "none",
  });
  return result.outputFiles[0].text;
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const [input, output, shouldBundle, privatePropertyNames] of entries) {
  const result = await minify(await sourceFor(input, shouldBundle), terserOptions(privatePropertyNames));
  if (!result.code) throw new Error(`Terser produced no output for ${input}`);
  await writeFile(resolve(outDir, output), `${result.code}\n`);
  console.log(`${input} -> dist/${output}`);
}

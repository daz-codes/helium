import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const work = await mkdtemp(join(tmpdir(), "helium-package-"));
const npmOptions = cwd => ({ cwd, env: { ...process.env, npm_config_cache: join(work, ".npm") } });

try {
  const { stdout } = await exec("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", work], npmOptions(root));
  const [{ filename, files }] = JSON.parse(stdout);
  const names = new Set(files.map(file => file.path));
  const testFiles = files.filter(file => /(^|\/)\S+\.test\.[cm]?js$/.test(file.path));
  if (testFiles.length) {
    throw new Error(`Packed package contains test files: ${testFiles.map(file => file.path).join(", ")}`);
  }
  for (const required of [
    "helium.js", "helium.d.ts", "helium-lite.d.ts", "helium-sse.d.ts",
    "helium-turbo.js", "helium-turbo-adapter.js", "helium-turbo.d.ts", "helium-csp.d.ts",
    "helium-csp-turbo.d.ts", "helium-csp-sse.d.ts", "_types.d.ts",
    "dist/helium.min.js", "dist/helium-turbo.min.js",
  ]) {
    if (!names.has(required)) throw new Error(`Packed package is missing ${required}`);
  }

  const consumer = join(work, "consumer");
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), JSON.stringify({ type: "module", private: true }));
  await exec("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(work, filename)], npmOptions(consumer));
  await writeFile(join(consumer, "smoke.mjs"), `
    const entries = [
      "@daz4126/helium", "@daz4126/helium/lite", "@daz4126/helium/sse",
      "@daz4126/helium/turbo", "@daz4126/helium/turbo/sse",
      "@daz4126/helium/csp", "@daz4126/helium/csp/sse",
      "@daz4126/helium/csp/turbo", "@daz4126/helium/csp/turbo/sse",
      "@daz4126/helium/min", "@daz4126/helium/turbo/min",
    ];
    for (const entry of entries) {
      const module = await import(entry);
      if (typeof module.default !== "function") {
        throw new Error(entry + " did not resolve to a callable entry point");
      }
      if (!entry.includes("/lite") && typeof module.default.mount !== "function") {
        throw new Error(entry + " did not resolve to the public mount API");
      }
    }
  `);
  await exec(process.execPath, ["smoke.mjs"], { cwd: consumer });

  const installed = JSON.parse(await readFile(join(consumer, "node_modules/@daz4126/helium/package.json"), "utf8"));
  if (installed.version !== "1.0.0" && !installed.version.startsWith("1.0.0-")) {
    throw new Error(`Unexpected packed version ${installed.version}`);
  }
  console.log(`Packed consumer smoke test passed (${files.length} files).`);
} finally {
  await rm(work, { recursive: true, force: true });
}

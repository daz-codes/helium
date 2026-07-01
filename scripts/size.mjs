import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { constants, brotliCompressSync, gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const budgets = {
  "helium.min.js": 6000,
  "helium-lite.min.js": 3500,
  "helium-sse.min.js": 6500,
  "helium-csp.min.js": 10200,
  "helium-csp-sse.min.js": 10500,
};

const rows = [];
for (const [file, budget] of Object.entries(budgets)) {
  let source;
  try {
    source = await readFile(resolve(root, "dist", file));
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(`Missing dist/${file}; run npm run build first.`);
      process.exit(1);
    }
    throw error;
  }

  const gzip = gzipSync(source, { level: 9 }).byteLength;
  const brotli = brotliCompressSync(source, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).byteLength;
  rows.push({ file, raw: source.byteLength, gzip, brotli, budget, pass: gzip <= budget });
}

console.table(rows.map(({ file, raw, gzip, brotli, budget, pass }) => ({
  file,
  raw,
  gzip,
  brotli,
  "gzip budget": budget,
  status: pass ? "PASS" : "FAIL",
})));

const failures = rows.filter(row => !row.pass);
if (check && failures.length) {
  for (const row of failures) {
    console.error(`${row.file} is ${row.gzip - row.budget} bytes over its gzip budget.`);
  }
  process.exit(1);
}

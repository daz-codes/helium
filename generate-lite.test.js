import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateLite, stripStandard } from "./scripts/generate-lite.mjs";

const source = await readFile(resolve(process.cwd(), "helium.js"), "utf8");
const baseline = generateLite(source);

// Compare outputs ignoring indentation, blank lines, and trailing spaces —
// exactly the changes generation is expected to tolerate.
const normalize = code => code.split("\n").map(line => line.trim()).filter(Boolean).join("\n");

describe("generate-lite compiler boundary", () => {
  describe("output", () => {
    it("matches the committed helium-lite.js byte for byte", async () => {
      const committed = await readFile(resolve(process.cwd(), "helium-lite.js"), "utf8");
      expect(baseline).toBe(committed);
    });

    it("starts with the generated-file header", () => {
      expect(baseline.startsWith("// Generated from helium.js")).toBe(true);
    });

    it("removes every @standard section and marker", () => {
      expect(baseline).not.toContain("@standard-start");
      expect(baseline).not.toContain("@standard-end");
      expect(baseline).not.toContain("configuredSSE");
      expect(baseline).not.toContain("registerSSE");
    });

    it("applies every semantic transform", () => {
      expect(baseline).toContain("export { defaultHelium as helium, defaultTeardown as heliumTeardown };");
      expect(baseline).toContain("function createHelium(configuredRoot) {");
      expect(baseline).toContain("createHelium(target)");
      expect(baseline).not.toContain("options.engine");
      expect(baseline).not.toContain("defaultDisabled");
      expect(baseline).not.toContain("const scopesFor");
      expect(baseline).not.toContain("createLocalValues");
      expect(baseline).toContain('match(name, "scope")');
    });
  });

  describe("harmless whitespace changes", () => {
    it("tolerates extra indentation on every line", () => {
      const indented = source.split("\n").map(line => (line ? `  ${line}` : line)).join("\n");
      expect(normalize(generateLite(indented))).toBe(normalize(baseline));
    });

    it("tolerates tabs used for indentation", () => {
      const tabbed = source.split("\n").map(line => line.replace(/^ +/, spaces => "\t".repeat(Math.ceil(spaces.length / 2)))).join("\n");
      expect(normalize(generateLite(tabbed))).toBe(normalize(baseline));
    });

    it("tolerates blank lines inserted between every line", () => {
      const spaced = source.split("\n").join("\n\n");
      expect(normalize(generateLite(spaced))).toBe(normalize(baseline));
    });

    it("tolerates trailing whitespace on every line", () => {
      const trailing = source.split("\n").map(line => `${line}  `).join("\n");
      expect(normalize(generateLite(trailing))).toBe(normalize(baseline));
    });

    it("tolerates CRLF line endings and emits LF output", () => {
      expect(generateLite(source.replace(/\n/g, "\r\n"))).toBe(baseline);
    });

    it("tolerates widened spacing inside transformed lines", () => {
      const widened = source.replace(
        "export function createHelium(options = {}) {",
        "export function createHelium(options  =  {}) {",
      );
      expect(normalize(generateLite(widened))).toBe(normalize(baseline));
    });
  });

  describe("genuine semantic drift", () => {
    it("fails when a transform target is renamed", () => {
      const renamed = source.replace("export function createHelium(options = {})", "export function makeHelium(options = {})");
      expect(() => generateLite(renamed)).toThrow(/Lite transform no longer matches: export function createHelium/);
    });

    it("fails when an exported symbol changes", () => {
      const changed = source.replace("export { defaultTeardown, disableDefault, registerSSE };", "export { defaultTeardown, disableDefault };");
      expect(() => generateLite(changed)).toThrow(/Lite transform no longer matches: export \{ defaultTeardown/);
    });

    it("fails on an unclosed @standard-start", () => {
      const unclosed = source.replace("// @standard-end", "// no longer a marker");
      expect(() => generateLite(unclosed)).toThrow(/Unclosed @standard-start/);
    });

    it("fails on an unmatched @standard-end", () => {
      expect(() => generateLite(`// @standard-end\n${source}`)).toThrow(/Unmatched @standard-end/);
    });
  });

  describe("stripStandard", () => {
    it("removes marked sections and keeps surrounding code", () => {
      const stripped = stripStandard("keep\n// @standard-start\ndrop\n// @standard-end\nkeep too");
      expect(stripped).toBe("keep\nkeep too");
    });

    it("handles nested sections", () => {
      const stripped = stripStandard("a\n// @standard-start\nx\n// @standard-start\ny\n// @standard-end\nz\n// @standard-end\nb");
      expect(stripped).toBe("a\nb");
    });

    it("recognizes indented markers with trailing spaces", () => {
      const stripped = stripStandard("a\n      // @standard-start  \nx\n\t// @standard-end\t\nb");
      expect(stripped).toBe("a\nb");
    });
  });
});

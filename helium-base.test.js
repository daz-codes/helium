import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import helium, { heliumTeardown } from "./helium.js";
import * as standard from "./helium.js";

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe("Standard core without optional Turbo adapter", () => {
  let root;

  beforeEach(() => {
    root = document.createElement("main");
    root.setAttribute("data-helium", "");
    document.body.append(root);
  });

  afterEach(() => {
    heliumTeardown();
    delete globalThis.Turbo;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not react to Turbo navigation events", async () => {
    root.innerHTML = '<template @for="item in items" :key="item"><span @text="item"></span></template>';
    await helium({ items: [1, 2] });
    await tick();
    document.dispatchEvent(new Event("turbo:before-cache"));
    expect(root.querySelectorAll("span")).toHaveLength(2);
  });

  it("does not invoke Turbo morphing", async () => {
    const morphChildren = vi.fn();
    globalThis.Turbo = { morphChildren };
    root.innerHTML = '<div @html="content"></div>';
    await helium({ content: "<b>Native</b>" });
    expect(morphChildren).not.toHaveBeenCalled();
    expect(root.querySelector("b")?.textContent).toBe("Native");
  });

  it("does not advertise Turbo Stream responses", async () => {
    let accept;
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      accept = options.headers.Accept;
      return { ok: true, headers: { get: () => "text/html" }, text: async () => "Done" };
    }));
    root.innerHTML = '<button @get="/status" @target="#result"></button><p id="result"></p>';
    await helium();
    root.querySelector("button").click();
    await tick();
    expect(accept).not.toContain("turbo-stream");
  });

  it("does not expose compatibility-only aliases", async () => {
    root.innerHTML = '<section data-he="{ count: 10 }"><span @text="count"></span></section>';
    await helium({ count: 1 });
    expect(root.textContent).toBe("1");
    expect(standard.defaultTeardown).toBeUndefined();
  });
});

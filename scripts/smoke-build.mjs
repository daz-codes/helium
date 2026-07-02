import { JSDOM } from "jsdom";

const exposeDOM = html => {
  const dom = new JSDOM(html, { url: "http://localhost/" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    history: dom.window.history,
    localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage,
    MutationObserver: dom.window.MutationObserver,
    Node: dom.window.Node,
    FormData: dom.window.FormData,
    alert: dom.window.alert,
    confirm: dom.window.confirm,
    prompt: dom.window.prompt,
    atob: dom.window.atob,
    btoa: dom.window.btoa,
  });
  if (typeof navigator === "undefined") {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  }
  return dom;
};

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function smokeBinding(entry, teardown, supportsScope) {
  const dom = exposeDOM('<main data-helium><span @text="count"></span><input @bind.lazy.trim.number="count"><section @scope="{ count: 10 }"><button @click="count++"></button><b @text="count"></b></section></main>');
  const module = await import(`../dist/${entry}`);
  const state = await module.default({ count: 1 });
  const output = document.querySelector("span");
  if (output.textContent !== "1") throw new Error(`${entry} failed its initial binding`);
  state.count = 2;
  if (output.textContent !== "2") throw new Error(`${entry} failed its reactive update`);
  const input = document.querySelector("input");
  input.value = " 4 ";
  input.dispatchEvent(new window.Event("input"));
  if (state.count !== 2) throw new Error(`${entry} failed lazy binding`);
  input.dispatchEvent(new window.Event("change"));
  if (state.count !== 4) throw new Error(`${entry} failed trim/number binding`);
  document.querySelector("button").click();
  const expectedLocal = supportsScope ? "11" : "5";
  const expectedRoot = supportsScope ? 4 : 5;
  if (document.querySelector("b").textContent !== expectedLocal || state.count !== expectedRoot) {
    throw new Error(`${entry} failed its expected state-scope behavior`);
  }
  module[teardown]();

  const root = document.createElement("section");
  root.innerHTML = '<span @text="count"></span>';
  document.body.append(root);
  const mounted = await module.default.mount(root, { count: 3 });
  if (root.textContent !== "3") throw new Error(`${entry} failed its explicit mount`);
  mounted.unmount();
  mounted.unmount();
  dom.window.close();
}

async function smokeSSE(entry, teardown) {
  const dom = exposeDOM('<main data-helium><button @get="/events">Load</button><div id="result"></div></main>');
  const encoder = new TextEncoder();
  globalThis.fetch = async () => ({
    ok: true,
    headers: { get: () => "text/event-stream" },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("event: #result\ndata: Ready\n\n"));
        controller.close();
      },
    }),
  });

  const module = await import(`../dist/${entry}`);
  if (typeof module.default.mount !== "function") throw new Error(`${entry} does not export mount`);
  await module.default({});
  document.querySelector("button").dispatchEvent(new window.Event("click", { bubbles: true }));
  await tick();
  await tick();
  if (document.querySelector("#result").textContent !== "Ready") {
    throw new Error(`${entry} failed its SSE update`);
  }
  module[teardown]();
  dom.window.close();
}

async function smokeFor(entry) {
  const dom = exposeDOM(`
    <main>
      <template @for="item in items" :key="item.id">
        <span :data-id="item.id" @text="item.name"></span>
      </template>
    </main>
  `);
  const module = await import(`../dist/${entry}`);
  const root = document.querySelector("main");
  const app = await module.default.mount(root, {
    items: [{ id: 1, name: "One" }, { id: 2, name: "Two" }],
  });
  await tick();
  const first = root.querySelector('[data-id="1"]');
  app.state.items = [app.state.items[1], app.state.items[0]];
  if (root.querySelectorAll("span")[1] !== first) throw new Error(`${entry} lost keyed identity`);
  app.unmount();
  dom.window.close();
}

await smokeBinding("helium.min.js", "defaultTeardown", true);
await smokeBinding("helium-lite.min.js", "heliumTeardown", false);
await smokeBinding("helium-csp.min.js", "heliumTeardown", true);
await smokeFor("helium.min.js");
await smokeFor("helium-csp.min.js");
await smokeSSE("helium-sse.min.js", "defaultTeardown");
await smokeSSE("helium-csp-sse.min.js", "heliumTeardown");

console.log("All production bundles passed smoke tests.");

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

async function smokeBinding(entry, teardown, factory, supportsLocalData) {
  const localData = supportsLocalData ? ' @data="{ count: 10 }"' : "";
  const dom = exposeDOM(`<main data-helium><span @text="count"></span><input @bind.lazy.trim.number="count"><section${localData}><button @click="count++"></button><b @text="count"></b></section></main>`);
  const module = await import(`../dist/${entry}`);
  const state = await module.default({ count: 1 });
  const output = document.querySelector("span");
  if (output.textContent !== "1") throw new Error(`${entry} failed its initial binding`);
  state.count = 2;
  await tick();
  if (output.textContent !== "2") throw new Error(`${entry} failed its reactive update`);
  const input = document.querySelector("input");
  input.value = " 4 ";
  input.dispatchEvent(new window.Event("input"));
  if (state.count !== 2) throw new Error(`${entry} failed lazy binding`);
  input.dispatchEvent(new window.Event("change"));
  if (state.count !== 4) throw new Error(`${entry} failed trim/number binding`);
  document.querySelector("button").click();
  await tick();
  const expectedLocal = supportsLocalData ? "11" : "5";
  const expectedRoot = supportsLocalData ? 4 : 5;
  if (document.querySelector("b").textContent !== expectedLocal || state.count !== expectedRoot) {
    throw new Error(`${entry} failed its expected data-scope behavior`);
  }
  module[teardown]();

  if (!factory) {
    dom.window.close();
    return;
  }

  const lifecycleRoot = document.createElement("main");
  lifecycleRoot.setAttribute("data-he-init:root", "setupRoot($signal)");
  lifecycleRoot.innerHTML = '<div data-he-init:feature="setup($signal)"></div><button data-he-click="fail()"></button>';
  document.body.append(lifecycleRoot);
  const errors = [];
  let signal, rootSignal, cleaned = false, rootCleaned = false;
  const instance = module[factory]({
    root: lifecycleRoot,
    handleError: (error, context) => errors.push({ error, context }),
  });
  await instance.helium({
    setup: value => (signal = value, () => { cleaned = value.aborted; }),
    setupRoot: value => (rootSignal = value, () => { rootCleaned = value.aborted; }),
    fail: () => { throw new Error("event failed"); },
  });
  lifecycleRoot.querySelector("button").click();
  lifecycleRoot.querySelector("div").remove();
  await tick();
  if (!signal?.aborted || !cleaned) throw new Error(`${entry} failed initializer cancellation`);
  if (errors.length !== 1 || errors[0].context.phase !== "event"
    || errors[0].context.root !== lifecycleRoot || !errors[0].context.event) {
    throw new Error(`${entry} failed its public lifecycle error context`);
  }
  lifecycleRoot.remove();
  await tick();
  if (!rootSignal?.aborted || !rootCleaned) {
    throw new Error(`${entry} did not tear down a disconnected mounted root`);
  }
  instance.heliumTeardown();

  const root = document.createElement("section");
  root.innerHTML = '<span @text="count"></span>';
  document.body.append(root);
  const mounted = await module.default.mount(root, { count: 3 });
  if (root.textContent !== "3") throw new Error(`${entry} failed its explicit mount`);
  mounted.unmount();
  mounted.unmount();
  dom.window.close();
}

async function smokeImport(entry, factory) {
  const dom = exposeDOM("<main><section id='behavior'><button class='owned' data-he-ref='trigger'></button></section></main>");
  const module = await import(`../dist/${entry}`);
  const element = document.querySelector("#behavior");
  const one = new URL("../test-fixtures/import-behavior-one.js", import.meta.url).href;
  const two = new URL("../test-fixtures/import-behavior-two.js", import.meta.url).href;
  const contexts = new Map();
  const cleaned = [];
  const watched = [];
  const watchedRefs = [];
  globalThis.__heliumImportBehavior = (name, context) => {
    contexts.set(name, context);
    if (name === "one") {
      context.watch(data => data.watched, (value, previous) => watched.push([value, previous]));
      context.watch(() => context.refs.trigger, (value, previous) => watchedRefs.push([value, previous]));
    }
    return () => cleaned.push([name, context.signal.aborted]);
  };
  element.setAttribute("data-he-import", `${one},${two}`);
  const instance = module[factory]({ root: document.querySelector("main") });
  const state = await instance.helium({ watched: 0 });
  if (state.importedGreeting("Build") !== "Hello Build" || contexts.get("one")?.element !== element
    || contexts.get("one")?.refs.trigger[0] !== element.firstElementChild
    || contexts.get("one")?.query(".owned") !== element.firstElementChild) {
    throw new Error(`${entry} failed its lifecycle import public context`);
  }
  state.watched = 1;
  await tick();
  if (watched.length !== 1 || watched[0][0] !== 1 || watched[0][1] !== 0) {
    throw new Error(`${entry} failed lifecycle-bound watch with previous values`);
  }
  const addedRef = document.createElement("button");
  addedRef.setAttribute("data-he-ref", "trigger");
  element.append(addedRef);
  await tick();
  if (watchedRefs.length !== 1 || watchedRefs[0][0].length !== 2 || watchedRefs[0][1].length !== 1) {
    throw new Error(`${entry} failed observable behavior refs`);
  }
  element.setAttribute("data-he-import", two);
  await tick();
  if (cleaned.length !== 1 || cleaned[0][0] !== "one" || !cleaned[0][1]
    || contexts.get("two").signal.aborted) {
    throw new Error(`${entry} did not reconcile imported behaviors independently`);
  }
  state.watched = 2;
  const staleRef = document.createElement("button");
  staleRef.setAttribute("data-he-ref", "trigger");
  element.append(staleRef);
  await tick();
  if (watched.length !== 1) throw new Error(`${entry} retained a stopped behavior watcher`);
  if (watchedRefs.length !== 1) throw new Error(`${entry} retained a stopped ref watcher`);
  instance.heliumTeardown();
  if (cleaned.length !== 2 || cleaned[1][0] !== "two" || !cleaned[1][1]) {
    throw new Error(`${entry} did not clean up its remaining imported behavior`);
  }
  delete globalThis.__heliumImportBehavior;
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
  await tick();
  if (root.querySelectorAll("span")[1] !== first) throw new Error(`${entry} lost keyed identity`);
  app.unmount();
  dom.window.close();
}

await smokeBinding("helium.min.js", "heliumTeardown", "createHelium", true);
await smokeBinding("helium-lite.min.js", "heliumTeardown", null, false);
await smokeBinding("helium-csp.min.js", "heliumTeardown", "createCSPHelium", true);
await smokeFor("helium.min.js");
await smokeFor("helium-csp.min.js");
await smokeImport("helium.min.js", "createHelium");
await smokeImport("helium-csp.min.js", "createCSPHelium");
await smokeSSE("helium-sse.min.js", "heliumTeardown");
await smokeSSE("helium-csp-sse.min.js", "heliumTeardown");

console.log("All production bundles passed smoke tests.");

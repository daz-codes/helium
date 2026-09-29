import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function staticPath(pathname) {
  const path = resolve(root, pathname.replace(/^\/+/, ""));
  if (path !== root && !path.startsWith(root + sep)) return null;
  return path;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/" || url.pathname === "/blank.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<!doctype html><meta charset='utf-8'><title>Helium browser smoke</title>");
      return;
    }
    if (url.pathname === "/importmap.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><meta charset='utf-8'><title>Helium import map smoke</title>
<script type="importmap">{ "imports": { "pinned-helpers": "/helpers.js?digest=abc123" } }</script>`);
      return;
    }
    if (url.pathname === "/csp.html") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self'",
      });
      res.end("<!doctype html><meta charset='utf-8'><title>Helium CSP smoke</title>");
      return;
    }
    if (url.pathname === "/helpers.js") {
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      res.end("export const greet = name => `Hello ${name}`;\n");
      return;
    }
    if (url.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("event: #result\n");
      res.write("data: Streamed\n\n");
      res.end();
      return;
    }
    if (url.pathname === "/turbo/cache-a" || url.pathname === "/turbo/cache-b") {
      const entry = url.searchParams.get("entry") === "csp" ? "csp" : "default";
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(cachePage(entry, url.pathname.endsWith("cache-b") ? "b" : "a"));
      return;
    }
    if (url.pathname === "/turbo/morph") {
      const token = url.searchParams.get("token") || "default";
      const version = (turboMorphRequests.get(token) || 0) + 1;
      turboMorphRequests.set(token, version);
      const items = version === 1
        ? "[{ id: 1, name: 'One' }, { id: 2, name: 'Two' }]"
        : "[{ id: 2, name: 'Two updated' }, { id: 3, name: 'Three' }]";
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(turboDocument({ title: `Morph ${version}`, refresh: true, body: `
        <main id="morph-page" data-helium data-he-data="{ items: ${items}, version: ${version} }" data-he-init:turbo="trackTurboLifecycle($signal)">
          <span id="morph-version" data-he-text="version"></span>
          <template data-he-for="item in items" :key="item.id">
            <span class="morph-row" data-he-attr:data-id="item.id" data-he-text="item.name"></span>
          </template>
          <section data-he-data="{ count: 0, open: false, draft: '' }">
            <button id="morph-inc" data-he-click="count++">Increment</button>
            <span id="morph-count" data-he-text="count"></span>
            <button id="morph-toggle" data-he-click="open = !open">Toggle</button>
            <div id="morph-menu" data-he-visible="open">Menu</div>
            <input id="morph-draft" data-he-bind="draft">
            <span id="morph-static" data-he-text="'static'"></span>
          </section>
        </main>` }));
      return;
    }
    if (url.pathname === "/turbo/features") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(turboDocument({ title: "Frames and streams", body: `
        <main data-helium data-he-data="{ html: '<span id=&quot;morph-child&quot;>One</span>' }">
          <turbo-frame id="feature-frame">
            <a id="load-frame" href="/turbo/frame" data-turbo-frame="feature-frame">Load frame</a>
          </turbo-frame>
          <button id="load-stream" data-he-post="/turbo/stream">Load stream</button>
          <div id="stream-target"></div>
          <div id="html-morph" data-he-html="html"></div>
          <div id="morph-host" data-he-data="{ items: [{ id: 1 }, { id: 2 }] }">${morphHostChildren("")}</div>
          <button id="stream-morph" data-he-post="/turbo/stream-morph">Morph stream</button>
          <turbo-frame id="morph-frame" src="/turbo/morph-frame" refresh="morph"></turbo-frame>
        </main>` }));
      return;
    }
    if (url.pathname === "/turbo/frame") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><turbo-frame id="feature-frame">
        <section data-he-data="{ count: 0 }">
          <button id="frame-increment" data-he-click="count++">Increment</button>
          <span id="frame-count" data-he-text="count"></span>
        </section>
      </turbo-frame>`);
      return;
    }
    if (url.pathname === "/turbo/stream-morph") {
      res.writeHead(200, { "Content-Type": "text/vnd.turbo-stream.html; charset=utf-8" });
      res.end(`<turbo-stream action="update" method="morph" target="morph-host"><template>${morphHostChildren('<p id="morphed-extra">Extra</p>')}</template></turbo-stream>`);
      return;
    }
    if (url.pathname === "/turbo/morph-frame") {
      morphFrameVersion++;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><turbo-frame id="morph-frame">
        <section data-he-data="{ items: [{ id: 1 }] }">
          <span id="morph-frame-version">${morphFrameVersion}</span>
          <button id="morph-frame-add" data-he-click="items = [...items, { id: items.length + 1 }]">Add</button>
          <template data-he-for="item in items" :key="item.id"><i class="frame-row" data-he-text="item.id"></i></template>
        </section>
      </turbo-frame>`);
      return;
    }
    if (url.pathname === "/turbo/auto-permanent-a" || url.pathname === "/turbo/auto-permanent-b") {
      const page = url.pathname.endsWith("-b") ? "b" : "a";
      const next = page === "a" ? "/turbo/auto-permanent-b" : "/turbo/auto-permanent-a";
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(turboDocument({ title: `Auto permanent ${page}`, body: `
        <aside id="auto-permanent" data-turbo-permanent data-he-data="{ n: 0 }">
          <button id="auto-permanent-inc" data-he-click="n++">Increment</button>
          <span id="auto-permanent-n" data-he-text="n"></span>
        </aside>
        <main id="auto-permanent-page-${page}"><a id="auto-permanent-next" href="${next}">Next</a></main>` }));
      return;
    }
    if (url.pathname === "/turbo/stream") {
      res.writeHead(200, { "Content-Type": "text/vnd.turbo-stream.html; charset=utf-8" });
      res.end(`<turbo-stream action="update" target="stream-target"><template>
        <span id="stream-result" data-he-text="'Streamed through Turbo'"></span>
      </template></turbo-stream>`);
      return;
    }
    if (url.pathname === "/turbo/permanent-a" || url.pathname === "/turbo/permanent-b") {
      const page = url.pathname.endsWith("permanent-b") ? "B" : "A";
      const next = page === "A" ? "/turbo/permanent-b" : "/turbo/permanent-a";
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Permanent ${page}</title>
        <script type="module" src="/test-fixtures/turbo-permanent.js"></script></head><body>
        <aside id="permanent-counter" data-turbo-permanent>
          <button id="permanent-increment" data-he-click="count++">Increment</button>
          <span id="permanent-count" data-he-text="count"></span>
        </aside>
        <main id="permanent-page-${page.toLowerCase()}"><a id="permanent-next" href="${next}">Page ${page === "A" ? "B" : "A"}</a></main>
      </body></html>`);
      return;
    }

    const path = staticPath(url.pathname);
    if (!path) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const contents = await readFile(path);
    res.writeHead(200, { "Content-Type": mimeTypes.get(extname(path)) || "application/octet-stream" });
    res.end(contents);
  } catch (error) {
    res.writeHead(error.code === "ENOENT" ? 404 : 500).end(error.message);
  }
});

const listen = server => new Promise((resolve, reject) => {
  const onError = error => {
    server.off("listening", onListening);
    reject(error);
  };
  const onListening = () => {
    server.off("error", onError);
    resolve(server.address().port);
  };
  server.once("error", onError);
  server.once("listening", onListening);
  server.listen(0, "127.0.0.1");
});
const closeServer = server => new Promise(resolve => server.close(resolve));
const tick = page => page.waitForTimeout(0);
const turboMorphRequests = new Map();
let morphFrameVersion = 0;
const morphHostChildren = extra => `
  <button id="morph-host-add" data-he-click="items = [...items, { id: items.length + 1 }]">Add</button>
  <template data-he-for="item in items" :key="item.id"><b class="host-row" data-he-text="item.id"></b></template>${extra}`;

function turboDocument({ title, body, entry = "default", refresh = false }) {
  const bootstrap = entry === "csp" ? "/test-fixtures/turbo-csp.js" : "/test-fixtures/turbo-default.js";
  const refreshMeta = refresh
    ? '<meta name="turbo-refresh-method" content="morph"><meta name="turbo-refresh-scroll" content="preserve">'
    : "";
  return `<!doctype html>
    <html data-helium-entry="${entry}"><head><meta charset="utf-8">${refreshMeta}<title>${title}</title>
    <script type="module" src="${bootstrap}"></script></head><body>${body}</body></html>`;
}

function cachePage(entry, page) {
  const query = `?entry=${entry}`;
  if (page === "b") {
    return turboDocument({ title: "Cache B", entry, body: `
      <main id="cache-b"><a id="back-to-a" href="/turbo/cache-a${query}">Back to A</a>
        <span id="greeting" data-he-text="turboGreeting()"></span></main>` });
  }
  return turboDocument({ title: "Cache A", entry, body: `
    <main id="cache-a" data-helium data-he-init="countInit()" data-he-data="{ items: [{ id: 1, name: 'One' }, { id: 2, name: 'Two' }], show: true }">
      <a id="to-cache-b" href="/turbo/cache-b${query}">Go to B</a>
      <template data-he-for="item in items" :key="item.id">
        <span class="cache-row" data-he-attr:data-id="item.id" data-he-text="item.name"></span>
      </template>
      <template data-he-if="show"><strong class="cache-condition">Shown</strong></template>
    </main>` });
}

async function withPage(browser, baseUrl, path, callback) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${baseUrl}${path}`);
  try {
    await callback(page);
    assert(errors.length === 0, `${path} emitted browser errors:\n${errors.join("\n")}`);
  } finally {
    await page.close();
  }
}

async function loadHelium(page, entry, markup, state = {}) {
  await page.evaluate(async ({ entry, markup, state }) => {
    document.body.innerHTML = markup;
    const module = await import(`${entry}?cache=${crypto.randomUUID()}`);
    window.__heliumModule = module;
    window.__heliumState = await module.default(state);
  }, { entry, markup, state });
}

async function testStandard(baseUrl, browser) {
  await withPage(browser, baseUrl, "/blank.html", async page => {
    await loadHelium(page, `${baseUrl}/dist/helium.min.js`, `
      <main id="app" data-helium @notice="received = $event.detail.value">
        <span id="root" @text="count"></span>
        <button id="dispatch" @click="$dispatch('notice', { value: 9 })"></button>
        <i id="window-listener" @resize.window="windowCount++"></i>
        <div id="self-listener" @mousedown.self="selfCount++"><i id="self-child"></i></div>
        <div id="capture-parent" @click.capture="order.push('capture')"><button id="capture-child" @click.passive="order.push('target')"></button></div>
        <button id="throttle" @click.throttle:40="throttled++"></button>
        <button id="dynamic"></button><span id="dynamic-output"></span>
        <div id="lifecycle"
          data-he-init:one="(lifecycleStarted.push('one'), () => lifecycleCleaned.push('one'))"
          data-he-init:two="(lifecycleStarted.push('two'), () => lifecycleCleaned.push('two'))"
          data-he-init:async="new Promise(resolve => { window.__lifecycleSignal = $signal; window.__resolveLifecycle = resolve })"
        ></div>
        <section id="local-scope" @data="{ count: 10 }">
          <i id="ref-one" class="ref-item" @ref="thing"></i>
          <i id="ref-two" class="ref-item" @ref="thing"></i>
          <button id="local" @click="count++"></button>
          <button id="inspect" @click="$el.dataset.result = [$root.id, $scope.id, $thing.id, $refs.thing.length, $.scope.all('.ref-item').length].join(':')"></button>
          <b id="local-count" @text="count"></b>
        </section>
        <template @for="item in items" :key="item.id">
          <input :data-id="item.id" @bind="item.name">
        </template>
      </main>
    `, {
      count: 1,
      received: 0,
      windowCount: 0,
      selfCount: 0,
      order: [],
      throttled: 0,
      items: [{ id: 1, name: "One" }, { id: 2, name: "Two" }],
      dynamicCount: 0,
      dynamicOther: 10,
      lifecycleStarted: [],
      lifecycleCleaned: [],
    });

    await page.locator("#local").click();
    await expectText(page, "#local-count", "11");
    await expectText(page, "#root", "1");
    await page.locator("#inspect").click();
    assert(await page.locator("#inspect").getAttribute("data-result") === "app:local-scope:ref-one:2:2",
      "standard bundle did not expose scoped root/query/ref helpers");

    await page.locator("#dispatch").click();
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.locator("#self-child").dispatchEvent("mousedown");
    await page.locator("#capture-child").click();
    await page.evaluate(() => {
      document.querySelector("#throttle").click();
      document.querySelector("#throttle").click();
    });
    let eventState = await page.evaluate(() => ({
      received: window.__heliumState.received,
      windowCount: window.__heliumState.windowCount,
      selfCount: window.__heliumState.selfCount,
      order: [...window.__heliumState.order],
      throttled: window.__heliumState.throttled,
    }));
    assert(eventState.received === 9, "standard bundle did not dispatch a bubbling custom event");
    assert(eventState.windowCount === 1, "standard bundle did not handle a window listener");
    assert(eventState.selfCount === 0, "standard bundle self listener accepted a child event");
    assert(eventState.order.join(",") === "capture,target", "standard bundle did not honor capture order");
    assert(eventState.throttled === 1, "standard bundle throttle did not invoke the leading event");
    await page.waitForTimeout(60);
    assert(await page.evaluate(() => window.__heliumState.throttled) === 2,
      "standard bundle throttle did not invoke one trailing event");

    await page.evaluate(() => {
      document.querySelector("#dynamic").setAttribute("data-he-click", "dynamicCount++");
      document.querySelector("#dynamic-output").setAttribute("data-he-text", "dynamicCount");
    });
    await tick(page);
    await page.locator("#dynamic").click();
    await expectText(page, "#dynamic-output", "1");
    await page.evaluate(() => {
      document.querySelector("#dynamic").setAttribute("data-he-click", "dynamicOther++");
      document.querySelector("#dynamic-output").setAttribute("data-he-text", "dynamicOther");
    });
    await expectText(page, "#dynamic-output", "10");
    await page.locator("#dynamic").click();
    await expectText(page, "#dynamic-output", "11");
    await page.evaluate(() => {
      document.querySelector("#dynamic").removeAttribute("data-he-click");
      document.querySelector("#dynamic-output").removeAttribute("data-he-text");
    });
    await tick(page);
    await page.locator("#dynamic").click();
    assert(await page.evaluate(() => window.__heliumState.dynamicOther) === 11,
      "standard bundle retained a removed event directive");

    let lifecycle = await page.evaluate(() => ({
      started: [...window.__heliumState.lifecycleStarted],
      cleaned: [...window.__heliumState.lifecycleCleaned],
    }));
    assert(lifecycle.started.join(",") === "one,two" && lifecycle.cleaned.length === 0
      && await page.evaluate(() => !window.__lifecycleSignal.aborted),
      "standard bundle did not start both namespaced initializers");
    await page.evaluate(() => document.querySelector("#lifecycle").removeAttribute("data-he-init:one"));
    await tick(page);
    lifecycle = await page.evaluate(() => [...window.__heliumState.lifecycleCleaned]);
    assert(lifecycle.join(",") === "one",
      "standard bundle did not clean up the selected namespaced initializer");
    await page.locator("#lifecycle").evaluate(element => element.remove());
    await tick(page);
    assert(await page.evaluate(() => window.__lifecycleSignal.aborted),
      "standard bundle did not abort a detached initializer signal");
    await page.evaluate(() => window.__resolveLifecycle(() => { window.__lateLifecycleCleanup = true; }));
    await tick(page);
    assert(await page.evaluate(() => window.__lateLifecycleCleanup === true),
      "standard bundle did not run cleanup returned by stale async setup");
    lifecycle = await page.evaluate(() => [...window.__heliumState.lifecycleCleaned]);
    assert(lifecycle.join(",") === "one,two",
      "standard bundle did not clean up the remaining namespaced initializer");

    await page.locator("#window-listener").evaluate(element => element.remove());
    await tick(page);
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    assert(await page.evaluate(() => window.__heliumState.windowCount) === 1,
      "standard bundle leaked a detached window listener");

    await page.locator('[data-id="1"]').focus();
    await page.evaluate(() => {
      window.__firstInput = document.activeElement;
      window.__heliumState.items = [window.__heliumState.items[1], window.__heliumState.items[0]];
    });
    await tick(page);
    const focusedKeyPreserved = await page.evaluate(() =>
      document.activeElement === window.__firstInput &&
      document.activeElement.getAttribute("data-id") === "1" &&
      [...document.querySelectorAll("input")].map(input => input.getAttribute("data-id")).join(",") === "2,1"
    );
    assert(focusedKeyPreserved, "standard bundle did not preserve focused keyed row identity");
  });
}

async function testLite(baseUrl, browser) {
  await withPage(browser, baseUrl, "/blank.html", async page => {
    await loadHelium(page, `${baseUrl}/dist/helium-lite.min.js`, `
      <main data-helium>
        <section @data="{ count: 10 }">
          <button id="inc" @click="count++"></button>
          <b id="nested" @text="count"></b>
        </section>
        <span id="root" @text="count"></span>
      </main>
    `, { count: 1 });

    await expectText(page, "#nested", "10");
    await expectText(page, "#root", "10");
    await page.locator("#inc").click();
    await expectText(page, "#nested", "11");
    await expectText(page, "#root", "11");
  });
}

async function testCsp(baseUrl, browser) {
  await withPage(browser, baseUrl, "/csp.html", async page => {
    await loadHelium(page, `${baseUrl}/dist/helium-csp.min.js`, `
      <main id="app" data-helium @notice="received = $event.detail.value">
        <button id="dispatch" @click="$dispatch('notice', { value: 6 })"></button>
        <button id="throttle" @click.throttle:40="throttled++"></button>
        <section id="local-scope" @data="{ count: 2 }">
          <i id="ref-one" class="ref-item" @ref="thing"></i>
          <i id="ref-two" class="ref-item" @ref="thing"></i>
          <button id="inc" @click="count++"></button>
          <button id="inspect" @click="$el.dataset.result = [$root.id, $scope.id, $thing.id, $refs.thing.length, $.scope.all('.ref-item').length].join(':')"></button>
          <b id="local" @text="count"></b>
        </section>
        <span id="root" @text="count"></span>
      </main>
    `, { count: 20, received: 0, throttled: 0 });

    await page.locator("#inc").click();
    await expectText(page, "#local", "3");
    await expectText(page, "#root", "20");
    await page.locator("#inspect").click();
    assert(await page.locator("#inspect").getAttribute("data-result") === "app:local-scope:ref-one:2:2",
      "CSP bundle did not expose scoped root/query/ref helpers");

    await page.locator("#dispatch").click();
    await page.evaluate(() => {
      document.querySelector("#throttle").click();
      document.querySelector("#throttle").click();
    });
    assert(await page.evaluate(() => window.__heliumState.received) === 6,
      "CSP bundle did not dispatch a bubbling custom event");
    assert(await page.evaluate(() => window.__heliumState.throttled) === 1,
      "CSP bundle throttle did not invoke the leading event");
    await page.waitForTimeout(60);
    assert(await page.evaluate(() => window.__heliumState.throttled) === 2,
      "CSP bundle throttle did not invoke one trailing event");
  });
}

async function testLateImport(baseUrl, browser) {
  await withPage(browser, baseUrl, "/blank.html", async page => {
    await loadHelium(page, `${baseUrl}/dist/helium.min.js`, `
      <main data-helium>
        <section @import="/helpers.js">
          <span id="message" @text="greet(name)"></span>
        </section>
      </main>
    `, { name: "Helium" });

    await expectText(page, "#message", "Hello Helium");
  });
}

async function testImportMap(baseUrl, browser) {
  await withPage(browser, baseUrl, "/importmap.html", async page => {
    await loadHelium(page, `${baseUrl}/dist/helium.min.js`, `
      <main data-helium>
        <section @import="pinned-helpers">
          <span id="message" @text="greet(name)"></span>
        </section>
      </main>
    `, { name: "Import map" });

    await expectText(page, "#message", "Hello Import map");
  });
}

async function testLifecycleImport(baseUrl, browser, entry, path) {
  await withPage(browser, baseUrl, path, async page => {
    await loadHelium(page, `${baseUrl}${entry}`, `
      <main data-helium>
        <section id="behavior" data-he-import="/test-fixtures/import-behavior-one.js,/test-fixtures/import-behavior-two.js">
          <button id="owned" class="candidate" data-he-ref="trigger"></button>
          <aside id="nested" data-he-import="/test-fixtures/import-behavior-two.js">
            <button class="candidate" data-he-ref="trigger"></button>
          </aside>
        </section>
      </main>
    `, { watched: 0 });

    const started = await page.evaluate(() => {
      const outer = document.querySelector("#behavior");
      const nested = document.querySelector("#nested");
      window.__importBehaviorElements = { outer, nested };
      return {
        outer: { ...outer.dataset },
        nested: { ...nested.dataset },
        greeting: window.__heliumState.importedGreeting("Browser"),
      };
    });
    assert(started.greeting === "Hello Browser"
      && started.outer.startedOne === "1" && started.outer.startedTwo === "1"
      && started.outer.refsOne === "1" && started.outer.queriesOne === "1"
      && started.nested.startedTwo === "1" && started.nested.refsTwo === "1",
    `${entry} did not start lifecycle imports with behavior-local helpers`);

    await page.evaluate(() => { window.__heliumState.watched = 1; });
    await tick(page);
    assert(await page.locator("#behavior").getAttribute("data-watched") === "0:1",
      `${entry} did not expose lifecycle-bound watch with previous values`);
    await page.evaluate(() => {
      const ref = document.createElement("button");
      ref.setAttribute("data-he-ref", "trigger");
      document.querySelector("#behavior").insertBefore(ref, document.querySelector("#nested"));
    });
    await tick(page);
    assert(await page.locator("#behavior").getAttribute("data-watched-refs") === "1:2",
      `${entry} did not expose observable behavior refs`);

    await page.evaluate(() => document.querySelector("#behavior")
      .setAttribute("data-he-import", "/test-fixtures/import-behavior-two.js"));
    await tick(page);
    const reconciled = await page.evaluate(() => ({ ...document.querySelector("#behavior").dataset }));
    assert(reconciled.cleanedOne === "true" && reconciled.startedTwo === "1" && !reconciled.cleanedTwo,
      `${entry} did not remove one imported behavior independently`);
    await page.evaluate(() => { window.__heliumState.watched = 2; });
    await page.evaluate(() => {
      const ref = document.createElement("button");
      ref.setAttribute("data-he-ref", "trigger");
      document.querySelector("#behavior").append(ref);
    });
    await tick(page);
    assert(await page.locator("#behavior").getAttribute("data-watched") === "0:1",
      `${entry} retained a watcher after its behavior was removed`);
    assert(await page.locator("#behavior").getAttribute("data-watched-refs") === "1:2",
      `${entry} retained a ref watcher after its behavior was removed`);

    await page.evaluate(() => document.querySelector("main").remove());
    await tick(page);
    const disconnected = await page.evaluate(() => ({
      outer: { ...window.__importBehaviorElements.outer.dataset },
      nested: { ...window.__importBehaviorElements.nested.dataset },
    }));
    assert(disconnected.outer.cleanedTwo === "true" && disconnected.nested.cleanedTwo === "true",
      `${entry} did not clean imported behaviors when its mounted root disconnected`);
  });
}

async function testSse(baseUrl, browser) {
  await withPage(browser, baseUrl, "/blank.html", async page => {
    await loadHelium(page, `${baseUrl}/dist/helium-sse.min.js`, `
      <main data-helium>
        <button id="load" @get="/events"></button>
        <div id="result"></div>
      </main>
    `);

    await page.locator("#load").click();
    await expectText(page, "#result", "Streamed");
  });
}

async function testTurboCache(baseUrl, browser, entry) {
  const query = entry === "csp" ? "?entry=csp" : "";
  await withPage(browser, baseUrl, `/turbo/cache-a${query}`, async page => {
    await page.waitForFunction(() => window.__turboReady === true);
    await page.waitForFunction(() => document.querySelectorAll(".cache-row").length === 2);
    assert(await page.locator(".cache-condition").count() === 1,
      `${entry} Turbo page did not render its initial conditional`);

    await page.locator("#to-cache-b").click();
    await page.locator("#cache-b").waitFor();
    await expectText(page, "#greeting", "remembered");
    if (entry === "standard") {
      const rows = await page.evaluate(() => window.__turboLifecycle.rowsBeforeRender);
      assert(rows[0] === 2, `Helium removed rendered rows before Turbo swapped the page (${rows})`);
    }
    await page.goBack();
    await page.locator("#cache-a").waitFor();
    await page.waitForFunction(() => document.querySelectorAll(".cache-row").length === 2);
    assert(await page.locator(".cache-row").count() === 2,
      `${entry} duplicated keyed rows in a restored Turbo snapshot`);
    assert(await page.locator(".cache-condition").count() === 1,
      `${entry} duplicated conditional output in a restored Turbo snapshot`);

    await page.locator("#to-cache-b").click();
    await page.locator("#cache-b").waitFor();
    await page.goBack();
    await page.locator("#cache-a").waitFor();
    await page.waitForFunction(() => document.querySelectorAll(".cache-row").length === 2);
    assert(await page.locator(".cache-row").count() === 2,
      `${entry} duplicated keyed rows after a second Turbo restoration`);

    // A link back to a cached page renders a preview, then the real response.
    // Only the real page should initialize.
    await page.locator("#to-cache-b").click();
    await page.locator("#cache-b").waitFor();
    const initsBefore = await page.evaluate(() => window.__turboLifecycle.inits);
    await page.locator("#back-to-a").click();
    await page.waitForFunction(() => document.querySelector("#cache-a")
      && !document.documentElement.hasAttribute("data-turbo-preview")
      && document.querySelectorAll(".cache-row").length === 2);
    await page.waitForTimeout(100);
    const inits = await page.evaluate(() => window.__turboLifecycle.inits);
    assert(inits === initsBefore + 1, `${entry} initialized a Turbo preview (${initsBefore} -> ${inits})`);
    assert(await page.locator(".cache-row").count() === 2,
      `${entry} duplicated keyed rows after a previewed visit`);
  });
}

async function testTurboMorph(baseUrl, browser) {
  const token = crypto.randomUUID();
  await withPage(browser, baseUrl, `/turbo/morph?token=${token}`, async page => {
    await page.waitForFunction(() => window.__turboReady === true);
    await expectText(page, "#morph-version", "1");
    await page.locator("#morph-inc").click();
    await page.locator("#morph-inc").click();
    await page.locator("#morph-toggle").click();
    await page.locator("#morph-draft").fill("half typed");
    await page.locator("#morph-inc").focus();
    await page.evaluate(() => window.Turbo.visit(location.href, { action: "replace" }));
    await expectText(page, "#morph-version", "2");
    await page.waitForFunction(() => document.querySelectorAll(".morph-row").length === 2);
    const result = await page.evaluate(() => ({
      ids: [...document.querySelectorAll(".morph-row")].map(row => row.dataset.id),
      names: [...document.querySelectorAll(".morph-row")].map(row => row.textContent),
      lifecycle: { ...window.__turboLifecycle },
    }));
    assert(result.ids.join(",") === "2,3" && result.names.join(",") === "Two updated,Three",
      `Turbo morph did not reconcile Helium structural output: ${JSON.stringify(result)}`);
    assert(result.lifecycle.renders.includes("morph"), "Turbo did not use morph rendering in the morph fixture");
    assert(result.lifecycle.setups === 1 && result.lifecycle.cleanups === 0,
      `Turbo morph restarted Helium instead of keeping it alive (${JSON.stringify(result.lifecycle)})`);
    const local = await page.evaluate(() => ({
      count: document.querySelector("#morph-count").textContent,
      menuHidden: document.querySelector("#morph-menu").hidden,
      draft: document.querySelector("#morph-draft").value,
      constant: document.querySelector("#morph-static").textContent,
    }));
    assert(local.count === "2" && !local.menuHidden && local.draft === "half typed" && local.constant === "static",
      `Turbo morph lost client-side state: ${JSON.stringify(local)}`);
    await page.locator("#morph-inc").click();
    await expectText(page, "#morph-count", "3");
  });
}

async function testTurboFramesAndStreams(baseUrl, browser) {
  await withPage(browser, baseUrl, "/turbo/features", async page => {
    await page.waitForFunction(() => window.__turboReady === true);
    await page.locator("#morph-child").waitFor();
    await page.evaluate(() => {
      window.__htmlMorphChild = document.querySelector("#morph-child");
      window.__turboState.html = '<span id="morph-child">Two</span>';
    });
    await expectText(page, "#morph-child", "Two");
    assert(await page.evaluate(() => document.querySelector("#morph-child") === window.__htmlMorphChild),
      "@html did not use Turbo's bundled morphing to preserve child identity");

    await page.locator("#load-frame").click();
    await page.locator("#frame-increment").waitFor();
    await page.locator("#frame-increment").click();
    await expectText(page, "#frame-count", "1");

    await page.locator("#load-stream").click();
    await expectText(page, "#stream-result", "Streamed through Turbo");

    const texts = selector => page.evaluate(selector =>
      [...document.querySelectorAll(selector)].map(node => node.textContent).join(","), selector);

    // A morphing stream must keep rendered rows, their order, and listeners.
    await page.locator("#morph-host-add").click();
    await page.waitForFunction(() => document.querySelectorAll(".host-row").length === 3);
    await page.locator("#stream-morph").click();
    await page.locator("#morphed-extra").waitFor();
    assert(await texts(".host-row") === "1,2,3", `Stream morph lost rows: ${await texts(".host-row")}`);
    assert(await page.evaluate(() => document.querySelector("#morph-host").lastElementChild.id === "morphed-extra"),
      "Stream morph placed rendered rows after incoming server content");
    await page.locator("#morph-host-add").click();
    await page.waitForFunction(() => document.querySelectorAll(".host-row").length === 4);

    // So must a frame refreshed with morphing.
    await page.locator("#morph-frame-add").click();
    await page.waitForFunction(() => document.querySelectorAll(".frame-row").length === 2);
    const version = await page.locator("#morph-frame-version").textContent();
    await page.evaluate(() => document.querySelector("#morph-frame").reload());
    await page.waitForFunction(v => document.querySelector("#morph-frame-version")?.textContent !== v, version);
    await page.waitForTimeout(50);
    assert(await texts(".frame-row") === "1,2", `Frame morph lost rows: ${await texts(".frame-row")}`);
    await page.locator("#morph-frame-add").click();
    await page.waitForFunction(() => document.querySelectorAll(".frame-row").length === 3);
  });
}

async function testTurboPermanent(baseUrl, browser) {
  await withPage(browser, baseUrl, "/turbo/permanent-a", async page => {
    await page.waitForFunction(() => window.__turboReady === true);
    await page.locator("#permanent-increment").click();
    await expectText(page, "#permanent-count", "1");
    await page.locator("#permanent-next").click();
    await page.locator("#permanent-page-b").waitFor();
    assert(await page.evaluate(() => document.querySelector("#permanent-counter") === window.__permanentElement),
      "Turbo did not retain the explicitly mounted permanent Helium root");
    await expectText(page, "#permanent-count", "1");
    await page.locator("#permanent-increment").click();
    await expectText(page, "#permanent-count", "2");
  });
}

async function testTurboAutoPermanent(baseUrl, browser) {
  await withPage(browser, baseUrl, "/turbo/auto-permanent-a", async page => {
    await page.waitForFunction(() => window.__turboReady === true);
    await page.locator("#auto-permanent-inc").click();
    await page.locator("#auto-permanent-inc").click();
    await expectText(page, "#auto-permanent-n", "2");
    await page.evaluate(() => { window.__autoPermanent = document.querySelector("#auto-permanent"); });
    await page.locator("#auto-permanent-next").click();
    await page.locator("#auto-permanent-page-b").waitFor();
    await page.waitForTimeout(50);
    assert(await page.evaluate(() => document.querySelector("#auto-permanent") === window.__autoPermanent),
      "Turbo did not retain the permanent element");
    await expectText(page, "#auto-permanent-n", "2");
    await page.locator("#auto-permanent-inc").click();
    await expectText(page, "#auto-permanent-n", "3");
  });
}

async function testBrowserEntryImports(baseUrl, browser) {
  await withPage(browser, baseUrl, "/blank.html", async page => {
    const results = await page.evaluate(async entries => {
      const loaded = [];
      for (const entry of entries) {
        const module = await import(`${entry}?cache=${crypto.randomUUID()}`);
        loaded.push([
          entry,
          typeof module.default,
          typeof module.default.mount,
          typeof module.helium,
          typeof module.heliumTeardown,
        ]);
      }
      return loaded;
    }, [
      `${baseUrl}/helium.js`,
      `${baseUrl}/helium-lite.js`,
      `${baseUrl}/helium-sse.js`,
      `${baseUrl}/helium-turbo.js`,
      `${baseUrl}/helium-turbo-sse.js`,
      `${baseUrl}/helium-csp.js`,
      `${baseUrl}/helium-csp-sse.js`,
      `${baseUrl}/helium-csp-turbo.js`,
      `${baseUrl}/helium-csp-turbo-sse.js`,
      `${baseUrl}/dist/helium.min.js`,
      `${baseUrl}/dist/helium-lite.min.js`,
      `${baseUrl}/dist/helium-sse.min.js`,
      `${baseUrl}/dist/helium-turbo.min.js`,
      `${baseUrl}/dist/helium-turbo-sse.min.js`,
      `${baseUrl}/dist/helium-csp.min.js`,
      `${baseUrl}/dist/helium-csp-sse.min.js`,
      `${baseUrl}/dist/helium-csp-turbo.min.js`,
      `${baseUrl}/dist/helium-csp-turbo-sse.min.js`,
    ]);

    for (const [entry, defaultType, mountType, namedType, teardownType] of results) {
      const lite = entry.includes("helium-lite");
      assert(defaultType === "function" && (lite ? mountType === "undefined" : mountType === "function")
        && namedType === "function" && teardownType === "function",
      `${entry} did not expose the normalized public mount/teardown API`);
    }
  });
}

async function testExamples(baseUrl, browser) {
  await withPage(browser, baseUrl, "/examples/index.html", async page => {
    await expectText(page, ".hero-demo output", "12");
    await page.getByRole("button", { name: "Increase" }).click();
    await expectText(page, ".hero-demo output", "13");

    await page.getByLabel("New task").fill("Exercise the example");
    await page.getByRole("button", { name: "Add task" }).click();
    assert(await page.locator(".task-list .task").count() === 4, "Standard example did not add a keyed task");

    const disclosure = page.getByRole("button", { name: /Why not a controller/ });
    await disclosure.click();
    assert(await disclosure.getAttribute("aria-expanded") === "true", "Imported disclosure behavior did not set ARIA state");

    await page.getByRole("button", { name: "Connect person" }).click();
    await expectText(page, ".card.tint-blue .pill b", "3");

    const action = page.locator("[data-he-click]").filter({ hasText: "+1 point" });
    await action.click();
    await page.getByRole("button", { name: "Change that button’s action" }).click();
    await expectText(page, "[data-he-click]", "+5 points");
    await page.locator("[data-he-click]").click();
    await expectText(page, ".card:not(.tint-lime) .split strong", "6");
  });

  await withPage(browser, baseUrl, "/examples/index-lite.html", async page => {
    await page.getByRole("button", { name: "+", exact: true }).click();
    await expectText(page, ".hero-demo output", "4");
    await page.getByLabel("Workspace name").fill("Northstar");
    await expectText(page, ".preview h4", "Northstar");
    await page.getByRole("button", { name: "Focus", exact: true }).click();
    assert(await page.getByPlaceholder("Focus target").evaluate(element => element === document.activeElement),
      "Lite example did not resolve its singular ref");

    await page.getByRole("button", { name: "Insert interactive notice" }).click();
    await page.getByRole("button", { name: "Count an inserted click" }).click();
    assert(await page.locator("[data-mounted='true']").count() === 1, "Lite example did not initialize inserted HTML");
    await page.getByRole("button", { name: "Remove it" }).click();
    await expectText(page, ".card.tint-coral .pill b:first-child", "1");
  });

  await withPage(browser, baseUrl, "/examples/test-password.html", async page => {
    await page.getByLabel("Choose a password").fill("Helium-demo-2026!");
    await expectText(page, ".split strong", "Excellent");
    assert(await page.locator(".tip-list li").count() === 1, "Password example did not render calculated tips");
  });

  await withPage(browser, baseUrl, "/examples/todo.html", async page => {
    await page.getByLabel("New task").fill("Ship Helium 1.0");
    await page.getByRole("button", { name: "Add task" }).click();
    await expectText(page, ".todo-text", "Ship Helium 1.0");
    await page.getByLabel("Complete Ship Helium 1.0").click();
    assert(await page.locator(".todo-item.completed").count() === 1, "Todo example did not update a keyed row");
  });

  await withPage(browser, baseUrl, "/examples/validation.html", async page => {
    await page.getByRole("button", { name: "Use taken email" }).click();
    await page.getByRole("button", { name: "Save profile" }).click();
    await expectText(page, ".request-status output", "Correct the highlighted field");
    await expectText(page, "#email-error", "That email address is already registered.");
  });
}

async function expectText(page, selector, expected) {
  await page.waitForFunction(
    ({ selector, expected }) => document.querySelector(selector)?.textContent === expected,
    { selector, expected },
  );
}

const port = await listen(server);
const baseUrl = `http://127.0.0.1:${port}`;
const browserTypes = { chromium, firefox, webkit };

try {
  for (const [name, browserType] of Object.entries(browserTypes)) {
    const browser = await browserType.launch();
    try {
      await testStandard(baseUrl, browser);
      await testLite(baseUrl, browser);
      await testCsp(baseUrl, browser);
      await testLateImport(baseUrl, browser);
      await testImportMap(baseUrl, browser);
      await testLifecycleImport(baseUrl, browser, "/dist/helium.min.js", "/blank.html");
      await testLifecycleImport(baseUrl, browser, "/dist/helium-csp.min.js", "/csp.html");
      await testSse(baseUrl, browser);
      await testTurboCache(baseUrl, browser, "standard");
      await testTurboCache(baseUrl, browser, "csp");
      await testTurboMorph(baseUrl, browser);
      await testTurboFramesAndStreams(baseUrl, browser);
      await testTurboPermanent(baseUrl, browser);
      await testTurboAutoPermanent(baseUrl, browser);
      await testBrowserEntryImports(baseUrl, browser);
      if (name === "chromium") await testExamples(baseUrl, browser);
      console.log(`${name} browser smoke tests passed.`);
    } finally {
      await browser.close();
    }
  }
  console.log("All cross-browser smoke tests passed.");
} finally {
  await closeServer(server);
}

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
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

async function testTurbo(baseUrl, browser) {
  await withPage(browser, baseUrl, "/blank.html", async page => {
    await loadHelium(page, `${baseUrl}/dist/helium.min.js`, `
      <main data-helium>
        <span id="count" @text="count"></span>
      </main>
    `, { count: 1 });
    await expectText(page, "#count", "1");

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent("turbo:before-render"));
      document.body.innerHTML = `<main data-helium data-he-data="{ count: 2 }"><span id="count" @text="count"></span></main>`;
      document.dispatchEvent(new CustomEvent("turbo:render"));
    });
    await expectText(page, "#count", "2");
  });
}

async function testBrowserEntryImports(baseUrl, browser) {
  await withPage(browser, baseUrl, "/blank.html", async page => {
    const results = await page.evaluate(async entries => {
      const loaded = [];
      for (const entry of entries) {
        const module = await import(`${entry}?cache=${crypto.randomUUID()}`);
        loaded.push([entry, typeof module.default, typeof module.default.mount]);
      }
      return loaded;
    }, [
      `${baseUrl}/helium.js`,
      `${baseUrl}/helium-lite.js`,
      `${baseUrl}/helium-sse.js`,
      `${baseUrl}/helium-csp.js`,
      `${baseUrl}/helium-csp-sse.js`,
      `${baseUrl}/dist/helium.min.js`,
      `${baseUrl}/dist/helium-lite.min.js`,
      `${baseUrl}/dist/helium-sse.min.js`,
      `${baseUrl}/dist/helium-csp.min.js`,
      `${baseUrl}/dist/helium-csp-sse.min.js`,
    ]);

    for (const [entry, defaultType, mountType] of results) {
      assert(defaultType === "function" && mountType === "function", `${entry} did not expose default mount API`);
    }
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
let browser;

try {
  browser = await chromium.launch();
  await testStandard(baseUrl, browser);
  await testLite(baseUrl, browser);
  await testCsp(baseUrl, browser);
  await testLateImport(baseUrl, browser);
  await testSse(baseUrl, browser);
  await testTurbo(baseUrl, browser);
  await testBrowserEntryImports(baseUrl, browser);
  console.log("All browser smoke tests passed.");
} finally {
  await browser?.close();
  await closeServer(server);
}

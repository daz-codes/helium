// Head-to-head runtime benchmark: Helium (dist/helium.min.js) vs Alpine.js,
// React 18, and Datastar (all devDependencies), run in real Chromium via
// Playwright. Measures keyed-list operations and rapid scalar updates and
// reports the median of several runs.
//
// Usage: npm run bench          (builds dist/ first)
//        node scripts/benchmark.mjs [--rows 1000] [--runs 7]
//
// Notes on fairness:
// - Results are wall-clock (work + paint, via double-rAF) and machine
//   dependent; ~16-33ms of every number is the frame wait itself.
// - React rows use memo() — the idiomatic optimized-list pattern.
// - Datastar has no client-side list rendering (lists are server-rendered
//   and merged over SSE by design), so it only runs the init and counter
//   tests; its counter loop goes through real click dispatches because its
//   expressions are statement-splitting and can't hold a for-loop.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
};
const ROWS = arg("rows", 1000);
const INCREMENTS = arg("increments", 5000);
const RUNS = arg("runs", 7);

// Every page exposes the same window.hooks so a single driver runs them all.
const heliumPage = `<!doctype html>
<meta charset="utf-8"><title>Helium bench</title>
<div data-helium>
  <p><span id="counter" @text="count">0</span></p>
  <table><tbody>
    <template @for="item, i in items" :key="item.id">
      <tr><td @text="item.id"></td><td @text="item.label"></td></tr>
    </template>
  </tbody></table>
</div>
<script type="module">
  import helium from "/dist/helium.min.js";
  const state = await helium({ items: [], count: 0 });
  window.hooks = {
    setItems: items => { state.items = items; },
    updateEvery10th: () => {
      for (let i = 0; i < state.items.length; i += 10) state.items[i].label += " !!!";
    },
    swapRows: () => {
      const items = state.items.slice();
      [items[1], items[items.length - 2]] = [items[items.length - 2], items[1]];
      state.items = items;
    },
    increment: n => { for (let i = 0; i < n; i++) state.count++; },
  };
</script>`;

const alpinePage = `<!doctype html>
<meta charset="utf-8"><title>Alpine bench</title>
<div id="app" x-data="{ items: [], count: 0 }">
  <p><span id="counter" x-text="count">0</span></p>
  <table><tbody>
    <template x-for="(item, i) in items" :key="item.id">
      <tr><td x-text="item.id"></td><td x-text="item.label"></td></tr>
    </template>
  </tbody></table>
</div>
<script>
  document.addEventListener("alpine:initialized", () => {
    const state = Alpine.$data(document.getElementById("app"));
    window.hooks = {
      setItems: items => { state.items = items; },
      updateEvery10th: () => {
        for (let i = 0; i < state.items.length; i += 10) state.items[i].label += " !!!";
      },
      swapRows: () => {
        const items = state.items.slice();
        [items[1], items[items.length - 2]] = [items[items.length - 2], items[1]];
        state.items = items;
      },
      increment: n => { for (let i = 0; i < n; i++) state.count++; },
    };
  });
</script>
<script src="/node_modules/alpinejs/dist/cdn.min.js" defer></script>`;

const reactPage = `<!doctype html>
<meta charset="utf-8"><title>React bench</title>
<div id="root"></div>
<script src="/node_modules/react/umd/react.production.min.js"></script>
<script src="/node_modules/react-dom/umd/react-dom.production.min.js"></script>
<script>
  const { useState, useEffect, memo, createElement: h } = React;
  const Row = memo(({ id, label }) => h("tr", null, h("td", null, id), h("td", null, label)));
  function App() {
    const [items, setItems] = useState([]);
    const [count, setCount] = useState(0);
    useEffect(() => {
      window.hooks = {
        setItems,
        updateEvery10th: () => setItems(prev =>
          prev.map((it, i) => i % 10 === 0 ? { ...it, label: it.label + " !!!" } : it)),
        swapRows: () => setItems(prev => {
          const a = prev.slice(), j = a.length - 2;
          [a[1], a[j]] = [a[j], a[1]];
          return a;
        }),
        increment: n => { for (let i = 0; i < n; i++) setCount(c => c + 1); },
      };
    }, []);
    return h("div", null,
      h("p", null, h("span", { id: "counter" }, count)),
      h("table", null, h("tbody", null,
        items.map(it => h(Row, { key: it.id, id: it.id, label: it.label })))));
  }
  ReactDOM.createRoot(document.getElementById("root")).render(h(App));
</script>`;

const datastarPage = `<!doctype html>
<meta charset="utf-8"><title>Datastar bench</title>
<div data-signals-count="0">
  <p><span id="counter" data-text="$count">0</span></p>
  <button id="bump" data-on-click="$count++" hidden></button>
</div>
<script type="module" src="/node_modules/@starfederation/datastar/dist/datastar.js"></script>
<script type="module">
  const bump = document.getElementById("bump");
  window.hooks = {
    increment: n => { for (let i = 0; i < n; i++) bump.click(); },
  };
</script>`;

const pages = new Map([
  ["/helium.html", heliumPage],
  ["/alpine.html", alpinePage],
  ["/react.html", reactPage],
  ["/datastar.html", datastarPage],
]);
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pages.has(pathname)) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(pages.get(pathname));
  }
  try {
    const path = resolve(root, pathname.replace(/^\/+/, ""));
    if (path !== root && !path.startsWith(root + "/")) throw new Error("outside root");
    const body = await readFile(path);
    res.writeHead(200, { "Content-Type": (mime[extname(path)] || "text/plain") + "; charset=utf-8" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

await new Promise(r => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const makeRows = count =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, label: `row number ${i + 1}` }));

// Runs a hook in the page, then waits two animation frames so the measured
// time includes DOM update and style/layout for the resulting paint.
const timeHook = (page, hook, hookArg) => page.evaluate(async ({ hook, hookArg }) => {
  const painted = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const t0 = performance.now();
  window.hooks[hook](hookArg);
  await painted();
  return performance.now() - t0;
}, { hook, hookArg });

const expect = async (page, expr, expected, label) => {
  const actual = await page.evaluate(expr);
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
};

async function benchmark(browser, url, { lists = true } = {}) {
  const samples = {};
  const record = (name, value) => (samples[name] ||= []).push(value);

  for (let run = 0; run < RUNS; run++) {
    const page = await browser.newPage();
    const t0 = Date.now();
    await page.goto(url);
    await page.waitForFunction("!!window.hooks");
    record("page init", Date.now() - t0);

    if (lists) {
      record(`create ${ROWS} rows`, await timeHook(page, "setItems", makeRows(ROWS)));
      await expect(page, "document.querySelectorAll('tbody tr').length", ROWS, "create");

      record("update every 10th row", await timeHook(page, "updateEvery10th"));
      await expect(page, "document.querySelector('tbody td:nth-child(2)').textContent.endsWith('!!!')", true, "update");

      record("swap two rows", await timeHook(page, "swapRows"));

      record(`clear ${ROWS} rows`, await timeHook(page, "setItems", []));
      await expect(page, "document.querySelectorAll('tbody tr').length", 0, "clear");
    }

    record(`${INCREMENTS} counter increments`, await timeHook(page, "increment", INCREMENTS));
    await expect(page, "document.getElementById('counter').textContent", String(INCREMENTS), "increment");

    await page.close();
  }

  const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return Object.fromEntries(Object.entries(samples).map(([op, values]) => [op, median(values)]));
}

const browser = await chromium.launch();
try {
  console.log(`Benchmarking ${ROWS} keyed rows, ${INCREMENTS} increments, median of ${RUNS} runs...`);
  const results = {
    helium: await benchmark(browser, `http://127.0.0.1:${port}/helium.html`),
    alpine: await benchmark(browser, `http://127.0.0.1:${port}/alpine.html`),
    react: await benchmark(browser, `http://127.0.0.1:${port}/react.html`),
    datastar: await benchmark(browser, `http://127.0.0.1:${port}/datastar.html`, { lists: false }),
  };

  console.table(Object.keys(results.helium).map(op => {
    const row = { operation: op };
    for (const [name, samples] of Object.entries(results)) {
      row[`${name} (ms)`] = samples[op] === undefined ? "—" : +samples[op].toFixed(1);
    }
    return row;
  }));
  console.log("Lower is better. Datastar renders lists server-side, so list operations don't apply;");
  console.log("its counter goes through real click dispatches (see file header).");
} finally {
  await browser.close();
  server.close();
}

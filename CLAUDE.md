# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Helium is an ultra-light reactive library that makes HTML interactive using
declarative attributes. Current production builds are approximately 13.5KB
Standard, 2.6KB Lite, and 17.7KB CSP when minified and gzipped. Turbo navigation
and SSE are separate entry points. These figures come from the Terser builds
enforced by `npm run size:check`; Lite has a hard 3KB gzip ceiling. Source entry
points require no build step and work directly in the browser.

## Commands

```bash
npm test          # Run tests in watch mode (Vitest)
npm run test:ui   # Run tests with interactive UI dashboard
npm run test:run  # Run tests once (CI mode)
npm run build     # Generate minified, self-contained bundles in dist/
npm run size      # Report raw, gzip, and Brotli sizes
npm run test:dist # Smoke-test every generated production bundle
npm run test:release # Enforce the browser floor and version-pinned docs
npm run test:browser # Run Chromium smoke tests against browser entry points
npm run check     # Run tests, build, enforce size budgets and release checks
npm run test:app  # Drive a Rails-style Turbo app on the packed tarball in 3 browsers
npm run check:ci  # Run check plus the real-browser smoke suite and app scenario
npm run bench     # Benchmark vs Alpine, React, Datastar in Chromium (scripts/benchmark.mjs)
```

There is no consumer build requirement; the source files are browser-ready ES
modules. The maintainer build generates the optimized `dist/` entry points.

Supported browsers: Chrome/Edge 92+, Firefox 90+, Safari 15.4+ for every build.
`scripts/check-release.mjs` enforces this (syntax via esbuild, plus a denylist of
newer built-ins) and requires README/LLM_GUIDE CDN and npm examples to be pinned
to `package.json`'s version, so bump docs with the version.

## Architecture

### Core Concepts

- **Three browser-ready core builds**: Standard (`helium.js`), Lite (`helium-lite.js`), and CSP (`helium-csp.js` plus `jexpr.js`)
- **Independent minimal Lite**: `helium-lite.js` is a standalone one-root runtime, not generated from Standard; keep it below 3KB gzip
- **Optional integrations**: `helium-turbo.js` / `helium-csp-turbo.js`, SSE entry points, and combined Turbo+SSE entry points
- **Proxy-based reactivity**: Uses JavaScript Proxy to intercept state changes and trigger DOM updates
- **Batched updates**: mutations enqueue dirty keys and a microtask flush runs each affected binding once per burst; same-value writes are no-ops
- **Attribute-driven**: Interactivity is declared via `@` prefixed HTML attributes (with `data-he-*` aliases for HTML validation)
- **Expression compilation**: Inline expressions are compiled to functions using `new Function()` with caching
- **Pluggable expression engine**: Use `createHelium()` to create variants with custom expression engines
- **Independent roots**: Standard/CSP `helium.mount(root, state)` returns `{ state, unmount }`; Lite intentionally owns one root and exposes only `helium()`/`heliumTeardown()`
- **Keyed row scopes**: Standard/CSP support `<template @for="item, index in items" :key="item.id">`; aliases are local to each row and Lite excludes the feature

### Data Flow

```
HTML parsed → processElements() registers bindings → expressions compiled (cached)
→ initial applyBinding() updates DOM → state changes via Proxy → dirty keys enqueued
→ microtask flush runs each affected binding once (cascades drained in the same flush)
→ MutationObserver watches for new content → processes dynamically added elements
```

### Key Internal Components

- **Reactive state**: Each mounted instance returns its own proxy state object
- **Bindings registry**: `HELIUM.bindings` - maps state properties to UI update functions
- **Expression cache**: Compiled functions are cached to avoid recompilation
- **MutationObserver**: Automatically processes dynamically added elements
- **Per-element records**: One WeakMap-backed record owns listeners, cleanup,
  requests, scopes, behavior/ref caches, and directive lifecycle metadata

### File Structure

- `helium.js` - Standard runtime
- `helium-lite.js` - Independently maintained minimal browser-ready runtime
- `helium-csp.js` - CSP expression-engine wrapper around Standard
- `helium-turbo*.js` / `helium-csp-turbo*.js` - Optional Turbo lifecycle entry points, with SSE combinations
- `helium-sse.js` / `helium-csp-sse.js` - Optional SSE-only entry points
- `dist/*.min.js` - Generated minified, self-contained production builds
- `jexpr.js` - CSP expression parser
- `scripts/build.mjs` / `scripts/size.mjs` - Production build and size-budget pipeline
- `scripts/benchmark.mjs` - Chromium head-to-head benchmark vs Alpine.js (devDependency)
- `*.test.js` - Vitest suites for each build and the parser
- `vitest.config.js` - Test configuration (jsdom environment, globals enabled)

### Exports

```javascript
import helium from '@daz4126/helium';
import { createHelium } from '@daz4126/helium';
import heliumWithSSE from '@daz4126/helium/sse';
import heliumForRails from '@daz4126/helium/turbo';

const app = await helium.mount('#app', { count: 0 });
app.unmount();
```

## Key Directives

| Directive | Purpose |
|-----------|---------|
| `@data` | Initialize state; root `@data` is global, nested `@data` is local in Standard/CSP |
| `@text` | Bind text content |
| `@html` | Bind HTML content (use with caution for XSS) |
| `@for` + `:key` | Keyed `<template>` iteration in Standard/CSP; excluded from Lite |
| `@if` | Conditional `<template>` rendering in Standard/CSP; excluded from Lite |
| `@bind` | Two-way binding; supports `.number`, `.trim`, and `.lazy` modifiers |
| `@hidden/@visible` | Conditional visibility |
| `:attribute` | Dynamic attribute binding |
| `@click/@input/etc` | Event handlers (supports modifiers like `.prevent`, `.once`, `.debounce`) |
| `@ref` | Element reference (accessed as `$refName`) |
| `@calculate` | Computed properties |
| `@effect` | Side effects on state changes |
| `@get/@post/@put/@patch/@delete` | HTTP requests |
| `@import` | Import named exports and run default-export managed behavior setup |

Lite is limited to `@data`, `@text`, `@html`, `@bind`, `@ref`, synchronous
`@init`, `@hidden`/`@visible`, dynamic attributes, and basic element events.

## Imports

`@import` loads ES modules and adds their named exports to state. A default
function export runs once per importing element with behavior-local context and
managed cleanup. Its context includes lifecycle-bound `watch(selector,
callback, options)` with current/previous values. Comma-separated default
behaviors are independent. Behavior-local `refs.name` arrays are valid watch
selectors and invalidate on connection, removal, or DOM reordering. Paths are flexible:
- `utils` → `./utils.js` (same folder, .js added automatically)
- `modules/helpers` → `./modules/helpers.js` (subfolders work)
- `https://...` → URLs used as-is (for CDNs, GitHub raw files, etc.)
- Bare names pinned in a page `<script type="importmap">` (exact or trailing-`/`
  prefix match) are passed to `import()` unchanged so importmap-rails/Propshaft
  digests resolve

## Magic Variables

Available in expressions: `$` (querySelector), `$el`, `$event`, `$data`, `$html`, named refs such as `$form`, and—in Standard/CSP—`$get/$post/$put/$patch/$delete`.

## Important Notes

- **Functions and reactivity**: Magic variables are NOT available inside functions defined in `@data`. Pass `$data` as an argument to enable reactive updates: `@click="myFunc($data)"`
- **CSP**: Standard and Lite require `unsafe-eval`. Use `@daz4126/helium/csp` under a strict policy.
- **DOM morphing**: the Turbo adapter lets `@html` use Turbo's bundled
  `morphChildren`; otherwise Standard/CSP use a standalone `Idiomorph.morph`
  global or native `innerHTML`, while Lite always uses `innerHTML`
- **Turbo/Hotwire**: import `/turbo` (or `/csp/turbo`). `helium-turbo-adapter.js`
  re-initializes on replacing `turbo:render`s (skipping previews, re-applying
  the remembered `helium(initialState)`), never mutates the live page before a
  swap, strips stale `data-helium-generated` nodes restored from Turbo's cache,
  and keeps instances alive through page/frame/stream morphs by detaching
  rendered rows around the morph and re-applying bindings afterwards. Each
  `data-turbo-permanent` element in the page root is auto-mounted as its own
  root; outer roots skip nested live roots (`liveInstances` in `helium.js`)
- **Local state**: Standard/CSP nested `@data="{ count: 0 }"` shadows root values for one subtree; Lite remains global-state-only

## Creating Custom Variants

Use `createHelium()` to create variants with custom expression engines:

```javascript
import { createHelium } from '@daz4126/helium';

const { helium, heliumTeardown, mount } = createHelium({
  engine: {
    compile(expr, withReturn) {
      // Return { execute(scope), getIds() }
    },
    createScope(ctx) {
      // Return scope object for expression execution
    }
  }
});
```

## Testing Patterns

```javascript
describe('Feature', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    container.setAttribute('data-helium', '');
    document.body.appendChild(container);
  });

  afterEach(() => {
    window.heliumTeardown?.();
    document.body.innerHTML = '';
  });

  it('should work', async () => {
    container.innerHTML = '<div @text="count"></div>';
    const state = await helium({ count: 5 });
    expect(container.querySelector('div').textContent).toBe('5');

    // Updates are batched onto a microtask; await a tick before asserting
    // on the DOM after a mutation (setTimeout(0) also covers @if/@for
    // content, which the MutationObserver processes asynchronously).
    state.count = 6;
    await new Promise(r => setTimeout(r, 0));
    expect(container.querySelector('div').textContent).toBe('6');
  });
});
```

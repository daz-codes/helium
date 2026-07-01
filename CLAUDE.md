# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Helium is an ultra-light reactive library that makes HTML interactive using declarative attributes. The Standard production build is about 5.99KB minified/gzipped. Its source entry points require no build step and work directly in the browser.

## Commands

```bash
npm test          # Run tests in watch mode (Vitest)
npm run test:ui   # Run tests with interactive UI dashboard
npm run test:run  # Run tests once (CI mode)
npm run build     # Generate minified, self-contained bundles in dist/
npm run size      # Report raw, gzip, and Brotli sizes
npm run test:dist # Smoke-test every generated production bundle
npm run check     # Run tests, build, and enforce size budgets
```

There is no consumer build requirement; the source files are browser-ready ES
modules. The maintainer build generates the optimized `dist/` entry points.

## Architecture

### Core Concepts

- **Three browser-ready core builds**: Standard (`helium.js`), Lite (`helium-lite.js`), and CSP (`helium-csp.js` plus `jexpr.js`)
- **Optional SSE add-ons**: `helium-sse.js` and `helium-csp-sse.js`
- **Proxy-based reactivity**: Uses JavaScript Proxy to intercept state changes and trigger DOM updates
- **Attribute-driven**: Interactivity is declared via `@` prefixed HTML attributes (with `data-he-*` aliases for HTML validation)
- **Expression compilation**: Inline expressions are compiled to functions using `new Function()` with caching
- **Pluggable expression engine**: Use `createHelium()` to create variants with custom expression engines
- **Independent roots**: `helium.mount(root, state)` returns `{ state, unmount }`; existing automatic and `helium(state)` initialization remain supported
- **Keyed row scopes**: Standard/CSP support `<template @for="item, index in items" :key="item.id">`; aliases are local to each row and Lite excludes the feature

### Data Flow

```
HTML parsed → processElements() registers bindings → expressions compiled (cached)
→ initial applyBinding() updates DOM → state changes via Proxy → triggers bound updates
→ MutationObserver watches for new content → processes dynamically added elements
```

### Key Internal Components

- **Reactive state**: Each mounted instance returns its own proxy state object
- **Bindings registry**: `HELIUM.bindings` - maps state properties to UI update functions
- **Expression cache**: Compiled functions are cached to avoid recompilation
- **MutationObserver**: Automatically processes dynamically added elements
- **WeakMaps/WeakSets**: Used for listener tracking and processed element tracking (memory-efficient)

### File Structure

- `helium.js` / `helium-lite.js` / `helium-csp.js` - Browser-ready source builds
- `helium-sse.js` / `helium-csp-sse.js` - Optional SSE entry points
- `dist/*.min.js` - Generated minified, self-contained production builds
- `jexpr.js` - CSP expression parser
- `scripts/build.mjs` / `scripts/size.mjs` - Production build and size-budget pipeline
- `*.test.js` - Vitest suites for each build and the parser
- `vitest.config.js` - Test configuration (jsdom environment, globals enabled)

### Exports

```javascript
import helium from '@daz4126/helium';
import { createHelium } from '@daz4126/helium';
import heliumWithSSE from '@daz4126/helium/sse';

const app = await helium.mount('#app', { count: 0 });
app.unmount();
```

## Key Directives

| Directive | Purpose |
|-----------|---------|
| `@data` | Initialize state: `@data="{ count: 0 }"` |
| `@text` | Bind text content |
| `@html` | Bind HTML content (use with caution for XSS) |
| `@for` + `:key` | Keyed `<template>` iteration in Standard/CSP; excluded from Lite |
| `@bind` | Two-way binding; supports `.number`, `.trim`, and `.lazy` modifiers |
| `@hidden/@visible` | Conditional visibility |
| `:attribute` | Dynamic attribute binding |
| `@click/@input/etc` | Event handlers (supports modifiers like `.prevent`, `.once`, `.debounce`) |
| `@ref` | Element reference (accessed as `$refName`) |
| `@calculate` | Computed properties |
| `@effect` | Side effects on state changes |
| `@get/@post/@put/@patch/@delete` | HTTP requests |
| `@import` | Import ES modules: `@import="utils"` or `@import="https://cdn.example.com/lib.js"` |

## Imports

`@import` loads ES modules and adds their named exports to state. Paths are flexible:
- `utils` → `./utils.js` (same folder, .js added automatically)
- `modules/helpers` → `./modules/helpers.js` (subfolders work)
- `https://...` → URLs used as-is (for CDNs, GitHub raw files, etc.)

## Magic Variables

Available in expressions: `$` (querySelector), `$el`, `$event`, `$data`, `$html`, named refs such as `$form`, and—in Standard/CSP—`$get/$post/$put/$patch/$delete`.

## Important Notes

- **Functions and reactivity**: Magic variables are NOT available inside functions defined in `@data`. Pass `$data` as an argument to enable reactive updates: `@click="myFunc($data)"`
- **CSP**: Standard and Lite require `unsafe-eval`. Use `@daz4126/helium/csp` under a strict policy.
- **Idiomorph integration**: If Idiomorph is loaded, Helium automatically uses it for efficient DOM morphing
- **Turbo/Hotwire**: Automatic integration via `turbo:before-render` and `turbo:render` events

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
    await helium({ count: 5 });
    expect(container.querySelector('div').textContent).toBe('5');
  });
});
```

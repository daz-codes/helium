# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Helium is an ultra-light (~3KB minified/gzipped) reactive library that makes HTML interactive using declarative attributes. It requires no build step and works directly in the browser.

## Commands

```bash
npm test          # Run tests in watch mode (Vitest)
npm run test:ui   # Run tests with interactive UI dashboard
npm run test:run  # Run tests once (CI mode)
```

There is no build step - `helium.js` is the single-file library used directly.

## Architecture

### Core Concepts

- **Single-file library**: All code lives in `helium.js` (minified/golfed for size)
- **Proxy-based reactivity**: Uses JavaScript Proxy to intercept state changes and trigger DOM updates
- **Attribute-driven**: Interactivity is declared via `@` prefixed HTML attributes (with `data-he-*` aliases for HTML validation)
- **Expression compilation**: Inline expressions are compiled to functions using `new Function()` with caching
- **Pluggable expression engine**: Use `createHelium()` to create variants with custom expression engines

### Data Flow

```
HTML parsed → processElements() registers bindings → expressions compiled (cached)
→ initial applyBinding() updates DOM → state changes via Proxy → triggers bound updates
→ MutationObserver watches for new content → processes dynamically added elements
```

### Key Internal Components

- **Global state**: `HELIUM.state` - single proxy object holding all reactive state
- **Bindings registry**: `HELIUM.bindings` - maps state properties to UI update functions
- **Expression cache**: Compiled functions are cached to avoid recompilation
- **MutationObserver**: Automatically processes dynamically added elements
- **WeakMaps/WeakSets**: Used for listener tracking and processed element tracking (memory-efficient)

### File Structure

- `helium.js` - Main library implementation
- `helium.test.js` - Comprehensive test suite
- `vitest.config.js` - Test configuration (jsdom environment, globals enabled)

### Exports

```javascript
import helium from 'helium';           // Default helium function
import { createHelium } from 'helium'; // Factory for custom variants
```

## Key Directives

| Directive | Purpose |
|-----------|---------|
| `@data` | Initialize state: `@data="{ count: 0 }"` |
| `@text` | Bind text content |
| `@html` | Bind HTML content (use with caution for XSS) |
| `@bind` | Two-way binding for inputs |
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

Available in all expressions: `$` (querySelector), `$el` (current element), `$event`, `$data` (reactive state), `$html` (create elements), `$refs`, `$get/$post/$put/$patch/$delete`.

## Important Notes

- **Functions and reactivity**: Magic variables are NOT available inside functions defined in `@data`. Pass `$data` as an argument to enable reactive updates: `@click="myFunc($data)"`
- **CSP**: Library uses `new Function()` which requires `unsafe-eval` if using strict Content Security Policy. For CSP-safe environments, see the [Xenon](https://github.com/daz-codes/xenon) variant.
- **Idiomorph integration**: If Idiomorph is loaded, Helium automatically uses it for efficient DOM morphing
- **Turbo/Hotwire**: Automatic integration via `turbo:before-render` and `turbo:render` events

## Creating Custom Variants

Use `createHelium()` to create variants with custom expression engines:

```javascript
import { createHelium } from 'helium';

const { helium, heliumTeardown } = createHelium({
  engine: {
    compile(expr, withReturn) {
      // Return { execute(scope), getIds() }
    },
    createScope(ctx) {
      // Return scope object for expression execution
    }
  },
  prefix: 'my',      // For data-my-* attributes
  rootAttr: 'mylib'  // For @mylib / data-mylib root element
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

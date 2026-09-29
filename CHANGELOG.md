# Changelog

## 1.0.0-rc.5 — 2026-09-29

### Security

- Name-derived HTTP params (`<input name="user[name]" @post>`) and the
  `@params="a:b:value"` shorthand no longer interpolate the element's value
  into a compiled expression. A value containing a quote could previously
  execute as code; apostrophes (`O'Brien`) produced a broken request body.
  Single-key names now send the element's own value rather than a state
  variable called `value`.

### Changed

- The Turbo adapters no longer tear Helium down before every visit:
  - the live page is not emptied at `turbo:before-cache`; generated `@for`/`@if`
    nodes are marked `data-helium-generated` and stale cached copies are
    discarded on restore;
  - cached previews are not initialized, so `@init` runs once per visit;
  - state passed to `helium(initialState)` is re-applied after every render;
  - page, frame, and stream morphs keep the instance, rendered rows, and
    client-side state alive, re-applying bindings over the morphed markup;
  - `data-turbo-permanent` elements in the page root become independent roots
    whose state survives navigation.
- A live Helium root nested inside another root is now skipped by the outer
  instance.

### Fixed

- Tearing down or re-initializing now removes `@for` rows even when the list
  expression reads no state.

- `@import` now honors page import maps: a bare name pinned in a
  `<script type="importmap">` (exactly or by a trailing-slash prefix) is passed
  to `import()` unchanged instead of being rewritten to a page-relative
  `./name.js` URL. This makes importmap-rails pins and digested Propshaft assets
  work. Unpinned names keep their existing page-relative resolution.

## 1.0.0 — 2026-07-18

Helium 1.0 is the first stable release of the HTML-first reactive runtime.

### Highlights

- Declarative state, bindings, events, keyed `@for`, `@if`, local `@data`,
  refs, HTTP actions, and CSP-safe builds.
- Reusable lifecycle-aware `@import` behaviors with independent composition,
  behavior-local refs and queries, `AbortSignal`, async setup/cleanup, and
  programmatic `watch()` with previous values and observable ref collections.
- Unified lifecycle, binding, event, import, watch, and request error handling.
- Request cancellation, success/error hooks, loading restoration, latest-request
  handling, and optional required-CSRF enforcement.
- HTTP attributes now default to `latest: true`: a new request from the same
  method attribute cancels its in-flight predecessor. Programmatic request
  helpers remain concurrent unless `latest` is explicitly enabled.
- Optional Turbo 8 adapters for restoration caching, morph refreshes, Frames,
  Streams, and explicitly mounted `data-turbo-permanent` roots.
- A standalone 2.6KB Lite runtime for common bindings, form values, toggles,
  basic events, singular refs, and synchronous initializer cleanup.
- `@html` reuses Turbo's bundled child morphing when available, with standalone
  Idiomorph and native `innerHTML` fallbacks.
- Stable source and minified package entry points, normalized mount/teardown
  exports, TypeScript declarations, and packed-consumer verification.
- Consolidated per-element lifecycle records, lazy diagnostic context creation,
  compact compile-warning deduplication, and tighter production size budgets.
- Removed the legacy bare `data-he` state alias and `defaultTeardown` export;
  use `data-he-data` and `heliumTeardown`.

### Release verification

- 410 unit and DOM integration tests.
- Production bundle smoke tests and enforced gzip budgets.
- TypeScript consumer compilation and clean tarball installation.
- Real Turbo 8 coverage in Chromium, Firefox, and WebKit.

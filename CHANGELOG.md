# Changelog

## 1.0.0 — not yet released

Helium 1.0 will be the first stable release of the HTML-first reactive runtime.
It is currently published as release candidates on the `next` dist-tag
(`npm install @daz4126/helium@next`); `latest` remains 0.31.0 until 1.0.0
ships. This section summarizes the 1.0 line; the entries below it record what
changed in each candidate.

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
- Optional Turbo 8 adapters that keep pages interactive until Turbo swaps them,
  skip cached previews, keep state through page, frame, and stream morphs, and
  give `data-turbo-permanent` elements their own lasting state.
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

Checked for each candidate by `npm run check:ci`:

- 429 unit and DOM integration tests (Standard, CSP, Lite, parser).
- Production bundle smoke tests and enforced gzip budgets.
- TypeScript consumer compilation and clean tarball installation.
- Real Turbo 8 coverage in Chromium, Firefox, and WebKit.
- A Rails-style application scenario run on the packed tarball in all three
  browsers: import-map pins, Turbo navigation and cache restores, plain and
  Helium forms with server validation and CSRF, Frames, Streams, morph
  refreshes, permanent elements, and imported behaviors.

## 1.0.0-rc.7 — 2026-10-01

### Fixed

- CSP builds now run every part of a comma expression inside parentheses,
  ternary branches, call arguments, and arrow-function bodies
  (`ok ? (a = 1, b = 2) : 0`, `items.forEach(i => (i.x = 1, i.y = 2))`).
  Previously only the first part ran, silently. Top-level `a = 1, b = 2`
  already worked.
- The CSP expression parser now rejects input left over after a complete
  expression (`a = 1 b = 2`, `a + 1 )`) with a compile warning, instead of
  silently running the first part.

## 1.0.0-rc.6 — 2026-09-29

### Documentation

- Supported browsers are documented: Chrome/Edge 92+, Firefox 90+, and Safari
  15.4+ for every build. `npm run check` now enforces this floor.
- CDN and npm examples are pinned to this exact release instead of an
  unversioned GitHub path, and a check keeps them in step with `package.json`.

### Testing

- `npm run test:app` drives a representative Rails-style application built on
  the packed package through navigation, forms, and imported behaviors in
  Chromium, Firefox, and WebKit. It is part of `npm run check:ci`.

### Fixed

- Editing an item of a local `@data` list in place (`items[0].name = 'Grace'`,
  nested edits, or deleting a property) re-renders its `@for` row again. This
  regressed with the unchanged-write fix below and never worked for nested
  local edits.
- Mounting a root inside a running root now hands that subtree to the new
  instance instead of both handling its events and bindings; unmounting the
  inner root hands it back. Mounting a root that is already mounted, or inside
  another root's rendered `@for`/`@if` output, is rejected with an error.
  Ownership is re-checked after every asynchronous step (imports, deferred
  binding application, initializers), so mounts started concurrently, or a
  remount while a previous hand-back is still pending, also end with a single
  owner.
- CSP builds keep operator precedence for postfix `++`/`--`: `count++ * 2` now
  gives 6 for `count = 3`, as in JavaScript, and update operators convert
  strings to numbers.
- An element moved into a different local `@data` scope re-binds to that scope
  immediately.

- Deleting a nested property (`delete state.user.name`) now updates bindings
  that read an ancestor (`user.name ?? 'missing'`, `Object.keys(user)`). Local
  `@data` state now reacts to deletions too, and `delete localKey` in a
  Standard expression removes the local key instead of a same-named global.
- Writing an unchanged value to local `@data` state no longer re-triggers its
  bindings, so a local `@calculate` that writes its own input (for example
  `@calculate:n="Math.min(n, 10)"`) no longer hits the infinite-update guard.
- A Standard binding whose first evaluation throws (`user.name` before `user`
  exists) now records the state it read, so assigning `user` later renders it.

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

## 1.0.0-rc.1 to 1.0.0-rc.4 — 2026-02-10 to 2026-07-14

Earlier candidates. Their changes are folded into the 1.0.0 summary above.

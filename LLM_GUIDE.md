# Helium LLM Guide

Use this guide when generating Helium markup. Helium connects reactive state to
HTML through attributes and runs directly in the browser without compilation.

## Core rules

- Use `@directive` or its `data-he-directive` alias.
- Define initial state with `@data` / `data-he-data`, or pass it to `helium({...})`.
- Use `@text` for plain text and `@html` only for trusted or sanitized HTML.
- Directive values are single expressions, not top-level statement lists. Use
  modifiers such as `@submit.prevent` and move multi-step work into a function.
- In Standard/CSP, root `@data` initializes mounted root state and nested
  `@data` creates element-local state. Lite always uses root state.

```html
<main data-helium @data="{ count: 0, name: 'Helium' }">
  <button @click="count++">Increment</button>
  <p @text="name + ': ' + count"></p>
</main>
```

## Mounting

Single-root pages can rely on automatic initialization or call
`helium(initialState)`. In Standard/CSP, mount independent roots explicitly:

```javascript
const app = await helium.mount("#app", { count: 0 })
app.state.count++
app.unmount()
```

Each explicit mount owns its state, bindings, listeners, observer, refs, and
cleanup. `unmount()` is idempotent. There is currently no shared store between
mounted roots. Disconnecting a mounted root or a connected ancestor triggers
automatic teardown; a synchronous move between connected parents does not.

Standard/CSP also reconcile directives added, replaced, or removed on retained
elements. Lite initializes newly inserted elements but does not observe
attribute changes. For programmatic attribute changes, use `data-he-*` names because
DOM `setAttribute()` may reject `@` names:

```javascript
button.setAttribute("data-he-click", "save()")
button.removeAttribute("data-he-click")
```

## Directives

### State and rendering

```html
<div @data="{ open: false, items: [] }"></div>
<span @text="open ? 'Open' : 'Closed'"></span>
<div @html="trustedHtml"></div>
```

- `@data` / `data-he-data`: declare root state when used on the mounted root;
  in Standard/CSP, nested `@data` declares element-local state. Lite treats all
  `@data` as root state.
- `@text` / `data-he-text`: set `textContent` reactively.
- `@html` / `data-he-html`: set `innerHTML` reactively.
- `@for` / `data-he-for`: Standard/CSP keyed iteration on a `<template>`; use
  `:key` with a stable unique value. It is not included in Lite.
- `@if` / `data-he-if`: Standard/CSP conditional rendering of a `<template>`'s
  content. Truthy inserts, falsy removes and cleans up (listeners, bindings,
  `@init` cleanup). Not included in Lite; not combinable with `@for` on the
  same template — nest templates instead.
- `@hidden` / `@visible`: toggle the element's `hidden` property. Unlike
  `@if`, the content stays in the DOM and its bindings stay live.

### Keyed lists (Standard/CSP)

```html
<template @for="item, index in items" :key="item.id">
  <p>
    <span @text="index + 1"></span>
    <span @text="item.name"></span>
    <button @click="item.done = !item.done">Toggle</button>
  </p>
</template>
```

The row aliases are available to all Helium expressions inside the cloned
template. Keys must be stable and unique. Helium preserves DOM identity while
moving keyed rows and runs row cleanup when a key is removed.

### Element-local state (Standard/CSP)

```html
<section @data="{ count: initialCount, total: 0 }">
  <button @click="count++">Increment</button>
  <span @text="count"></span>
  <i @calculate:total="count * 2"></i>
  <span @text="total"></span>
</section>
```

The object is evaluated once against the parent scope. A local key is visible on
the declaring element and below it. Nested data objects inherit outer values and
writes target the nearest data object that declares the key. Declare `@bind` and
`@calculate` targets in the object when they should stay local. `$data` exposes
the scoped view inside the subtree; the state returned by `helium()` remains the
root state and does not contain local values. Lite resolves all names against
its mounted root state.

### Two-way binding

```html
<input @bind="name">
<input type="number" @bind.number="age">
<input @bind.trim="name">
<input @bind.lazy="search">
<input type="checkbox" @bind="agreed">
```

`@bind.number` converts non-empty numeric input to a number, `.trim` removes
leading/trailing whitespace, and `.lazy` updates on `change` instead of every
`input` event. Modifiers can be combined in any order. Text inputs, textareas,
checkboxes, radios, and selects are supported. Nested paths work
(`@bind="user.name"`) as long as the parent object already exists in state.

### Computed values and effects

```html
<div @calculate:total="price * quantity"></div>
<div @effect:total="saveTotal(total)"></div>
<div @effect:*="logState($data)"></div>
```

- `@calculate:name`: store a reactive derived value in `name`.
- `@effect:key`: run an expression when the listed state key changes.
- `@effect:*`: run when any state key changes.

### Dynamic attributes

```html
<button :disabled="!isValid">Save</button>
<div :class="{ active: selected, 'has-error': !!error }"></div>
<div :style="{ width: width + '%', backgroundColor: color }"></div>
```

The validator-friendly form is `data-he-attr:name`, such as
`data-he-attr:disabled="!isValid"`.

### Events

```html
<button @click="count++">Increment</button>
<form @submit.prevent="save()"></form>
<input @input.debounce:300="search = $event.target.value">
<div @scroll.window.throttle:100="measure()"></div>
<input @keydown.ctrl.enter="submit()">
<div @click.outside="open = false"></div>
<button @click.self="select()"><span>Select</span></button>
```

Event aliases use `data-he-<event>`, for example
`data-he-click="count++"`. Supported modifiers include `prevent`, `stop`,
`once`, `outside`, `document`, `window`, `self`, `capture`, `passive`,
`debounce[:milliseconds]`, `throttle[:milliseconds]`, modifier keys, and
keyboard key names. Throttle is leading plus trailing and defaults to 300ms.
`.passive.prevent` is invalid and the listener is not registered.

### Refs and initialization

```html
<form @ref="form"></form>
<button @click="$form.reset()">Reset</button>
<div @ref="item"></div>
<div @ref="item"></div>
<button @click="console.log($refs.item)">Log items</button>
<div @init="startClock($el)"></div>
```

`@ref="form"` exposes the first scoped element as `$form`; `$refs.form` is an
array of all matching refs in current DOM order. Ref names resolve from the
nearest local `@data` scope outward. If an `@init` expression returns a
function, Helium calls it when the element is removed or the instance is torn
down. Cleanup also runs when that initializer attribute is replaced or removed.

For reusable imperative behavior, give an imported module a default setup
export. `@import` owns one behavior instance per element and passes explicit
context:

```html
<div @import="feature"><button @ref="trigger"></button></div>
```

```javascript
export default function connectFeature({ element, data, refs, query, signal, dispatch }) {
  const trigger = refs.trigger[0]
  trigger.addEventListener("click", () => { data.open = !data.open }, { signal })
  return () => destroyWidget(query(".widget"))
}
```

The context also includes `root` and `scope`. Each `refs.name` read returns the
current DOM-ordered local array; `query(selector)` and `query.all(selector)` are
bounded to the behavior and do not enter nested managed-import behaviors.
Comma-separated imports compose independently: changing
`@import="feature,analytics"` to `@import="analytics"` cleans only `feature`
without reconnecting `analytics`. Named exports still become expression state.

Managed behavior context also supplies `watch(selector, callback, options)`.
The selector may close over `data` or receive it as an argument. The callback
receives `(current, previous)`, defaults to running only after the first change,
and can opt into setup execution with `{ immediate: true }`. Dependencies are
retracked, synchronous writes are batched, and `Object.is` suppresses unchanged
selector results. A custom `equals` function or `equals: false` can override
that. `watch()` returns an idempotent stop function and automatically stops all
subscriptions when its owning import behavior disconnects.

Behavior-local refs are observable with the same selector API:

```javascript
watch(() => refs.item, (items, previousItems) => reconcile(items, previousItems))
```

This works for initially empty collections and reruns when matching refs
connect, disconnect, reorder, or move across a nested managed-behavior boundary.
Current and previous arrays are in DOM order; unrelated ref/DOM changes are
suppressed. Expression `$refs` remains a read-only-on-demand helper rather than
an expression-level watch source.

Named setup exports can still be invoked explicitly with a namespaced
initializer, for example
`@import="feature" @init:feature="connectFeature($el, $data, $refs)"`.

Namespaced initializers such as `@init:editor` and `@init:tooltip` allow
multiple independent setup/cleanup lifecycles on one element. Replacing or
removing one attribute cleans up only that initializer. The validator- and
DOM-friendly form is `data-he-init:name`.

Each initializer has a private `$signal`. Pass it explicitly to imported setup:

```html
<div @init:feature="connectFeature($el, $data, $refs, $signal)"></div>
```

The signal aborts before cleanup on initializer or lifecycle-import
replacement/removal, element disconnection, or root unmount. Setup can return
cleanup or a promise resolving to cleanup. Mounting does not wait for that
promise. A late cleanup from stale setup runs immediately; cleanup promises are
observed for rejection. Expected `AbortError` rejection after signal
cancellation is ignored.

For centralized failures, create an instance with
`createHelium({ root, handleError, debug, requireCsrf })`; CSP uses
`createCSPHelium()`. Lite has synchronous `@init` setup/cleanup but no factory,
namespaces, signal, async lifecycle, or configurable error hook. The hook receives `(error, context)` for
`setup`, `cleanup`, `watch`, `binding`, `event`, `import`, and `request` phases. Context
contains the owning root and relevant element, directive, expression, signal,
event, module path, or request method/URL.

## HTTP and imports

Standard and CSP support HTTP directives, request helpers, and `@import`. Lite
does not. SSE is optional: import `@daz4126/helium/sse` or
`@daz4126/helium/csp/sse` when a page consumes event streams. Turbo navigation,
morphing, and Stream responses are optional through `/turbo`, `/turbo/sse`,
`/csp/turbo`, and `/csp/turbo/sse`.

```html
<button @get="/api/items" @target="#items">Load</button>
<button @click="$post('/api/items', { name }, '#result')">Create</button>
<div @import="utils,dropdown"></div>
```

Bare `@import` names pinned in the page's import map (e.g. importmap-rails) are
passed to `import()` unchanged; other bare names resolve to `./name.js` relative
to the page.

Named exports are added to state. A module's default function is managed setup
and receives `{ element, root, scope, data, refs, query, watch, signal, dispatch }`.

`$get`, `$post`, `$put`, `$patch`, and `$delete` return promises. HTTP directive
configuration uses `@target`, `@params`, `@template`, `@loading`, `@options`,
`@success`, and `@error`. Hooks receive `$response`/`$error` plus `$request`.
Attribute requests are latest-wins and abort on directive/element/root teardown;
programmatic options accept `signal`, `latest`, callbacks, and fetch options.
Loading content is restored on failure/cancellation. `requireCsrf` may be enabled
per instance or request for same-origin state-changing methods.

## Magic values

This full set applies to Standard/CSP. Lite provides `$data`/`state`, `$el`,
`$event`, `$refs` and singular named refs, and `$`.

- `$data`: current reactive state.
- `$el`: element owning the expression.
- `$root`: actual root element owned by the Helium instance.
- `$scope`: nearest local `@data` element, or `$root` when none exists.
- `$event`: current event.
- `$response`, `$error`, `$request`: available inside HTTP lifecycle hooks.
- `$dispatch(name, detail, options)`: dispatch a bubbling, cancelable
  `CustomEvent` from `$el` and return it. Options may override `target`,
  `bubbles`, and `cancelable`.
- `$`: `document.querySelector`; also provides `$.all`, `$.root`,
  `$.root.all`, `$.scope`, and `$.scope.all`.
- `$html`: create one DOM node from an HTML string.
- `$name`: first scoped element declared with `@ref="name"`.
- `$refs.name`: array of every matching ref in the nearest defining scope.
- `$get` / `$post` / `$put` / `$patch` / `$delete`: Standard/CSP requests.

Magic values are expression locals. Functions stored in state do not capture
them; pass required values explicitly, such as `save($data, $form)`.

## Build selection

- Standard: complete core API and native JavaScript expressions; requires
  `unsafe-eval` under CSP.
- Lite: a standalone one-root runtime for state, text/HTML, form binding,
  visibility, dynamic attributes, basic element events, singular refs, and
  synchronous `@init` cleanup. It has no factories, local state, structures,
  calculations/effects, rich lifecycle, HTTP, imports, Turbo, or SSE, and
  requires `unsafe-eval`.
- CSP: complete directives and server features without `unsafe-eval`, using a
  custom single-expression parser. It does not support arbitrary statements or
  the `new` keyword; use `$Date(...)` and `$FormData(...)`. Expressions see
  only side-effect-free builtins (`Math`, `JSON`, `Object`, …) — `window`,
  `document`, `fetch`, storage, timers, and dialogs are unreachable unless the
  page opts them in with `allowGlobals({ localStorage, fetch })`
  (`allowGlobals({ fetch: undefined })` revokes).
- SSE: optional Standard and CSP entry points add event-stream parsing and
  reconnect support without increasing the base builds.
- Turbo: optional Standard and CSP entry points own navigation lifecycle,
  structural cache cleanup, Turbo morphing/Streams, and compose with SSE.

## Current limitations

There is no expression-level `$watch`, `$nextTick`, or cross-root shared store.
Use `@effect` for HTML-first side effects and managed behavior `watch()` when a
private reusable behavior needs selector-based current/previous values.

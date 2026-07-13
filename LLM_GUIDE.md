# Helium LLM Guide

Use this guide when generating Helium markup. Helium connects reactive state to
HTML through attributes and runs directly in the browser without compilation.

## Core rules

- Use `@directive` or its `data-he-directive` alias.
- Define initial state with `@data` / `data-he-data`, or pass it to `helium({...})`.
- Use `@text` for plain text and `@html` only for trusted or sanitized HTML.
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
`helium(initialState)`. For independent roots, mount each selector or element
explicitly:

```javascript
const app = await helium.mount("#app", { count: 0 })
app.state.count++
app.unmount()
```

Each explicit mount owns its state, bindings, listeners, observer, refs, and
cleanup. `unmount()` is idempotent. There is currently no shared store between
mounted roots.

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
down.

## HTTP and imports

Standard and CSP support HTTP directives, request helpers, and `@import`. Lite
does not. SSE is optional: import `@daz4126/helium/sse` or
`@daz4126/helium/csp/sse` when a page consumes event streams.

```html
<button @get="/api/items" @target="#items">Load</button>
<button @click="$post('/api/items', { name }, '#result')">Create</button>
<div @import="utils"></div>
```

`$get`, `$post`, `$put`, `$patch`, and `$delete` return promises. HTTP directive
configuration uses `@target`, `@params`, `@template`, `@loading`, and `@options`.

## Magic values

- `$data`: current reactive state.
- `$el`: element owning the expression.
- `$root`: actual root element owned by the Helium instance.
- `$scope`: nearest local `@data` element, or `$root` when none exists.
- `$event`: current event.
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
- Lite: the shared Helium global-state reactive core without local `@data`, keyed
  `@for`, HTTP, imports, Turbo, or SSE; also requires `unsafe-eval`.
- CSP: complete directives and server features without `unsafe-eval`, using a
  custom single-expression parser. It does not support arbitrary statements or
  the `new` keyword; use `$Date(...)` and `$FormData(...)`. Expressions see
  only side-effect-free builtins (`Math`, `JSON`, `Object`, …) — `window`,
  `document`, `fetch`, storage, timers, and dialogs are unreachable unless the
  page opts them in with `allowGlobals({ localStorage, fetch })`
  (`allowGlobals({ fetch: undefined })` revokes).
- SSE: optional Standard and CSP entry points add event-stream parsing and
  reconnect support without increasing the base builds.

## Current limitations

There is no `$watch`, `$nextTick`, or cross-root shared store. `@effect` with
explicit keys covers most `$watch` use cases.

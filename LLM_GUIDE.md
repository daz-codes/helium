# Helium LLM Guide

Use this guide when generating Helium markup. Helium connects reactive state to
HTML through attributes and runs directly in the browser without compilation.

## Core rules

- Use `@directive` or its `data-he-directive` alias.
- Define initial state with `@data` / `data-he-data`, or pass it to `helium({...})`.
- Use `@text` for plain text and `@html` only for trusted or sanitized HTML.
- State is one namespace per mounted Helium instance; `@data` does not create a
  nested component scope.

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

- `@data` / `data-he-data`: merge an object into state.
- `@text` / `data-he-text`: set `textContent` reactively.
- `@html` / `data-he-html`: set `innerHTML` reactively.
- `@for` / `data-he-for`: Standard/CSP keyed iteration on a `<template>`; use
  `:key` with a stable unique value. It is not included in Lite.
- `@hidden` / `@visible`: toggle the element's `hidden` property.

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
checkboxes, radios, and selects are supported.

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
<input @keydown.ctrl.enter="submit()">
<div @click.outside="open = false"></div>
```

Event aliases use `data-he-<event>`, for example
`data-he-click="count++"`. Supported modifiers include `prevent`, `stop`,
`once`, `outside`, `document`, `debounce[:milliseconds]`, modifier keys, and
keyboard key names.

### Refs and initialization

```html
<form @ref="form"></form>
<button @click="$form.reset()">Reset</button>
<div @init="startClock($el)"></div>
```

`@ref="form"` exposes the element as `$form`; there is no `$refs` object. If an
`@init` expression returns a function, Helium calls it when the element is
removed or the instance is torn down.

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
- `$event`: current event.
- `$`: `document.querySelector`.
- `$html`: create one DOM node from an HTML string.
- `$name`: an element declared with `@ref="name"`.
- `$get` / `$post` / `$put` / `$patch` / `$delete`: Standard/CSP requests.

Magic values are expression locals. Functions stored in state do not capture
them; pass required values explicitly, such as `save($data, $form)`.

## Build selection

- Standard: complete core API and native JavaScript expressions; requires
  `unsafe-eval` under CSP.
- Lite: core reactivity without keyed `@for`; also requires `unsafe-eval`.
- CSP: complete directives and server features without `unsafe-eval`, using a
  custom single-expression parser. It does not support arbitrary statements or
  the `new` keyword; use `$Date(...)` and `$FormData(...)`.
- SSE: optional Standard and CSP entry points add event-stream parsing and
  reconnect support without increasing the base builds.

## Current limitations

There is no DOM-removing `@if`, `$watch`, `$nextTick`, or local component scope.
Use `@hidden` or `@visible` for conditional visibility.

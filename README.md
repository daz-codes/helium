# 🎈 Helium 🎈

The ultra-light library that makes HTML interactive!

Here's a simple example of a button that counts the number of times it has been clicked and turns red after more than 3 clicks:

```html
<button @click="count++" :style="count > 3 && 'background: red'">
    clicked <b @text="count">0</b> times
</button>
```

It's really simple to use - just sprinkle the magic @attributes into your HTML and watch it come alive!

[Explore the Standard showcase](examples/index.html) |
[See exactly what Lite can do](examples/index-lite.html) |
[Open the persistent Todo example](examples/todo.html)

The examples use browser modules, so serve them over HTTP rather than opening
the HTML files directly with a `file://` URL:

```bash
npm run examples
```

Then open <http://127.0.0.1:3456/examples/index.html>. The same server powers
the SSE examples and their `/api/*` demo endpoints.

## Why Helium?

Helium is designed for developers who want:

- **Lightweight** - From 2.6KB minified and gzipped for Lite
- **Powerful** - Declarative JavaScript in your HTML
- **Zero build step** - Works directly in the browser with no compiling
- **Easy to learn** - If you know HTML and basic JavaScript, you're ready

## Versions

Helium comes in three core versions. Turbo navigation and SSE are optional
add-ons, so applications only ship the integration code they use:

### Helium (Standard)

The full-featured version with everything included.

- All directives (`@text`, `@html`, `@for`, `@if`, `@bind`, `@data`, `@ref`, `@calculate`, `@effect`, `@init`, etc.)
- Event handlers with modifiers
- HTTP requests (`@get`, `@post`, `@put`, `@patch`, `@delete`)
- Module imports (`@import`)
- Optional Turbo/Hotwire and Server-Sent Events (SSE) add-ons

**Best for:** Most projects where you want the full power of Helium without worrying about CSP restrictions.

```javascript
import helium from "@daz4126/helium"
```

### Helium Lite

A deliberately small, standalone runtime for common view interactions.

- Core directives (`@text`, `@html`, `@bind`, `@data`, `@ref`, `@init`,
  `@hidden`, `@visible`, and dynamic `:attributes`)
- Element event handlers with common key, `.prevent`, `.stop`, `.self`, `.once`,
  `.capture`, and `.passive` modifiers
- One global state namespace
- Synchronous setup/cleanup returned by `@init`
- No factories/multiple mounts, local `@data`, `@for`, `@if`, `@calculate`,
  `@effect`, HTTP, imports, advanced event routing, SSE, or Turbo integration

**Best for:** Simple interactive pages where you only need reactivity and don't need server communication or module imports.

```javascript
import helium from "@daz4126/helium/lite"
```

### Helium CSP

A Content Security Policy safe version that doesn't require `unsafe-eval`. It uses [jexpr](https://github.com/nicolo-ribaudo/jexpr) as its expression engine instead of `new Function()`.

- All the same directives, HTTP, and `@import` features as the standard version
- Optional Turbo/Hotwire and Server-Sent Events (SSE) add-ons
- `&&` / `||` / `??` short-circuit correctly, and optional chaining (`a?.b`) is supported
- CSP-compliant — no `unsafe-eval` needed

Because expressions run through a custom parser rather than the JS engine, a couple of syntax features differ from the standard build:

- No `new` keyword — use the `$Date(...)` and `$FormData(...)` helpers instead
- Expressions are single expressions, not arbitrary statements

Expressions also run in a **restricted scope**: only side-effect-free builtins
(`Math`, `Date`, `JSON`, `Object`, `Array`, `parseInt`, `URL`, and friends) are
available. Capability-bearing globals — `window`, `document`, `fetch`,
`localStorage`, `sessionStorage`, `navigator`, `location`, `history`, timers,
and dialogs — are not reachable from expressions, so markup injected by an
attacker can't use them to read cookies or storage. If a page legitimately
needs one, opt in explicitly by passing the reference:

```javascript
import helium, { allowGlobals } from "@daz4126/helium/csp";

allowGlobals({ localStorage, fetch });      // expose to expressions
allowGlobals({ fetch: undefined });         // revoke again
```

(`helium.allowGlobals(...)` works too when using the global script build.)
Note this reduces the attack surface but is not a sandbox: the `$get`/`$post`
helpers and `$`/`$el`/`$html` magics remain available to any expression that
can run at all.

**Best for:** Projects with strict Content Security Policies that prohibit `unsafe-eval`.

```javascript
import helium from "@daz4126/helium/csp"
```

### Comparison

| Feature | Standard | Lite | CSP |
|---------|----------|------|-----|
| Core bindings, state and events | ✅ | ✅ | ✅ |
| Multiple roots / factories | ✅ | ❌ | ✅ |
| Element-local `@data` | ✅ | ❌ | ✅ |
| Keyed `@for` | ✅ | ❌ | ✅ |
| Conditional `@if` | ✅ | ❌ | ✅ |
| Event handlers | ✅ | ✅ | ✅ |
| HTTP requests | ✅ | ❌ | ✅ |
| `@import` | ✅ | ❌ | ✅ |
| SSE | Add-on | ❌ | Add-on |
| Turbo navigation lifecycle | Add-on | ❌ | Add-on |
| CSP safe | ❌ | ❌ | ✅ |
| Approx. min+gzip size | 13.49KB | 2.60KB | 17.64KB |

Sizes are enforced against the production Terser builds with gzip level 9. The
CSP figure includes its expression parser. Turbo adds about 0.9–1.0KB (14.42KB
Standard, 18.64KB CSP); SSE produces 13.99KB Standard and 18.06KB CSP bundles. Combined Turbo+SSE builds are also
provided.

Lite is intentionally independent from Standard rather than generated by
stripping the full runtime. It keeps nested reactive state, batched bindings,
two-way form values, basic events, singular refs, synchronous initializer
cleanup, and discovery of newly inserted elements. Standard/CSP provide the
richer lifecycle and composition contract. The rest of this README describes
Standard/CSP unless a section explicitly includes Lite.

## Installation

### CDN (No build step required!)

Just import from the CDN in a script tag directly in your HTML page. The URLs
are pinned to an exact release so a page never changes underneath you; update
the version deliberately when you upgrade.

```html
<!-- Standard -->
<script type="module">
  import helium from 'https://cdn.jsdelivr.net/npm/@daz4126/helium@1.0.0-rc.6/dist/helium.min.js';
</script>

<!-- Lite -->
<script type="module">
  import helium from 'https://cdn.jsdelivr.net/npm/@daz4126/helium@1.0.0-rc.6/dist/helium-lite.min.js';
</script>

<!-- CSP -->
<script type="module">
  import helium from 'https://cdn.jsdelivr.net/npm/@daz4126/helium@1.0.0-rc.6/dist/helium-csp.min.js';
</script>

<!-- Standard + SSE -->
<script type="module">
  import helium from 'https://cdn.jsdelivr.net/npm/@daz4126/helium@1.0.0-rc.6/dist/helium-sse.min.js';
</script>

<!-- Standard + Turbo -->
<script type="module">
  import helium from 'https://cdn.jsdelivr.net/npm/@daz4126/helium@1.0.0-rc.6/dist/helium-turbo.min.js';
</script>
```

Every `/dist/*.min.js` file is self-contained. The unminified source entry
points (for example `https://cdn.jsdelivr.net/npm/@daz4126/helium@1.0.0-rc.6/helium.js`) work too and are easier to debug.

### NPM

```bash
npm install @daz4126/helium@1.0.0-rc.6
```

1.0 is in release candidates on the `next` dist-tag. Until 1.0.0 ships, a bare
`npm install @daz4126/helium` installs 0.31.0, which predates the API described
here.

Then import the version you need:

```javascript
import helium from "@daz4126/helium"         // Standard
import helium from "@daz4126/helium/lite"    // Lite
import helium from "@daz4126/helium/csp"     // CSP
import helium from "@daz4126/helium/sse"     // Standard + SSE
import helium from "@daz4126/helium/turbo"   // Standard + Turbo
import helium from "@daz4126/helium/turbo/sse" // Standard + Turbo + SSE
import helium from "@daz4126/helium/csp/sse" // CSP + SSE
import helium from "@daz4126/helium/csp/turbo" // CSP + Turbo
import helium from "@daz4126/helium/csp/turbo/sse" // CSP + Turbo + SSE
```

For a pre-minified, self-contained bundle, append `/min` to an entry point:

```javascript
import helium from "@daz4126/helium/min"
import helium from "@daz4126/helium/sse/min"
import helium from "@daz4126/helium/turbo/min"
```

The source entry points remain browser-ready ES modules, so consuming Helium
does not require a build step.

### Browser support

Every build (Standard, Lite, CSP, and the SSE and Turbo add-ons) supports:

| Browser | Minimum version |
|---------|-----------------|
| Chrome and Edge | 92 |
| Firefox | 90 |
| Safari (macOS and iOS) | 15.4 |

These are the oldest versions whose JavaScript syntax and built-ins cover all
builds; `npm run check` fails if the code starts to need anything newer. The
browser test suite runs in current Chromium, Firefox, and WebKit. Helium ships
as ES modules and does not include polyfills or a legacy build.

Resolving `@import` names through a page import map needs native import-map
support (Safari 16.4); relative paths and URLs work everywhere above.

Helium ships TypeScript declarations for every source and `/min` entry point.
They cover Lite's compact entry point plus Standard/CSP mounting, factories and
expression engines, lifecycle errors,
managed `@import` behaviors, signals, `watch()`, HTTP/SSE, and CSP globals. No
separate `@types` package is needed.

### Automatic Initialization

Helium automatically initializes on `DOMContentLoaded`, so you typically don't need to call `helium()` manually. Calling it manually to provide initial values or functions suppresses the pending automatic initialization, so your state is not replaced when the DOM becomes ready.

### Explicit Mounting

Use `helium.mount()` when a page has multiple independent Helium roots. It
accepts a selector or an element and returns the root's state plus an idempotent
`unmount()` function:

```html
<section id="counter-a">
  <button @click="count++">Increment</button>
  <span @text="count"></span>
</section>

<section id="counter-b">
  <button @click="count++">Increment</button>
  <span @text="count"></span>
</section>
```

```javascript
const a = await helium.mount("#counter-a", { count: 0 })
const b = await helium.mount("#counter-b", { count: 10 })

a.state.count++ // Updates only #counter-a
a.unmount()     // Safe to call more than once
```

Explicit roots have independent state, bindings, observers, listeners, refs,
and cleanup. Calling `mount()` suppresses the pending automatic initialization;
existing single-root pages can continue relying on auto-initialization or
calling `helium(initialState)` directly. If an external DOM owner disconnects
the mounted root (or a connected ancestor), Helium automatically performs the
same teardown. Moving the root synchronously between connected parents keeps
the instance alive. A root marked `data-turbo-permanent` also survives Turbo's
temporary parking step; if Turbo never reconnects it, Helium still tears it
down on the next task.

Explicit mounts and `createHelium()` are Standard/CSP features. Lite owns one
automatically selected root; use Standard when independent component roots or
instance configuration are required.

## Helium Attributes

Helium uses custom attributes to add interactivity to HTML elements. To identify them, they all start with `@`, although there are also data attribute aliases that can be used instead (useful for HTML validators).

### @helium

This attribute sets the automatically initialized root element. Helium
attributes are processed on that element and its children. If it is omitted,
automatic initialization defaults to `document.body`. Explicit
`helium.mount()` roots do not need this attribute.

```html
<div @helium>
  <!-- All Helium attributes work here -->
</div>
```

**Alias:** `data-helium`

### @text

Inserts the result of a JavaScript expression into the text-content of the element. This will update the textContent of the element with the value of the count variable:

```html
<b @text="count">0</b>
```

You can also use expressions. This will update the textContent of the element with the value of the name variable but in uppercase:

```html
<span @text="name.toUpperCase()">Dave</span>
```

**Alias:** `data-he-text`

### @html

Similar to `@text`, but inserts HTML content into the element's innerHTML.
Supports arrays, objects, and DOM morphing through Turbo or a standalone
Idiomorph global when available in Standard/CSP. Lite always uses native
`innerHTML` and then initializes directives in newly inserted elements.

```html
<div @html="'<strong>Bold text</strong>'"></div>
```

**Rendering Arrays:**
```html
<ul @html="items.map(item => `<li>${item}</li>`)"></ul>
```

**Security Note:** Be careful with `@html` when rendering user-generated content, as it can lead to XSS vulnerabilities. Always sanitize user input before rendering it as HTML.

**Alias:** `data-he-html`

### @for with :key

Standard and CSP can render arrays and other iterables as keyed DOM rows. Put
`@for` and `:key` on a `<template>`; Lite deliberately excludes this feature.

```html
<ul>
  <template @for="item, index in items" :key="item.id">
    <li>
      <span @text="index + 1"></span>.
      <span @text="item.name"></span>
      <button @click="item.done = !item.done">Toggle</button>
    </li>
  </template>
</ul>
```

The optional second alias is the current zero-based index:

```html
<template @for="item in items" :key="item.id">
  <!-- item is available to every Helium expression in this row -->
</template>
```

Keys must be stable and unique. When the collection changes, Helium moves and
reuses rows with matching keys, creates new rows, and removes missing rows. This
preserves element identity, focus, listeners, and `@init` lifecycle state while
still updating `item`, `index`, and normal root-state dependencies. Cleanup
functions returned by `@init` run when their keyed row is removed.

`@html="items.map(...).join('')"` remains useful for simple generated markup,
but keyed `@for` avoids HTML-string interpolation and lets each row use normal
`@text`, dynamic attributes, events, and other directives.

**Alias:** `data-he-for` (the key remains `:key`)

### @if

Standard and CSP can conditionally render a `<template>`'s content. Unlike
`@hidden`/`@visible`, which only toggle visibility, `@if` adds the content to
the DOM when the expression is truthy and fully removes it — bindings,
listeners, and `@init` cleanup included — when it becomes falsy:

```html
<template @if="loggedIn">
  <p>Welcome back, <span @text="user.name"></span>!</p>
  <button @click="logout($data)">Log out</button>
</template>
```

Content that is switched off costs nothing: its expressions never evaluate and
its listeners don't exist. Use `@if` for anything conditional-but-expensive
(modals, tab panels, admin-only markup) and `@hidden`/`@visible` for cheap
show/hide toggles where you want to preserve element state such as form input.

`@if` requires a `<template>` element (like `@for`, and like Alpine's `x-if`)
because template content is inert until inserted — that's what makes the "off"
state free. It cannot be combined with `@for` on the same template; nest one
template inside the other instead. Lite excludes this feature.

**Alias:** `data-he-if`

### @bind

Creates a 2-way binding between an input element's value and a variable. Whatever is entered in the following input field will be stored as a variable called name:

```html
<input @bind="name" placeholder="Enter your name">
```

Works with:
- Text inputs and textareas (binds to `value`)
- Checkboxes (binds to `checked`)
- Radio buttons (binds to `value`, checking the one that matches)
- Select elements (binds to `value`)

Nested paths work too — the parent object must already exist in state:

```html
<input @bind="user.name">
<p @text="user.name"></p>
```

**Examples:**
```html
<!-- Text input -->
<input @bind="username">
<p>Hello, <span @text="username"></span>!</p>

<!-- Checkbox -->
<input type="checkbox" @bind="agreed">
<span @text="agreed ? 'Agreed' : 'Not agreed'"></span>

<!-- Radio buttons -->
<input type="radio" name="color" value="red" @bind="color">
<input type="radio" name="color" value="blue" @bind="color">
<p>Selected: <span @text="color"></span></p>

<!-- Select -->
<select @bind="country">
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
</select>
```

**`.number` modifier:** append `.number` to coerce the bound value to a number
(handy for `type="number"` inputs, which otherwise bind as strings). An empty
field stays `""`, and non-numeric input is left untouched so partial typing
still works.

```html
<input type="number" @bind.number="age">
<p @text="age + 1"></p> <!-- numeric addition, not string concatenation -->
```

**`.trim` modifier:** trim leading and trailing whitespace before storing user
input in state:

```html
<input @bind.trim="name">
```

**`.lazy` modifier:** update state on the element's `change` event rather than
on every `input` event. For text fields this normally means when the edit is
committed or the field loses focus:

```html
<input @bind.lazy="search">
```

Modifiers can be combined in any order:

```html
<input @bind.lazy.trim.number="amount">
```

**Alias:** `data-he-bind` (for example `data-he-bind.lazy.trim`)

### @hidden & @visible

Makes the element hidden or visible depending on the result of a JavaScript expression.

```html
<div @visible="count > 3">Only visible if the count is greater than 3</div>
<div @hidden="count <= 3">Hidden when count is 3 or less</div>
```

**Alias:** `data-he-hidden` & `data-he-visible`

### @data

Initializes variables that can be used in JavaScript expressions. In Standard
and CSP, `@data` behaves like Alpine's `x-data`: root-level `@data` initializes
the mounted root state, while nested `@data` creates local state for that
element and its descendants. Lite always uses one global state namespace, so
every `@data` merges into root state.

```html
<main @helium @data="{ count: 100, name: 'Helium' }">
  <p @text="name + ': ' + count"></p>
</main>
```

Nested `@data` is local in Standard/CSP:

```html
<main @helium @data="{ count: 100 }">
  <section @data="{ count: 0, open: false }">
    <button @click="count++">Increment local count</button>
    <button @click="open = !open">Toggle</button>
    <p @text="count"></p>
    <p @visible="open">Local content</p>
  </section>

  <p @text="count"></p> <!-- Still 100 -->
</main>
```

The object is evaluated once in its parent context, so local defaults can use
outer values. Nested data objects inherit outer names, and assignment updates
the nearest data object that declares that name:

```html
<div @data="{ count: startingCount, label: 'outer' }">
  <div @data="{ label: 'inner' }">
    <button @click="count++">Updates the outer local count</button>
    <span @text="label"></span> <!-- inner -->
  </div>
</div>
```

Declare every name that should remain local. Assigning an undeclared name writes
to root state. The same applies to `@bind` and `@calculate` targets: declare
their target names in local `@data` when they should be local. Inside the
subtree, `$data` is the scoped state view. Local values are not returned from
`helium()` and are not included in root `@local-storage` persistence.

**Alias:** `data-he-data`

### @ref

Creates a scoped reference to an element. The first matching element is
available through `$name`, and every matching element is available as the
always-array `$refs.name` in current DOM order:

```html
<section @data="{ items: [] }">
  <ul @ref="list"></ul>
  <div @ref="row"></div>
  <div @ref="row"></div>
  <button @click="console.log($list, $refs.row)">Inspect refs</button>
</section>
```

Ref lookup starts in the nearest explicit `@data` scope and falls back through
parent scopes. A ref with the same name in a nested scope shadows the outer
name. Lite has one root scope and singular refs only: `$name` and `$refs.name`
both refer to the current element. Standard/CSP plural lookup follows current
DOM order when refs are removed or reordered.

This element can be accessed in other JavaScript expressions as `$list`:

```html
<button @click="$list.appendChild($html('<li>New item</li>'))">Add Task</button>
```

**Alias:** `data-he-ref`

### @init

A JavaScript expression that runs after the element's refs and bindings have
been registered. Use it for imperative setup that does not belong in a normal
reactive binding.

```html
<div @init="timestamp = Date.now()"></div>
<div @init="console.log('Helium initialized!')"></div>
```

If the expression returns a function, Helium owns that cleanup and calls it
when the initializer attribute is replaced or removed, the element is removed,
or the Helium root is unmounted. This is useful for timers, observers,
subscriptions, and third-party widgets:

Lite supports this synchronous setup/cleanup convention. Namespaced
initializers, `AbortSignal`, asynchronous setup/cleanup, lifecycle modules, and
managed errors in the sections below require Standard or CSP.

```html
<div @init="start_clock($el, $data)"></div>
```

```js
function start_clock(element, data) {
  const timer = setInterval(() => {
    element.textContent = new Date().toLocaleTimeString()
  }, 1000)

  return () => clearInterval(timer)
}
```

#### Lifecycle modules

For behavior too complex to keep inline, give an imported module a default
setup export. The element's `@import` is then both the declaration and the
lifecycle owner—there is no second initializer expression to repeat:

```html
<section
  @import="feature"
  @data="{ enabled: true }"
>
  <button @ref="toggle">Toggle</button>
</section>
```

```js
// feature.js
export default function connectFeature({ element, data, refs, signal }) {
  // Each refs.toggle read returns the current behavior-local array
  const toggle = refs.toggle[0]
  const listener = () => { data.enabled = !data.enabled }
  toggle.addEventListener("click", listener, { signal })

  return () => stopThirdPartyWidget(element)
}
```

The default export runs separately for every importing element, so its local
variables form a private per-element instance. Returning cleanup is the
lifecycle contract; Helium does not require a controller class or registry.
See [`@import`](#import) for its complete context and composition rules.

Named setup exports plus `@init` remain useful when the setup arguments or
activation expression should be explicit:

```html
<section @import="feature" @init:feature="connectFeature($el, $data, $refs)"></section>
```

```js
export function connectFeature(element, data, refs) {
  return () => { /* cleanup */ }
}
```

#### Namespaced initializers

Use `@init:name` when one element owns multiple independent lifecycle modules:

```html
<div
  @init:editor="connectEditor($el, $data, $refs)"
  @init:tooltip="connectTooltip($el)"
></div>
```

Each complete attribute name has an independent setup and cleanup lifecycle.
Replacing or removing `@init:tooltip` cleans up only the tooltip; removing the
element or unmounting its root cleans up both. Names are labels for lifecycle
ownership, not behavior registries, and may use letters, numbers, `_`, and `-`.

#### Cancellation and asynchronous lifecycle

Every initializer receives its own `AbortSignal` as `$signal`. Pass it to a
lifecycle module and use native signal-aware APIs where possible:

```html
<div @init:search="connectSearch($el, $data, $signal)"></div>
```

```js
export async function connectSearch(element, data, signal) {
  const response = await fetch("/search-index", { signal })
  const index = await response.json()
  const search = () => { data.results = index.search(element.value) }
  element.addEventListener("input", search, { signal })

  return async () => {
    await index.close()
  }
}
```

The signal aborts before cleanup when the complete initializer attribute—or an
individual lifecycle import—is replaced or removed, its element disconnects,
or its Helium root unmounts. Namespaced initializers and imported behaviors on
the same element receive different signals.

Setup may return cleanup directly or return a promise that resolves to cleanup.
Helium does not delay mounting while setup promises settle. If an initializer
disconnects first, its signal aborts immediately and any cleanup returned later
runs immediately instead of being attached to a stale element. Cleanup may also
return a promise; Helium observes it and reports rejection, while teardown
itself remains synchronous. An `AbortError` caused by Helium aborting that
initializer's signal is treated as expected cancellation.

#### Lifecycle errors

`createHelium()` accepts an instance-level error hook and optional debug mode:

```js
import { createHelium } from "@daz4126/helium"

const app = createHelium({
  root: "#app",
  handleError(error, context) {
    reportToService(error, context)
  },
  debug: true,
})

await app.helium({ count: 0 })
app.heliumTeardown()
```

`context.phase` is `setup`, `cleanup`, `watch`, `binding`, `event`, `import`, or
`request`. Context also includes the root and, where relevant, `element`,
`directive`, `expression`, initializer `signal`, DOM `event`, import `path`, or
request `method` and `url`. With no hook Helium reports failures to the console.
With a hook, errors go to the hook; `debug: true` additionally prints the error
and full context. CSP exports `createCSPHelium()` with the same options. Lite
does not expose a configurable factory or lifecycle error hook.

**Aliases:** `data-he-init` and namespaced forms such as
`data-he-init:tooltip`. Use the `data-he-*` form for programmatic attribute
changes because `setAttribute()` may reject names beginning with `@`.

### @calculate

Creates a computed property that automatically updates when its dependencies change. The calculated value is stored in a state variable.

```html
<div @calculate:total="price * quantity"></div>
```

This will create a `total` variable that automatically recalculates whenever `price` or `quantity` changes.

**Practical Examples:**

```html
<!-- Shopping cart total -->
<div @data="{ price: 10, quantity: 2, taxRate: 0.1 }">
  <input type="number" @bind="quantity">
  <div @calculate:subtotal="price * quantity"></div>
  <div @calculate:tax="subtotal * taxRate"></div>
  <div @calculate:total="subtotal + tax"></div>
  
  <p>Subtotal: $<span @text="subtotal"></span></p>
  <p>Tax: $<span @text="tax"></span></p>
  <p>Total: $<span @text="total"></span></p>
</div>

<!-- Full name from first and last -->
<div @data="{ firstName: 'John', lastName: 'Doe' }">
  <input @bind="firstName" placeholder="First name">
  <input @bind="lastName" placeholder="Last name">
  <div @calculate:fullName="firstName + ' ' + lastName"></div>
  <p>Hello, <span @text="fullName"></span>!</p>
</div>
```

**Alias:** `data-he-calculate`

### @effect

Runs a side effect whenever specified dependencies change. Use `:*` to run on any state change, or list specific dependencies separated by colons.

```html
<!-- Run on any state change -->
<div @effect:*="console.log('State changed:', $data)"></div>

<!-- Run when specific variables change -->
<div @effect:count:name="console.log('Count or name changed')"></div>
```

**Practical Examples:**

```html
<!-- Save to localStorage when username changes -->
<div @effect:username="localStorage.setItem('user', username)"></div>

<!-- Log analytics when count reaches threshold -->
<div @effect:count="count > 10 && console.log('Threshold reached!')"></div>

<!-- Update page title -->
<div @effect:unreadCount="document.title = `(${unreadCount}) Messages`"></div>

<!-- Multiple dependencies -->
<div @effect:firstName:lastName="console.log('Name changed:', firstName, lastName)"></div>
```

**Alias:** `data-he-effect`

### @import

`@import` has two complementary roles:

1. Every named module export is added to the mounted Helium state and becomes
   available to expressions.
2. If the module has a default function export, Helium runs it once per
   importing element as a managed behavior setup function.

```html
<div @import="utils,api">
  <button @click="formatDate(new Date())">Format Date</button>
  <p @text="API_VERSION"></p>
</div>
```

Modules are cached by resolved URL within the mounted instance, while default
setup is still run independently for every importing element.

#### Managed behavior setup

```html
<div @import="dropdown" @data="{ open: false }">
  <button @ref="trigger">Menu</button>
  <div role="menu" @ref="panel" @hidden="!open">...</div>
</div>
```

```js
// dropdown.js
export default function connectDropdown(context) {
  const { element, data, refs, query, signal, dispatch } = context
  const trigger = refs.trigger[0]

  trigger.addEventListener("keydown", event => {
    if (event.key === "Escape") data.open = false
  }, { signal })

  const widget = enhanceMenu(query("[role=menu]"))
  dispatch("dropdown:connected", { widget })

  return () => widget.destroy()
}
```

The context contains:

| Property | Meaning |
|----------|---------|
| `element` | The element carrying this `@import` |
| `root` | This Helium instance's mounted root |
| `scope` | The behavior's owning element (the local query/ref boundary) |
| `data` | Reactive data visible from the importing element |
| `refs.name` | The current DOM-ordered array of matching local refs |
| `query(selector)` | First matching descendant in this behavior |
| `query.all(selector)` | All matching descendants in this behavior |
| `watch(selector, callback, options)` | Observe a reactive selection for this behavior |
| `signal` | This behavior instance's `AbortSignal` |
| `dispatch(name, detail, options)` | Dispatch a custom event from the element |

Refs and queries do not cross into a nested element that owns its own managed
import behavior. This gives reusable modules local targets without globally
unique selectors. `refs.name` is evaluated when read, so it reflects refs that
connect, disconnect, or reorder after setup; call `query` again to inspect the
current DOM.

Setup may return cleanup or a promise resolving to cleanup. Its signal aborts
before cleanup when that module name is removed from the attribute, the whole
attribute or element is removed, or the mounted root disconnects/unmounts.
Cleanup and lifecycle errors use the same guarantees and `handleError` hook as
`@init`.

#### Programmatic watching

Managed behaviors can react to state changed anywhere in their visible data
scope without adding a separate `@effect` attribute:

```js
export default function connectMap({ element, data, watch }) {
  const map = createMap(element)

  watch(
    () => [data.latitude, data.longitude],
    ([latitude, longitude], previousPosition) => {
      map.setCenter(latitude, longitude)
    },
    { immediate: true },
  )

  return () => map.destroy()
}
```

`watch(selector, callback, options)` evaluates the selector synchronously and
tracks the Helium data it reads. The selector may close over `data`, as above,
or receive it as its argument: `watch(data => data.status, callback)`.
Conditional selectors retrack their dependencies each time they run.

The callback receives `(current, previous)`. It does not run during setup by
default, so the first change receives the setup value as `previous`. Set
`{ immediate: true }` to run it during setup with `previous` equal to
`undefined`. Synchronous state writes are batched, and callbacks run only when
the selected result changes according to `Object.is`. Pass a custom
`{ equals(current, previous) }` function, or `{ equals: false }` to run after
every tracked invalidation.

```js
const stop = watch(
  data => data.status,
  (status, previousStatus) => {
    if (previousStatus === "pending" && status === "complete") celebrate()
  },
)

stop() // optional early unsubscribe; safe to call repeatedly
```

Every watcher is also stopped automatically when its imported behavior is
removed, disconnected, or unmounted. A rejected callback promise is reported
to `handleError` with phase `watch`. Select the nested value you care about,
such as `data => data.user.name`; selecting `data.user` observes replacement of
that object rather than treating every nested mutation as a deep change.

`@effect` remains the HTML-first choice for ordinary declarative side effects.
It deliberately has no single previous-value magic: an effect may name several
dependencies, use `:*`, and run after several values change in one batch. Use a
selector-based `watch()` when previous-value semantics matter.

Ref collections are watchable through the same API, including when the initial
collection is empty:

```js
watch(
  () => refs.item,
  (items, previousItems = []) => {
    const connected = items.filter(item => !previousItems.includes(item))
    const disconnected = previousItems.filter(item => !items.includes(item))
    connected.forEach(connectItem)
    disconnected.forEach(disconnectItem)
  },
  { immediate: true },
)
```

The selector reruns when matching behavior-local refs connect, disconnect, or
change DOM order. Both arrays are DOM ordered. Unrelated DOM/ref changes are
suppressed, and nested managed behaviors retain their own ref boundary; if that
nested behavior is removed, its refs can become visible to the outer watcher.
This supplies Stimulus-style target connection results without adding separate
target callback conventions.

#### Composing behaviors

Comma-separated modules are independent behavior instances:

```html
<input @import="autocomplete,analytics">
```

Changing that value to `analytics` aborts and cleans up only `autocomplete`.
`analytics` stays connected and is not set up again. Duplicate module names in
one attribute are ignored.

Named exports are state imports, not behavior instances, and remain on the
mounted state if their module name is later removed. Use the default export for
resources that require lifecycle ownership.

**Import paths:**

| Path | Resolves to |
|------|-------------|
| `utils` | `./utils.js` |
| `modules/helpers` | `./modules/helpers.js` |
| `./utils.js` | `./utils.js` |
| `../shared/utils` | `../shared/utils.js` |
| `https://example.com/lib.js` | `https://example.com/lib.js` |

The `.js` extension is added automatically if not provided. URLs are used as-is.

**Import maps (Rails importmap-rails, Propshaft):** a bare name that matches an
entry in a `<script type="importmap">` on the page — exactly, or through a
trailing-slash prefix such as `"controllers/"` — is passed to `import()`
unchanged, so the browser resolves it through the import map. This is what makes
digested asset URLs work:

```ruby
# config/importmap.rb
pin "dropdown", to: "dropdown.js"
pin_all_from "app/javascript/behaviors", under: "behaviors"
```

```html
<div @import="dropdown">...</div>
<div @import="behaviors/tabs">...</div>
```

Names without a matching import map entry keep the page-relative resolution
shown in the table above. Only the page's top-level `imports` are consulted;
`scopes` are ignored.

#### Named exports

```javascript
// utils.js
export function formatDate(date) {
  return date.toLocaleDateString();
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
```

```javascript
// api.js
export const API_VERSION = '1.0.0';
export const API_URL = 'https://api.example.com';
```

```html
<div @import="utils,api">
  <button @click="alert(capitalize('hello'))">Capitalize</button>
  <p @text="API_VERSION"></p>
</div>
```

#### Importing from URLs

```html
<!-- Import from a CDN or GitHub -->
<div @import="https://cdn.example.com/helpers.js">
  <button @click="helper()">Use Remote Helper</button>
</div>
```

**Alias:** `data-he-import`

## Event Listeners & Handlers

Event listeners and handlers can be created by prepending `@` before the event name, for example `@click="count++"` will run the code `count++` when the element is clicked on.

```html
<button @click="count++">Increment</button>
<input @input="search = $event.target.value">
<form @submit.prevent="handleSubmit()">
```

**Common Events:**
- `@click` - Mouse click
- `@input` - Input value changed
- `@change` - Input value committed (blur for text, immediate for select/checkbox)
- `@submit` - Form submission
- `@keydown` / `@keyup` / `@keypress` - Keyboard events
- `@mouseenter` / `@mouseleave` - Mouse hover
- `@focus` / `@blur` - Focus events

### Event Modifiers

You can add modifiers by appending them with a dot (`.`) after the event name:

- **prevent** - Prevents the default browser behavior (e.g., form submission, link navigation)
- **once** - Only runs the event handler once, then removes the listener
- **outside** - Only fires when the event happens outside the element
- **document** - Attaches the listener to the document instead of the element
- **window** - Attaches the listener to `window` instead of the element
- **self** - Only fires when the element itself is the event target
- **capture** - Handles the event during the capture phase
- **passive** - Registers a native passive listener
- **debounce** - Debounces the event handler (default 300ms)
- **debounce:500** - Debounces with custom delay in milliseconds
- **throttle** - Runs immediately, then at most once per interval (default 300ms)
- **throttle:500** - Throttles with a custom interval in milliseconds
- **shift, ctrl, alt, meta** - Only fires if the modifier key is pressed
- **Key names** - For keyboard events, specify which key (e.g., `enter`, `esc`, `space`)

Throttle uses leading and trailing calls: the first matching event runs
immediately, and events received during the interval are coalesced into one
final call using the latest event. `.passive.prevent` is invalid because a
passive listener cannot cancel an event; Helium warns and does not register it.

**Examples:**

```html
<!-- Prevent form submission -->
<form @submit.prevent="handleSubmit()">
  <button>Save</button>
</form>

<!-- Run only once -->
<button @click.once="initialize()">Initialize (once)</button>

<!-- Close modal when clicking outside -->
<div @click.outside="open = false" @hidden="!open">
  <p>Click outside to close</p>
</div>

<!-- Debounced search -->
<input @input.debounce:500="performSearch()" placeholder="Search...">

<!-- Keyboard shortcuts -->
<input @keydown.enter="submit()">
<input @keydown.esc="cancel()">
<div @keydown.ctrl.s.prevent="save()">Press Ctrl+S to save</div>

<!-- Modifier keys -->
<div @click.shift="console.log('Shift+Click!')">Shift-click me</div>

<!-- Listen on document level -->
<div @keydown.document.esc="closeModal()">Press ESC anywhere</div>

<!-- Window listener with throttled updates -->
<div @resize.window.throttle:100="measureLayout()"></div>

<!-- Ignore clicks that originated in descendants -->
<button @click.self="select()"><span>Select</span></button>
```

**Alias:** Prepend the event name with `data-he-`, for example `data-he-click="count++"`

## HTTP Requests

Helium includes built-in support for making HTTP requests directly from event handlers. This makes it easy to load data, submit forms, and update parts of your page without writing fetch code.

[See some examples here](https://codepen.io/daz4126/pen/dPMVGdX)

### Available HTTP Methods

- `@get` - GET request
- `@post` - POST request
- `@put` - PUT request
- `@patch` - PATCH request
- `@delete` - DELETE request

The HTTP method is triggered by the element's default event:
- Buttons: `click`
- Forms: `submit`
- Inputs/Textareas: `input`
- Selects: `change`

**Simple Examples:**

```html
<!-- Load data on button click -->
<button @get="/api/data">Load Data</button>

<!-- Submit form -->
<form @post="/api/users">
  <input name="username">
  <button>Submit</button>
</form>

<!-- Delete on click -->
<button @delete="/api/users/123">Delete User</button>
```

### HTTP Request Attributes

Configure requests using these additional attributes:

#### @target

Specifies where to insert the response. Can be:
- A CSS selector (e.g., `#result`, `.container`)
- A ref (e.g., `$myElement`)
- A variable name (response will be stored in state)

```html
<button @get="/api/users" @target="#user-list">Load Users</button>
```

**Multiple Targets:**
You can specify multiple targets with different actions using comma-separated values:

```html
<button 
  @get="/api/stats"
  @target="#count, #chart, #message">
  Load Stats
</button>
```

#### :action

An action can be appended to the target to specify how to insert the response into the target

The following actions can all be used:

- `:replace` - Replace the entire element
- `:append` - Append to the end of the element's children
- `:prepend` - Prepend to the beginning of the element's children
- `:before` - Insert before the element
- `:after` - Insert after the element

If omitted, defaults to replacing the innerHTML.

```html
<button 
  @get="/api/users"
  @target="#user-list:append"
  Load More Users
</button>
```

#### @params

Specifies the request parameters. Can be:
- An object literal
- A reference to a variable
- FormData (automatically for forms)
- A shorthand syntax

**Object Literal:**
```html
<button 
  @post="/api/users"
  @params="{ name: username, email: email }">
  Create User
</button>
```

**Shorthand Syntax:**

You can write the params in shorthand using `:` separated string of attributes:

```html
<!-- Creates { user: { name: [this element's value] } } -->
<input @post.debounce="/api/save" @params="user:name:value">
```

The last segment is the property read from the element itself; the segments
before it are nesting keys. The value is sent as data and never evaluated.

**Magic Params Syntax:**
If the element has a `name` attribute and no `@params`, Helium sends the
element's own value under that name (`user[name]` nests as `{ user: { name } }`):

```html
<!-- Sends { username: [input value] } as the user types -->
<input name="username" @post.debounce="/api/save">
```

For checkboxes:
```html
<!-- Sends { agreed: true/false } -->
<input type="checkbox" name="agreed" @post="/api/consent">
```

**FormData Example:**
```html
<form @post="/api/upload" @params="new FormData($el)">
  <input type="file" name="avatar">
  <input type="text" name="caption">
  <button>Upload</button>
</form>
```

#### @template

A JavaScript function that transforms the response before inserting it:

```html
<button 
  @get="/api/users"
  @target="#list"
  @template="(data) => data.map(u => `<li>${u.name}</li>`).join('')">
  Load Users
</button>
```

#### @loading

Content to show while the request is in progress:

```html
<button 
  @get="/api/users"
  @target="#list"
  @loading="loadingMarkup">
  Load Users
</button>
```

If the request fails, is superseded, or is cancelled, Helium restores the
target content that existed before loading began. A successful response replaces
the loading content normally.

#### @success and @error

Run an expression after a successful response or a real request failure:

```html
<form
  @post="/profile"
  @params="new FormData($el)"
  @success="saved($response, $request)"
  @error="saveFailed($error, $request)"
>
  ...
</form>
```

`$response` is the parsed JSON/text response value. `$error` includes `status`
and `response` for a non-successful HTTP status. `$request` contains `method`,
`url`, `element`, `signal`, the raw `response`, and parsed `data`. The success
hook runs after the target update. The error hook runs after loading content has
been restored and may be asynchronous—for example, to read a 422 JSON body.

Cancellation is not an error hook: removing the request element/directive,
unmounting its Helium root, aborting an external signal, or starting a newer
request from the same HTTP attribute aborts the old request with `AbortError`
without calling `@error` or `handleError`.

#### @options

Additional fetch and Helium request options (as an object):

```html
<button 
  @get="/api/users"
  @options="{ cache: 'no-cache' }">
  Load Users
</button>
```

Fetch options such as `cache`, `mode`, `headers`, and `credentials` are forwarded
to `fetch()`. Helium-specific options are:

| Option | Meaning |
|--------|---------|
| `signal` | External `AbortSignal` linked to Helium's lifecycle signal |
| `latest` | Cancel an earlier request with the same `requestKey` |
| `requestKey` | Identity used by `latest`; HTTP attributes use their full attribute name |
| `requireCsrf` | Refuse a same-origin POST/PUT/PATCH/DELETE when no CSRF meta token exists |
| `success(data, request)` | Programmatic success callback |
| `error(error, request)` | Programmatic failure callback |

HTTP attributes default to `{ latest: true }`, preventing a slow earlier search
or save from overwriting a newer result. Programmatic helpers allow concurrent
requests unless `latest` is explicitly enabled.

**Alias:** All HTTP attributes have `data-he-` aliases:
- `data-he-target`
- `data-he-params`
- `data-he-template`
- `data-he-loading`
- `data-he-options`
- `data-he-success`
- `data-he-error`

### Server-Sent Events (optional)

SSE parsing is kept out of the core build. Select the add-on entry point when a
page needs it:

```javascript
import helium from "@daz4126/helium/sse"
// Strict CSP: import helium from "@daz4126/helium/csp/sse"
```

Use the normal HTTP directives. An explicit `@target` is applied to every SSE
message:

```html
<button @get="/api/events" @target="#events:append">Connect</button>
<div id="events"></div>
```

When `@target` is omitted, an SSE `event:` field can name a CSS selector or a
state property:

```text
event: #status
data: Connected
```

Set `retryMode` and an optional initial `retry` delay through `@options` to
reconnect after the stream closes or fails. A server-supplied `retry:` field
updates the delay and `id:` is sent back as `Last-Event-ID` on reconnection.
Retries continue at that fixed delay while the request remains mounted and
current; aborting, unmounting, or superseding the request stops the loop. Helium
1.0 does not impose an attempt limit or add client-side exponential backoff.

```html
<button @get="/api/events"
  @target="#events:append"
  @options="{ retryMode: 'error', retry: 3000 }">
  Connect
</button>
```

### Complete Example

```html
<form
  @post="/api/users"
  @params="{ name: username, email: email }"
  @target="#result"
  @loading="'Saving...'"
>
  <input @bind="username" placeholder="Username">
  <input @bind="email" placeholder="Email">
  <button>Create User</button>
</form>

<div id="result"></div>
```

### Special Features

- **CSRF Protection:** Automatically includes CSRF tokens from `<meta name="csrf-token">` for same-origin requests
- **Turbo Streams:** The `/turbo` adapters advertise and render Turbo Stream responses
- **Content Type Detection:** Automatically handles JSON and HTML responses
- **FormData:** Works seamlessly with file uploads and multipart forms
- **Same-Origin Credentials:** Automatically includes cookies for same-origin requests

**CSRF Token Example:**
```html
<head>
  <meta name="csrf-token" content="your-token-here">
</head>

<!-- Token automatically included in same-origin POST requests -->
<form @post="/api/users">
  <button>Submit</button>
</form>
```

Token inclusion is automatic when the meta element exists. To fail closed when
it is missing, enable validation for an instance or one request:

```js
const app = createHelium({ root: "#app", requireCsrf: true })
```

```html
<button @post="/api/users" @options="{ requireCsrf: true }">Create</button>
```

Required-CSRF validation applies only to state-changing same-origin requests;
cross-origin requests and GET remain unaffected.

### Validation and retry pattern

Use the browser's native constraints for immediate validation, server responses
for authoritative validation, and the HTTP lifecycle attributes for status and
recovery:

```html
<form
  @ref="form"
  @post.prevent="/profile"
  @params="new FormData($el)"
  @target="#result"
  @loading="loadingMarkup"
  @success="saveSucceeded($response)"
  @error="saveFailed($error, $request)"
>
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required
    aria-describedby="email-error"
    :aria-invalid="!!errors.email"
    @input="clearError('email')">
  <p id="email-error" @text="errors.email || ''"></p>
  <button>Save</button>
  <button type="button" @hidden="!canRetry" @click="$form.requestSubmit()">Retry</button>
</form>
<p role="status" aria-live="polite" @text="status"></p>
<div id="result"></div>
```

The example deliberately clears a field's stale server error when it is edited,
keeps the status in an `aria-live` region, focuses the first invalid server
field, and retries through `requestSubmit()` so native constraints run again.
See the complete runnable [`examples/validation.html`](examples/validation.html).

## Dynamic Attributes

It's possible to dynamically update the attributes of elements. To do this, just prepend a `:` in front of the attribute name and write a JavaScript expression that evaluates to the desired attribute value. This will update whenever any of the Helium variables change value.

In the following example, the `<div>` element has a dynamic class attribute that will be 'normal' if the count is less than 10, but 'danger' if the count is 10 or more:

```html
<div :class="count < 10 ? 'normal' : 'danger'">
    The count is <b @text="count"></b>
</div>
```

**Any HTML attribute can be dynamic:**

```html
<input :placeholder="'Enter ' + fieldName">
<button :disabled="!isValid">Submit</button>
<a :href="'/users/' + userId">View Profile</a>
<img :src="imageUrl" :alt="imageDescription">
```

### Special Dynamic Attributes

**:class** - Can accept an object to toggle multiple classes:

```html
<div :class="{ 
  active: isActive, 
  disabled: !isEnabled,
  'has-error': errorMessage 
}"></div>
```

This is more convenient than ternary operators when you need to toggle multiple classes.

**:style** - Can accept an object for multiple styles:

```html
<div :style="{ 
  color: textColor, 
  fontSize: size + 'px',
  display: isVisible ? 'block' : 'none'
}"></div>
```

You can also use a string:
```html
<div :style="'color: ' + color + '; font-size: ' + size + 'px'"></div>
```

**Alias:** `data-he-attr:attributeName`

**Example:**
```html
<button data-he-attr:disabled="!isValid">Submit</button>
```

## Magic Variables

These special variables are available in all JavaScript expressions:

### $
The `$` query helper preserves `document.querySelector` as its default and adds
array-returning plural and scoped forms:

```html
<div @click="$('#header').classList.add('active')">Activate Header!</div>
<button @click="$('.sidebar').style.display = 'none'">Hide Sidebar</button>
```

```js
$(selector)                 // first match in document
$.all(selector)             // all matches in document
$.root(selector)            // first descendant match in $root
$.root.all(selector)        // all descendant matches in $root
$.scope(selector)           // first descendant match in $scope
$.scope.all(selector)       // all descendant matches in $scope
```

The plural forms return normal arrays. Like `querySelector`, the root and scope
forms search descendants and do not include `$root` or `$scope` themselves.

### $el
Reference to the current element:

```html
<div @click="$el.remove()">Click to remove me!</div>
<button @click="$el.classList.toggle('active')">Toggle Active</button>
<input @input="console.log($el.value)">
```

### $root

The actual root element owned by the current Helium instance. This is the
element selected by `@helium`/`data-helium`, the element passed to
`helium.mount()`, or `document.body` for the default fallback root.

### $scope

The nearest element that declares local `@data` state, falling back to `$root`.
Lite has no local data scopes, so `$scope` and `$root` are always the same.

### $event
The event object (available in event handlers):

```html
<div @click="console.log($event.timeStamp)">Log the timestamp</div>
<input @keydown="$event.key === 'Enter' && submit()">
<form @submit.prevent="handleSubmit()">
```

### $dispatch

Dispatch a bubbling, cancelable `CustomEvent` from the current element. The
event is returned, so callers can inspect `defaultPrevented`:

```html
<section @cart:add="total += $event.detail.price">
  <button @click="$dispatch('cart:add', { price: 12 })">Add</button>
</section>
```

The signature is `$dispatch(name, detail = {}, options = {})`. Options can set
`target` (default `$el`), `bubbles` (default `true`), and `cancelable` (default
`true`).

### $data
The reactive data object containing all Helium variables:

```html
<div @click="console.log($data)">Log all data</div>
<button @click="localStorage.setItem('state', JSON.stringify($data))">
  Save State
</button>
```

This is particularly useful when passing to functions (see "Default Variables and Functions" section).

### $html
Helper function to create HTML elements from strings:

```html
<button @click="$list.appendChild($html('<li>New item</li>'))">
  Add Item
</button>
```

### $get, $post, $put, $patch, $delete
HTTP request functions that can be called programmatically:

```html
<button @click="$get('/api/data', '#result')">Load Data</button>
<button @click="$post('/api/users', { name: username }, { target: '#result' })">
  Create User
</button>
```

The arguments are `url`, `params` (not for `$get`), and `options`. In addition
to `loading`, `target`, `action`, and `template`, options accepts normal fetch
options plus `signal`, `latest`, `requestKey`, `requireCsrf`, `success`, and
`error`. Helpers return an awaitable promise; cancellation rejects it with an
`AbortError`.

### Named refs

The first element marked with `@ref="name"` in the nearest defining scope is
available as `$name`. `$refs.name` is an array of every matching ref in that
scope, in current DOM order:

```html
<input @ref="username">
<button @click="console.log($username.value)">Log Username</button>

<div @ref="item"></div>
<div @ref="item"></div>
<button @click="console.log($refs.item.length)">Log item count</button>
```

## Expression Contract

Directive values are **single expressions**, in both Standard and CSP. Common
expressions include property reads, assignments, function calls, object and
array literals, ternaries, logical operators, and arrow functions:

```html
<button @click="open = !open">Toggle</button>
<button @click="save($data, $el)">Save</button>
<p @text="loading ? 'Loading…' : message"></p>
```

Top-level statement lists, declarations, and control-flow statements are not
directive syntax. Prefer event modifiers and move multi-step behavior into a
named function:

```html
<!-- Not supported: two top-level statements -->
<form @submit="$event.preventDefault(); save()"></form>

<!-- Preferred -->
<form @submit.prevent="save($data)"></form>
```

The Standard build uses the JavaScript expression grammar. The CSP build uses
its restricted expression parser and additionally excludes `new` and some
JavaScript expression forms; see the CSP build notes above. Functions declared inside
an `@data` object or imported from a module are ordinary JavaScript functions
and may contain statements internally.

## Functions

Functions can be imported using `@import` or defined using the `@data` attribute.

### Adding Functions

You can add functions that can be called from event handlers and other expressions:

```html
@data= "{ 
  appendTo(element) {
    const li = document.createElement("li")
    li.textContent = "New Item"
    element.append(li)
  },
  
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }
}"
```

Using these functions:

```html
<ul @ref="list"></ul>
<button @click="appendTo($list)">Append item to list</button>

<div @data="{ price: 19.99 }">
  <p @text="formatCurrency(price)"></p> <!-- Shows: $19.99 -->
</div>
```

### Important Note About Functions and Reactivity

**Magic variables and Helium variables are not available inside these functions by default.** However, you can pass them as arguments.

❌ **This won't work as expected:**

```html
@data = "{ 
  increment(n = 1) {
    count += n  // 'count' is not defined in this scope
  }
}"
```

```html
<button @click="increment()">Increment Count</button>
```

✅ **Instead, pass variables as arguments:**

**Option 1: Pass specific variables**
```html
@data = "{ 
  increment(currentCount, n = 1) {
    return currentCount + n
  }
}"
```

```html
<button @click="count = increment(count)">Increment Count</button>
```

**Option 2: Pass $data for reactive updates**

This is the recommended approach when you need to update variables:

```html
@data = "{ 
  increment(data, n = 1) {
    data.count += n  // Will trigger reactivity
  },
  
  resetAll(data) {
    data.count = 0
    data.name = ''
    data.items = []
  }
}"
```

```html
<button @click="increment($data)">Increment Count</button>
<button @click="resetAll($data)">Reset Everything</button>
```

**Why pass $data?** When you update properties of the `$data` object, Helium's reactivity system detects the changes and updates the UI accordingly.

## Advanced Features

### Batched Updates

State changes are batched: a burst of synchronous mutations triggers a single
DOM update on the next microtask, and each affected binding runs once no matter
how many mutations fed it. This keeps loops over state cheap — updating 100
items in a keyed list re-renders the list once, not 100 times:

```javascript
// One DOM update, not 100
for (let i = 0; i < 100; i++) state.items[i].done = true;
```

Two practical consequences:

- **Reading the DOM right after a mutation shows the old value.** Await a
  microtask first: `state.count = 5; await Promise.resolve();` (in tests, a
  `setTimeout(0)` tick also covers content inserted by `@if`/`@for`, which is
  processed asynchronously by the MutationObserver).
- **Assigning a value that is already current is a no-op** — it doesn't
  re-trigger bindings, so effects that write unchanged state settle instead of
  looping. A binding cascade that *never* stops writing new values (e.g.
  `@effect:*="count++"`) is detected and reported after 100 passes.

### DOM Morphing

When `@html` updates, Helium uses the first available strategy:

1. `Turbo.morphChildren()` when a `/turbo` adapter is loaded and Turbo 8 exposes it
2. A separately loaded `Idiomorph.morph()` global
3. Native `innerHTML` replacement

Turbo already bundles Idiomorph internally, so Rails applications should not
load another copy. Helium's Turbo adapter reuses Turbo's public morphing function.
Applications without Turbo can optionally include
[Idiomorph](https://github.com/bigskysoftware/idiomorph):

```html
<script src="https://unpkg.com/idiomorph@0.7.4"></script>
<script type="module">
  import helium from 'https://cdn.jsdelivr.net/npm/@daz4126/helium@1.0.0-rc.6/dist/helium.min.js';
</script>
```

Without either morpher, `@html` still works normally. Morphing is not required
for newly inserted Helium attributes: the mutation observer processes those in
all three paths. Its benefit is retaining unchanged child DOM nodes where
possible.

**Benefits:**
- Preserves focus on input elements
- Maintains scroll positions
- Reduces flicker and improves perceived performance
- Keeps CSS animations running smoothly

**Example:**
```html
<div @html="items.map(i => `<div>${i}</div>`)">
  <!-- Content morphs smoothly without full replacement -->
</div>
```

### List Rendering with Keys

When rendering lists with `@html`, add stable `id`, `key`, or `data-key`
attributes to help the active Turbo/Idiomorph morpher match existing items:

```html
<ul @html="items.map(item => `
  <li key='${item.id}'>
    ${item.name}
  </li>
`)"></ul>
```

Without keys, the entire list is re-rendered. With keys, only changed items are updated.

### MutationObserver

Helium automatically observes the DOM, processes new elements as they're added,
and reconciles Helium directives when attributes on retained elements change.
Adding, replacing, or removing an event, binding, ref, effect, initializer, or
structural directive installs the new behavior and tears down the old behavior
without rebuilding unrelated parts of the subtree.

For programmatic changes, use the `data-he-*` aliases: DOM `setAttribute()`
rejects names such as `@click` in some browsers and DOM implementations even
though the HTML parser accepts them.

```js
button.setAttribute("data-he-click", "save()")
button.setAttribute("data-he-click", "archive()") // replaces save
button.removeAttribute("data-he-click")            // removes the listener
```

Changing local `data-he-data` recreates that local scope and re-tracks its
descendant bindings. HTTP option attributes such as `data-he-target` are read
when the request runs, so their current values are used automatically. Root
selection and `@local-storage` remain mount-time configuration.

This means Helium works seamlessly with:

- Dynamically inserted content
- Content loaded via AJAX
- Third-party widgets that inject HTML
- Turbo/Hotwire page updates when using a `/turbo` adapter

**Example:**
```html
<div id="container"></div>

<script>
  // This will automatically work with Helium
  document.getElementById('container').innerHTML = `
    <button @click="count++">Click me</button>
    <span @text="count">0</span>
  `;
</script>
```

### Integration with Turbo/Hotwire

Turbo lifecycle integration is opt-in, like SSE. Rails applications should
import the adapter instead of the base entry point:

```js
import helium from "@daz4126/helium/turbo"
// or: @daz4126/helium/turbo/sse
// CSP: @daz4126/helium/csp/turbo or @daz4126/helium/csp/turbo/sse
```

The adapter:

- Leaves the current page fully rendered and interactive until Turbo swaps in
  the next one. The old page's instance tears itself down (aborting requests
  and signals, removing listeners) when its body is detached.
- Starts Helium on each newly rendered page (`turbo:render`), re-applying the
  state you first passed to `helium(initialState)` so functions and shared
  values stay available. `heliumTeardown()` forgets that state.
- Skips cached previews: only the real response is initialized, so `@init`
  and on-load requests run once per visit.
- Discards `@for`/`@if` output restored from Turbo's page cache (generated nodes
  carry a `data-helium-generated` attribute) before rendering it again.
- Keeps Helium alive through morphs: page refreshes (`turbo-refresh-method`
  `morph`, including Rails `broadcasts_refreshes`), frames with
  `refresh="morph"`, and `<turbo-stream method="morph">`. Rendered rows,
  listeners, and client-side state such as counters, open menus, and
  half-typed inputs survive; bindings are re-applied over the server markup.
  When the server sends a changed `@data` attribute, those values are applied,
  so server-owned data updates while untouched local state is preserved.
- Mounts each `data-turbo-permanent` element inside the page root as its own
  independent root, so its state survives navigation.

This is tested with Turbo 8 restoration visits, previews, morph refreshes,
morphing Frames and Streams, permanent elements, and both the Standard and CSP
builds.

Ordinary page content needs no configuration. Permanent elements get their own
state, separate from the page's, because they outlive the page around them:

```html
<aside id="counter" data-turbo-permanent @data="{ plays: 0 }">
  <button @click="plays++" @text="plays"></button>
</aside>
```

A permanent element outside the page root (for example beside a
`[data-helium]` root) can be mounted explicitly instead:

```html
<aside id="player" data-turbo-permanent>
  <button @click="playing = !playing" @text="playing ? 'Pause' : 'Play'"></button>
</aside>

<script type="module">
  import helium from "@daz4126/helium/turbo"
  await helium.mount("#player", { playing: false })
</script>
```

Turbo preserves the element while the explicit instance preserves its state,
listeners, signals, and cleanup lifecycle.

More generally, each element has one owner. Mounting a root inside a running
root (in either order) hands that subtree to the inner instance; unmounting the
inner root hands it back. Mounting a root that is already mounted, or inside
another root's rendered `@for`/`@if` output, throws `Helium root already owned`.

## Security Considerations

### XSS Prevention

When using `@html`, be very careful with user-generated content:

❌ **Dangerous:**
```html
<div @html="userComment"></div>
```

✅ **Safe:**
```html
<!-- Use @text for user content -->
<div @text="userComment"></div>

<!-- Or sanitize first -->
<div @html="DOMPurify.sanitize(userComment)"></div>
```

### CSRF Protection

Helium automatically includes CSRF tokens for same-origin requests:

```html
<head>
  <meta name="csrf-token" content="your-token-here">
</head>
```

The token is automatically included in POST, PUT, PATCH, and DELETE requests to the same origin.
Set `requireCsrf: true` on `createHelium()` or in a request's `@options` to
reject those requests before `fetch()` when the token is absent.

### Content Security Policy

The standard and lite builds use `new Function()` and therefore require `unsafe-eval`. For a strict Content Security Policy, use the CSP build instead:

```js
import helium from "@daz4126/helium/csp"
```

## Best Practices

### Performance Tips

**Use @calculate for derived values:**

```html
<!-- Good: Calculated once, updates automatically -->
<div @calculate:total="items.reduce((sum, item) => sum + item.price, 0)"></div>
<div @text="total"></div>

<!-- Avoid: Recalculates on every render -->
<div @text="items.reduce((sum, item) => sum + item.price, 0)"></div>
```

**Debounce expensive operations:**

```html
<input @input.debounce:500="search()" placeholder="Search...">
```

**Use @effect for side effects:**

```html
<!-- Persist to localStorage when username changes -->
<div @effect:username="localStorage.setItem('user', username)"></div>

<!-- Track analytics on state changes -->
<div @effect:page="analytics.track('page_view', { page })"></div>
```

**Benchmarking:**

The repo includes a head-to-head runtime benchmark against Alpine.js, React,
and Datastar (keyed list create/update/swap/clear plus rapid counter updates,
run in real Chromium; Datastar only runs the counter test since it renders
lists server-side). Run it with:

```bash
npm run bench                    # defaults: 1000 rows, 7 runs
node scripts/benchmark.mjs --rows 5000 --runs 5
```

### Structuring Larger Apps

**Organize state at the root:**

```html
<div @helium @data="{ 
  user: { name: '', email: '' },
  cart: { items: [], total: 0 },
  ui: { modal: false, loading: false }
}">
  <!-- Child elements can access all state -->
</div>
```

**Use refs for complex interactions:**

```html
<div @ref="modal" @hidden="!showModal" class="modal">
  <button @click="$modal.close()">Close</button>
</div>
```

**Break down complex expressions:**

```html
<!-- Instead of complex inline logic -->
<div @html="items.filter(i => i.active).map(i => `<li>${i.name}</li>`).join('')"></div>

<!-- Use @calculate to break it down -->
<div @calculate:activeItems="items.filter(i => i.active)"></div>
<div @html="activeItems.map(i => `<li>${i.name}</li>`).join('')"></div>
```

### Debugging Tips

**Inspect state with @effect:**

```html
<div @effect:*="console.log('State changed:', $data)"></div>
```

**Use @init for debugging:**

```html
<div @init="console.log('Helium initialized', $data)"></div>
```

**Check element references:**

```html
<div @ref="myElement"></div>
<button @click="console.log($myElement)">Inspect Element</button>
```

### Common Pitfalls

**Arrays and objects are reactive:**

```html
<button @click="items.push(newItem)">Add item</button>
<span @text="items.length"></span>
```

Nested mutations made through `$data` are reactive too:

```javascript
helium({
  addItem(data, item) {
    data.items.push(item); // Triggers updates
  }
})
```

```html
<button @click="addItem($data, newItem)">Add Item</button>
```

**❌ Don't use magic variables inside functions:**

```javascript
helium({
  badFunction() {
    console.log($data); // ❌ $data is undefined
  }
})
```

**✅ Pass them as arguments:**

```javascript
helium({
  goodFunction(data) {
    console.log(data); // ✅ Works!
  }
})
```

```html
<button @click="goodFunction($data)">Works!</button>
```

## Error Handling

### JavaScript Expression Errors

In Standard/CSP, if a binding expression throws at runtime, Helium logs the error and continues
without updating that binding. Failed compilation keeps Helium's literal-string
ergonomics: plain text such as `@text="Loading..."` stays quiet, while
expression-looking failures such as `@text="user.name."` or
`@click="count +"` emit a `console.warn` with the attribute and expression.

```html
<!-- If items is undefined, this won't crash the page -->
<div @text="items.length"></div>
```

### HTTP Request Errors

HTTP directives route failed requests to `@error` and the instance-level
`handleError` hook (or the console when no hook is configured). Programmatic
helpers return promises and also accept `error(error, request)`, so failures can
be handled close to the request:

```html
<button @click="$post('/api/save', { data: formData }, '#message')
  .catch(error => saveError = error.message)">
  Save
</button>

<div id="message" @html="saveError || 'Ready to save'"></div>
```

Expected cancellation is deliberately excluded from error reporting. The
promise still rejects with `AbortError`, allowing an awaiting caller to detect
it when needed.

### Invalid Attribute Syntax

Standard/CSP keep plain malformed value expressions as literal values. If a failed
expression looks like broken JavaScript, Helium emits a warning with directive
context. Event handlers, HTTP options, `@data`, `@for`, `@if`, `@calculate`,
`@effect`, and `@init` are treated strictly and warn on compile failure.


## Roadmap & Known Limitations

Helium aims to stay tiny, so some conveniences found in larger frameworks are
intentionally absent (or still on the roadmap). Current gaps:

### Not yet supported

- **No `$nextTick` and no cross-root shared store** — each mounted instance has
  its own isolated state namespace. Managed import behaviors have programmatic
  [`watch()`](#programmatic-watching); there is no expression-level `$watch`.
- **No transition helper** — use CSS transitions/classes directly with
  `@hidden`, `@visible`, or `@if`.

### Stimulus-parity roadmap

The goal is not to copy Stimulus's controller syntax. Simple behavior should
remain local (`@click="open = !open"`, `@bind="name"`); the roadmap supplies the
lifecycle and JavaScript escape hatches needed when behavior becomes complex.

#### P0 — 1.0 release foundations

- [x] **Define the expression and function-context contract.** Directive values
  are expressions; multi-step work belongs in named functions with `$data`,
  `$el`, refs, and other required context passed explicitly.
- [x] **Reconcile directive attributes on retained elements.** Attribute add,
  replace, and removal now install and tear down bindings, events, refs,
  initializers, local data, and structural directives independently.
- [x] **Run the production browser suite in Chromium, Firefox, and WebKit.** Keep
  the same CSP, optional Turbo/SSE, keyed identity, dynamic-directive,
  late-import, Lite, and entry-point checks in every engine.
- [x] **Make Turbo snapshots structurally clean.** Mark generated `@for` rows
  and `@if` nodes, discard stale copies restored from the cache, and rebuild
  once, without emptying the live page before Turbo swaps it.
- [x] **Keep state through Turbo morphs.** Page, frame, and stream morphs keep
  the instance, rendered rows, and client state alive.
- [x] **Verify the real Turbo 8 lifecycle.** Exercise restoration visits, morph
  refreshes, Frames, Streams, and `data-turbo-permanent` roots against the
  installed Turbo package in Chromium, Firefox, and WebKit.
- [x] **Define explicit/default mount ownership.** Explicit factories and mounts
  suppress the automatic Turbo-managed instance so an element never receives
  two sets of listeners.
- [x] **Stabilize the package contract.** Normalize named `helium` and
  `heliumTeardown` exports, publish declarations for every entry point, and
  install the packed tarball into a clean consumer during CI.

#### P1 — complex-behavior escape hatches

1. [x] **Formalize lifecycle modules over `@init`.** Document the setup-function
   convention: setup receives its required element, state, refs, and dispatch
   context explicitly and returns cleanup. Keep ordinary behavior inline and
   move only complex imperative work into a lifecycle module.

   ```js
   export function connectFeature(element, data, refs) {
     // setup
     return () => {
       // cleanup
     }
   }
   ```

2. [x] **Formally support and test namespaced initializers.** Allow independent
   behaviors such as `@init:editor` and `@init:tooltip` on one element, with
   isolated replacement and cleanup when either attribute changes.

   ```html
   <div
     @init:editor="connectEditor($el, $data, $refs)"
     @init:tooltip="connectTooltip($el)"
   ></div>
   ```

3. [x] **Add unified lifecycle error handling.** Route initializer setup, async
   rejection, cleanup, binding, event, import, and request failures through an
   instance-level `handleError(error, context)` hook and optional debug mode.
4. [x] **Add an initializer-scoped `AbortSignal`.** Give each initializer a signal
   that aborts when its attribute is replaced, removed, its element disconnects,
   or its Helium root unmounts, so listeners and pending external work can use
   native cancellation.
5. [x] **Support asynchronous setup and cleanup safely.** Recognize setup promises,
   avoid registering stale results after disconnection or replacement, run a
   cleanup returned asynchronously, and report rejected setup/cleanup through
   the lifecycle error hook.
6. [x] **Fix mounted-root disconnection cleanup.** Automatically abort signals,
   run cleanup, and release observers and bindings if an external DOM owner
   disconnects a mounted root; preserve lifecycle during a synchronous move.
7. [x] **Make `@import` lifecycle-aware.** Treat a module's default function
   export as per-element setup while preserving named exports for expressions.
8. [x] **Give imported behaviors local refs and query helpers.** Supply current,
   DOM-ordered `refs`, `query()`, and `query.all()` bounded by nested managed
   behaviors, alongside data, dispatch, root, element, and signal context.
9. [x] **Compose multiple imports independently.** Allow comma-separated default
   behavior exports on one element and clean only the behavior whose module
   name is removed without restarting its siblings.
10. [x] **Add programmatic `watch()`.** Let imported setup functions observe reactive
   state without exporting update functions or storing external instances in a
   module-level `WeakMap`; include current/previous values and lifecycle-bound
   cleanup. Keep middleware separate and lower priority.
11. [x] **Publish TypeScript declarations** for mounting, factories, expression
   engines, CSP globals, SSE, lifecycle errors, initializer context, signals,
   and watching.

#### P2 — lifecycle depth and application maturity

12. [x] **Observe ref collections** so complex behaviors can react when matching
   refs connect, disconnect, or reorder; this covers Stimulus target callbacks
   without changing simple `$ref`/`$refs` usage.
13. [x] **Complete the HTTP lifecycle:** request cancellation with `AbortController`,
   explicit success/error hooks, consistent `@loading` restoration, and opt-in
   required-CSRF validation for state-changing same-origin requests.
14. **Evaluate behavior lookup only after lifecycle modules are established.**
    Prefer `$dispatch` for loose coordination; add outlet-like instance lookup
    only if real applications require direct behavior-to-behavior calls.

#### P3 — evidence-driven conveniences

15. [x] **Document complete validation and error-state patterns** covering native
   constraint validation, HTTP failure, retry, accessible messages, and stale
   error clearing before adding validation helpers.
16. **Consider extensible event modifiers and structured action parameters.**
   Expressions already cover most cases, so add APIs only for repeated needs.
17. **Revisit custom directives, debounced binding, middleware, transitions,
    and a shared store** only with concrete use cases and explicit size budgets.
    Lifecycle-aware `@import` now covers reusable per-element behavior, so an
    additional `@use` is not planned. Consider an `@action` or extension API
    only if applications need to define genuinely new directive semantics.

This ordering moves the former HTTP/form-heavy roadmap behind lifecycle,
diagnostics, watching, and types. The HTTP, CSRF, loading, validation, and error
example work is now complete; it improves application maturity but does not by
itself close the remaining Stimulus-parity gaps.

## Contributing

Helium is open source! Contributions, issues, and feature requests are welcome.

- GitHub: [github.com/daz-codes/helium](https://github.com/daz-codes/helium)
- Report issues: Create an issue on GitHub
- Suggest features: Open a discussion on GitHub

Before submitting a change, run `npm run check`. It executes the full jsdom test
suite, creates the production bundles, smoke-tests them, and fails if any gzip
size budget is exceeded. `npm run test:browser` runs the cross-browser smoke
suite used by CI for CSP, real Turbo 8 navigation/morphing/Frames/Streams and
permanent roots, SSE, keyed focus preservation, late imports, the standalone Lite runtime,
and browser entry imports. `npm run test:types` checks the declarations and
`npm run test:package` installs the packed tarball in a clean consumer.
`npm run check:ci` runs every path.
`npm run size` also reports raw, gzip, and Brotli sizes.

`helium.js` is the Standard runtime. `helium-lite.js` is a separately maintained
minimal runtime and must stay below its 3 KB gzip budget. Turbo navigation and
SSE are optional entry points; Standard/CSP retain keyed lists, HTTP, imports,
and the complete lifecycle contract.

## License

MIT License - feel free to use Helium in personal and commercial projects.

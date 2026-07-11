# 🎈 Helium 🎈

The ultra-light library that makes HTML interactive!

Here's a simple example of a button that counts the number of times it has been clicked and turns red after more than 3 clicks:

```html
<button @click="count++" :style="count > 3 && 'background: red'">
    clicked <b @text="count">0</b> times
</button>
```

It's really simple to use - just sprinkle the magic @attributes into your HTML and watch it come alive!

[See more examples here](https://codepen.io/daz4126/pen/ogxGMX) | [TodoMVC Example](https://codepen.io/daz4126/pen/gbMjdZO)

## Why Helium?

Helium is designed for developers who want:

- **Lightweight** - About 4.6–11.9KB minified and gzipped, depending on the build
- **Powerful** - Declarative JavaScript in your HTML
- **Zero build step** - Works directly in the browser with no compiling
- **Easy to learn** - If you know HTML and basic JavaScript, you're ready

## Versions

Helium comes in three core versions, with SSE available as an optional add-on, so you can pick the right balance of features and size for your project:

### Helium (Standard)

The full-featured version with everything included.

- All directives (`@text`, `@html`, `@for`, `@if`, `@bind`, `@data`, `@ref`, `@calculate`, `@effect`, `@init`, etc.)
- Event handlers with modifiers
- HTTP requests (`@get`, `@post`, `@put`, `@patch`, `@delete`)
- Module imports (`@import`)
- Optional Server-Sent Events (SSE) add-on
- Turbo/Hotwire integration

**Best for:** Most projects where you want the full power of Helium without worrying about CSP restrictions.

```javascript
import helium from "@daz4126/helium"
```

### Helium Lite

A slimmed-down version with just the core reactivity features.

- Core directives (`@text`, `@html`, `@bind`, `@data`, `@ref`, `@calculate`, `@effect`, `@init`)
- Event handlers with modifiers
- One global state namespace
- No local `@data`, keyed `@for`, HTTP requests, imports, SSE, or Turbo integration

**Best for:** Simple interactive pages where you only need reactivity and don't need server communication or module imports.

```javascript
import helium from "@daz4126/helium/lite"
```

### Helium CSP

A Content Security Policy safe version that doesn't require `unsafe-eval`. It uses [jexpr](https://github.com/nicolo-ribaudo/jexpr) as its expression engine instead of `new Function()`.

- All the same directives and HTTP/Turbo/`@import` features as the standard version
- Optional Server-Sent Events (SSE) add-on
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
| Core directives | ✅ | ✅ | ✅ |
| Element-local `@data` | ✅ | ❌ | ✅ |
| Keyed `@for` | ✅ | ❌ | ✅ |
| Conditional `@if` | ✅ | ❌ | ✅ |
| Event handlers | ✅ | ✅ | ✅ |
| HTTP requests | ✅ | ❌ | ✅ |
| `@import` | ✅ | ❌ | ✅ |
| SSE | Add-on | ❌ | Add-on |
| Turbo integration | ✅ | ❌ | ✅ |
| CSP safe | ❌ | ❌ | ✅ |
| Approx. min+gzip size | 7.59KB | 4.56KB | 11.51KB |

Sizes are enforced against the production Terser builds with gzip level 9. The
CSP figure includes its expression parser. Adding SSE produces 7.97KB Standard
and 11.88KB CSP bundles.

Lite is generated from the same global-state reactive core as Standard. It has
identical deep/shared reactivity, lifecycle, binding, and cleanup behavior for
root state, but intentionally excludes element-local data and Standard's other
extensions.

## Installation

### CDN (No build step required!)

Just import from the CDN in a script tag directly in your HTML page:

```html
<!-- Standard -->
<script type="module">
  import helium from 'https://cdn.jsdelivr.net/gh/daz-codes/helium/helium.js';
</script>

<!-- Lite -->
<script type="module">
  import helium from 'https://cdn.jsdelivr.net/gh/daz-codes/helium/helium-lite.js';
</script>

<!-- CSP -->
<script type="module">
  import helium from 'https://cdn.jsdelivr.net/gh/daz-codes/helium/helium-csp.js';
</script>

<!-- Standard + SSE -->
<script type="module">
  import helium from 'https://cdn.jsdelivr.net/gh/daz-codes/helium/helium-sse.js';
</script>
```

### NPM

```bash
npm install @daz4126/helium
```

Then import the version you need:

```javascript
import helium from "@daz4126/helium"         // Standard
import helium from "@daz4126/helium/lite"    // Lite
import helium from "@daz4126/helium/csp"     // CSP
import helium from "@daz4126/helium/sse"     // Standard + SSE
import helium from "@daz4126/helium/csp/sse" // CSP + SSE
```

For a pre-minified, self-contained bundle, append `/min` to an entry point:

```javascript
import helium from "@daz4126/helium/min"
import helium from "@daz4126/helium/sse/min"
```

The source entry points remain browser-ready ES modules, so consuming Helium
does not require a build step.

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
calling `helium(initialState)` directly.

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

Similar to `@text`, but inserts HTML content into the element's innerHTML. Supports arrays, objects, and DOM morphing with Idiomorph if available.

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

**Alias:** `data-he-data` (the legacy bare `data-he` alias is also accepted)

### @ref

Creates a reference to the element that can be used in JavaScript expressions. References are prefixed with `$` when accessed.

```html
<ul @ref="list"></ul>
```

This element can then be accessed in other JavaScript expressions as `$list`:

```html
<button @click="$list.appendChild($html('<li>New item</li>'))">Add Task</button>
```

**Alias:** `data-he-ref`

### @init

A JavaScript expression that will run once when Helium initializes. Useful for setup code that should run on page load.

```html
<div @init="timestamp = Date.now()"></div>
<div @init="console.log('Helium initialized!')"></div>
```

If the expression returns a function, Helium calls it when the element is removed or when Helium is torn down. This is useful for releasing timers, observers, subscriptions, and other resources:

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

**Alias:** `data-he-init`

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

Imports ES modules into Helium's scope, making their exports available in Helium expressions.

```html
<div @import="utils,api">
  <button @click="formatDate(new Date())">Format Date</button>
  <p @text="API_VERSION"></p>
</div>
```

This dynamically imports modules and adds all their named exports to Helium's state.

**Import paths:**

| Path | Resolves to |
|------|-------------|
| `utils` | `./utils.js` |
| `modules/helpers` | `./modules/helpers.js` |
| `./utils.js` | `./utils.js` |
| `../shared/utils` | `../shared/utils.js` |
| `https://example.com/lib.js` | `https://example.com/lib.js` |

The `.js` extension is added automatically if not provided. URLs are used as-is.

**Example:**

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

**Importing from URLs:**

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
- **debounce** - Debounces the event handler (default 300ms)
- **debounce:500** - Debounces with custom delay in milliseconds
- **shift, ctrl, alt, meta** - Only fires if the modifier key is pressed
- **Key names** - For keyboard events, specify which key (e.g., `enter`, `esc`, `space`)

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
<!-- Creates { user: { name: [value] } } -->
<button @post="/api/save" @params="user:name:value" name="value">
  Save
</button>
```

**Magic Parmas Syntax:**
If the element has a `name` attribute, Helium automatically extracts its value:

```html
<!-- Automatically sends { username: [input value] } -->
<input name="username" @bind="username">
<button @post="/api/save" name="username">Save</button>
```

For checkboxes:
```html
<!-- Sends { agreed: true/false } -->
<input type="checkbox" name="agreed">
<button @post="/api/consent" name="agreed">Submit</button>
```

**FormData Example:**
```html
<form @post="/api/upload">
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
  @loading="<div class='spinner'>Loading...</div>">
  Load Users
</button>
```

#### @options

Additional fetch options (as an object):

```html
<button 
  @get="/api/users"
  @options="{ cache: 'no-cache' }">
  Load Users
</button>
```

**Alias:** All HTTP attributes have `data-he-` aliases:
- `data-he-target`
- `data-he-params`
- `data-he-template`
- `data-he-loading`
- `data-he-options`

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

```html
<button @get="/api/events"
  @target="#events:append"
  @options="{ retryMode: 'error', retry: 3000 }">
  Connect
</button>
```

### Complete Example

```html
<form @post="/api/users" @target="#result" @loading="Saving...">
  <input @bind="username" placeholder="Username">
  <input @bind="email" placeholder="Email">
  <button @params="{ name: username, email: email }">Create User</button>
</form>

<div id="result"></div>
```

### Special Features

- **CSRF Protection:** Automatically includes CSRF tokens from `<meta name="csrf-token">` for same-origin requests
- **Turbo Streams:** Supports Turbo Stream responses for Rails applications
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
Alias for `document.querySelector` - quickly select elements:

```html
<div @click="$('#header').classList.add('active')">Activate Header!</div>
<button @click="$('.sidebar').style.display = 'none'">Hide Sidebar</button>
```

### $el
Reference to the current element:

```html
<div @click="$el.remove()">Click to remove me!</div>
<button @click="$el.classList.toggle('active')">Toggle Active</button>
<input @input="console.log($el.value)">
```

### $event
The event object (available in event handlers):

```html
<div @click="console.log($event.timeStamp)">Log the timestamp</div>
<input @keydown="$event.key === 'Enter' && submit()">
<form @submit="$event.preventDefault(); handleSubmit()">
```

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

The arguments are `url`,`params` (not for `$get`) and `options`. `options` is an object that can include the properties `loading`,`target`, `template`

### Named refs

Each element marked with `@ref="name"` is available as `$name`. There is no
separate `$refs` object:

```html
<input @ref="username">
<button @click="console.log($username.value)">Log Username</button>
```

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

### DOM Morphing with Idiomorph

By default, when you update innerHTML with `@html`, Helium replaces the entire content. This can cause issues like losing focus, resetting scroll positions, or interrupting animations.

If you include [Idiomorph](https://github.com/bigskysoftware/idiomorph), Helium will automatically use it for efficient DOM updates:

```html
<script src="https://unpkg.com/idiomorph@0.3.0/dist/idiomorph.min.js"></script>
<script type="module">
  import helium from 'https://cdn.jsdelivr.net/gh/daz-codes/helium/helium.js';
</script>
```

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

When rendering lists with `@html`, you can add `key` or `data-key` attributes to help Helium (and Idiomorph) efficiently track and update individual items:

```html
<ul @html="items.map(item => `
  <li key='${item.id}'>
    ${item.name}
  </li>
`)"></ul>
```

Without keys, the entire list is re-rendered. With keys, only changed items are updated.

### MutationObserver

Helium automatically observes the DOM and processes new elements as they're added. This means Helium works seamlessly with:

- Dynamically inserted content
- Content loaded via AJAX
- Third-party widgets that inject HTML
- Turbo/Hotwire page updates

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

Helium automatically integrates with Turbo Drive:

- Cleans up listeners before page navigation (`turbo:before-render`)
- Re-initializes after page loads (`turbo:render`)

No additional configuration needed - just use Helium with Turbo normally.

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

The repo includes a head-to-head runtime benchmark against Alpine.js (keyed
list create/update/swap/clear plus rapid counter updates, run in real
Chromium). Run it with:

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

If a binding expression throws at runtime, Helium logs the error and continues
without updating that binding. Failed compilation keeps Helium's literal-string
ergonomics: plain text such as `@text="Loading..."` stays quiet, while
expression-looking failures such as `@text="user.name."` or
`@click="count +"` emit a `console.warn` with the attribute and expression.

```html
<!-- If items is undefined, this won't crash the page -->
<div @text="items.length"></div>
```

### HTTP Request Errors

HTTP directives log failed requests to the console. Programmatic helpers return
promises, so you can handle failures explicitly:

```html
<button @click="$post('/api/save', { data: formData }, '#message')
  .catch(error => saveError = error.message)">
  Save
</button>

<div id="message" @html="saveError || 'Ready to save'"></div>
```

### Invalid Attribute Syntax

Helium keeps plain malformed value expressions as literal values. If a failed
expression looks like broken JavaScript, Helium emits a warning with directive
context. Event handlers, HTTP options, `@data`, `@for`, `@if`, `@calculate`,
`@effect`, and `@init` are treated strictly and warn on compile failure.


## Roadmap & Known Limitations

Helium aims to stay tiny, so some conveniences found in larger frameworks are
intentionally absent (or still on the roadmap). Current gaps:

### Not yet supported

- **No `$watch`/`$nextTick`, and no cross-root shared store** — each mounted
  instance has its own isolated state namespace.
- **No transition helper** — use CSS transitions/classes directly with
  `@hidden`, `@visible`, or `@if`.

### Roadmap

Ordered by recommended implementation sequence:

1. **Document function and `this` context limitations** alongside the existing
   magic-variable guidance, with correct patterns for passing `$data`, `$el`,
   and other context explicitly.
2. **Add opt-in required-CSRF validation for POST/PUT/PATCH** — fail before the
   request when an application declares that a token is mandatory, without
   breaking tokenless APIs and cross-origin requests.
3. **Add request cancellation and explicit success/error hooks** using
   `AbortController`; define the request lifecycle before expanding loading and
   error-state APIs.
4. **Document a form-validation pattern first**, using native constraint
   validation and Helium state; add helpers only if examples reveal recurring
   boilerplate.
5. **Create a complete error-state example** covering validation, HTTP failure,
   retry, accessible messaging, and clearing stale errors.
6. **Complete HTTP loading-state lifecycle behavior** — `@loading` already
   exists, so define consistent success, error, cancellation, and restoration
   behavior rather than adding a second loading mechanism.
7. **Add debounced two-way binding updates if needed** after reproducing a real
    feedback/caret loop; event-handler debouncing already covers ordinary input
    throttling.
8. **Add a minimal watch/middleware system** together with a clear size budget;
    avoid adopting Alpine-scale surface area without demonstrated use cases.

## Contributing

Helium is open source! Contributions, issues, and feature requests are welcome.

- GitHub: [github.com/daz-codes/helium](https://github.com/daz-codes/helium)
- Report issues: Create an issue on GitHub
- Suggest features: Open a discussion on GitHub

Before submitting a change, run `npm run check`. It executes the full jsdom test
suite, creates the production bundles, smoke-tests them, and fails if any gzip
size budget is exceeded. `npm run test:browser` runs the Chromium smoke suite
used by CI for CSP, Turbo, SSE, keyed focus preservation, late imports, Lite
generation, and browser entry imports. `npm run check:ci` runs both paths.
`npm run size` also reports raw, gzip, and Brotli sizes.

`helium.js` contains the shared runtime plus sections marked Standard-only.
`npm run generate` derives `helium-lite.js`; do not edit the generated Lite file
directly. Standard keeps keyed lists, HTTP, imports, and Turbo, while SSE remains
an optional module.

## License

MIT License - feel free to use Helium in personal and commercial projects.

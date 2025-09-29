# Helium LLM Guide

This guide explains how to use **Helium** to build interactive UIs.  
It is designed for **AI assistants** and **developers** to have a clear playbook for generating Helium code.

---

## Core Ideas

- Helium uses **HTML attributes** to connect state and DOM.  
- Attributes can use either `@` or `data-he-*` prefixes. Both are valid.  
- State lives in a JavaScript object (via `helium({...})`) or in HTML with `@data`.  
- Changes to state automatically update the DOM where it is bound.

---

## Directives

### State
- `@data` / `data-he` → Initialize state.
```html
<div @data="{ count: 0, open: false }"></div>
```

### Reactive values
@react / data-he-react → Bind text content to state.

```html
<span @react="count"></span>
```

### Two-way binding
@bind / data-he-bind → Sync input values with state.

```html
<input @bind="name" placeholder="Enter your name">
```

### Visibility
@hidden / data-he-hidden → Hide element if expression is true.
@visible / data-he-visible → Show element if expression is true.

```html
<div @hidden="!open">Only visible if `open` is true</div>
```

### Attribute binding
:attribute → Dynamically bind attributes.

```html
<p :class="count > 3 ? 'danger' : 'safe'">Hello</p>
```

###Events

@event / data-he-on* → Attach event listeners.
.prevent → preventDefault
.once → run once then remove
.outside → listen outside the element

```html
<button @click="count++">Increment</button>
<button @click.prevent="submitForm()">Save</button>
```

### Refs

@ref / data-he-ref → Create named references to elements.

```html
<div @ref="box"></div>
```


### Initialization

@init / data-he-init → Run code once on init.

```html
<div @init="console.log('ready')"></div>
```

### Example Patterns

#### Counter

```html
<div @data="{ count: 0 }">
  <h1 @react="count"></h1>
  <button @click="count++">+</button>
  <button @click="count--">-</button>
</div>
```

#### Modal

```html
<div @data="{ open: false }">
  <button @click="open = true">Open Modal</button>

  <div @visible="open" class="modal">
    <p>Hello Helium!</p>
    <button @click="open = false">Close</button>
  </div>
</div>
```

#### Form Handling

```html
<div @data="{ name: '', email: '' }">
  <input @bind="name" placeholder="Name">
  <input @bind="email" placeholder="Email">
  <button @click.prevent="console.log(name, email)">
    Submit
  </button>
</div>
```

## Tips for LLMs

Always start with @data to define state.

* Use @react for dynamic text.
* Use @bind for inputs.
* Use @click (and modifiers) for actions.
* Use @hidden/@visible for conditionals.
* Use :attribute="expression" for dynamic attributes.
* Use @ref if you need to manipulate elements directly.
* Use @init for setup logic.

When in Doubt ...

* Think in terms of state → DOM binding.
* If something should display, use @react.
* If it should toggle, use @hidden/@visible.
* If it should update on input, use @bind.
* If it should respond to a click, use @click.

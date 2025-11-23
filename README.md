# 🎈 Helium 🎈

The ultra-light library that makes HTML interactive!

Here's a simple example of a button that counts the number of times it has been clicked and turns red after more than 3 clicks:

```html
<button @click="count++" :style="count > 3 && 'background: red'">
    clicked <b @text="count">0</b> times
</button>
```

It's really simple to use - just sprinkle the magic @attributes into your HTML and watch it come alive!

[See more examples here](https://codepen.io/daz4126/pen/YPwwdBK)

## Why Helium?

Helium is designed for developers who want:
- **Zero build step** - Just add a script tag and go
- **Minimal learning curve** - If you know HTML and basic JavaScript, you're ready
- **Tiny footprint** - Under 3KB minified and gzipped
- **Progressive enhancement** - Works alongside any backend framework
- **No virtual DOM** - Direct DOM manipulation for maximum performance

Perfect for adding interactivity to server-rendered pages, prototypes, or small-to-medium applications where a full framework would be overkill.

## Installation

### CDN (No build step required!)

Just import from the CDN in a script tag directly in your HTML page:

```html
<script type="module">
  import helium from 'https://cdn.jsdelivr.net/gh/daz-codes/helium/helium.js';
  helium();
</script>
```

### NPM

```bash
npm install @daz4126/helium
```

Then include it in your JavaScript file and call the helium() function:

```javascript
import helium from "@daz4126/helium"
helium()
```

### Initialization

By default, Helium initializes automatically when the DOM is ready. It listens for the `DOMContentLoaded` event and processes all Helium attributes in the page.

You can also manually initialize or re-initialize Helium:

```javascript
// Manual initialization
helium()

// With default data and functions
helium({
  count: 0,
  username: "Guest",
  greet(name) {
    alert(`Hello, ${name}!`)
  }
})
```

## Helium Attributes

Helium uses custom attributes to add interactivity to HTML elements. To identify them, they all start with `@`, although there are also data attribute aliases that can be used instead (useful if you need valid HTML or work with strict templating systems).

### @helium

This attribute sets the root element. Helium attributes can only be used on this element and its children. If not set then it defaults to `document.body`.

```html
<div @helium>
  <!-- All Helium attributes work here -->
  <button @click="count++">Click me</button>
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

Multiple elements can reference the same variable and they'll all update automatically:

```html
<div @data="{ price: 10, quantity: 2 }">
  <p>Price: $<span @text="price">0</span></p>
  <p>Quantity: <span @text="quantity">0</span></p>
</div>
```

**Alias:** `data-he-text`

### @html

Similar to `@text`, but inserts HTML content into the element's innerHTML. Supports arrays, objects, and DOM morphing with Idiomorph if available.

```html
<div @html="'<strong>Bold text</strong>'"></div>
```

**Arrays are automatically joined:**

```html
<ul @html="items.map(item => `<li>${item}</li>`)"></ul>
```

**⚠️ Security Warning:** Be careful with `@html` when displaying user-generated content, as it can introduce XSS vulnerabilities. Always sanitize untrusted input before using it with `@html`.

**Alias:** `data-he-html`

### @bind

Creates a 2-way binding between an input element's value and a variable. Whatever is entered in the following input field will be stored as a variable called name:

```html
<input @bind="name" placeholder="Enter your name">
<p>Hello, <span @text="name">stranger</span>!</p>
```

Works with:
- Text inputs and textareas (binds to `value`)
- Checkboxes (binds to `checked`)
- Radio buttons (binds to selected `value`)
- Select elements (binds to selected `value`)

```html
<div @data="{ agreed: false, color: 'blue', size: 'medium' }">
  <input type="checkbox" @bind="agreed"> I agree
  
  <input type="radio" name="color" value="red" @bind="color"> Red
  <input type="radio" name="color" value="blue" @bind="color"> Blue
  
  <select @bind="size">
    <option value="small">Small</option>
    <option value="medium">Medium</option>
    <option value="large">Large</option>
  </select>
</div>
```

**Alias:** `data-he-bind`

### @hidden & @visible

Makes the element hidden or visible depending on the result of a JavaScript expression.

```html
<div @visible="count > 3">Only visible if the count is greater than 3</div>
<div @hidden="count <= 3">Hidden when count is 3 or less</div>
```

These work by toggling the `hidden` attribute, which uses CSS `display: none`.

**Alias:** `data-he-hidden` & `data-he-visible`

### @data

Initializes variables that can be used in JavaScript expressions. This is typically placed on a parent element to set up the initial state for a component or section.

```html
<div @data="{ count: 0, open: false }">
  <button @click="count++">Increment</button>
  <div @visible="open">Modal content</div>
</div>
```

Variables defined with `@data` are available to all child elements and will trigger reactive updates when changed.

**Alias:** `data-he-data`

### @ref

Creates a reference to the element that can be used in JavaScript expressions. For example, this will create a reference called `$list` to this element:

```html
<ul @ref="list"></ul>
```

This element can then be accessed in other JavaScript expressions as `$list` (note the `$` prefix is added automatically), for example:

```html
<ul @ref="list"></ul>
<button @click="$list.classList.add('highlight')">Highlight List</button>
```

Refs are useful for:
- Focusing inputs: `$input.focus()`
- Scrolling to elements: `$section.scrollIntoView()`
- Measuring elements: `$box.getBoundingClientRect()`
- Direct DOM manipulation when needed

**Alias:** `data-he-ref`

### @init

A JavaScript expression that will run once when Helium initializes. Perfect for setting up initial state, fetching data, or starting timers.

```html
<div @init="timestamp = Date.now()"></div>
```

More complex example:

```html
<div @init="users = []; $get('/api/users')">
  <ul @html="users.map(u => `<li>${u.name}</li>`)"></ul>
</div>
```

**Alias:** `data-he-init`

### @calculate

Creates a computed property that automatically updates when its dependencies change. The calculated value is stored in a state variable.

```html
<div @data="{ price: 10, quantity: 2 }">
  <div @calculate:total="price * quantity"></div>
  <p>Total: $<span @text="total">0</span></p>
</div>
```

This will create a `total` variable that automatically recalculates whenever `price` or `quantity` changes.

**Practical examples:**

```html
<!-- Shopping cart total -->
<div @calculate:total="items.reduce((sum, item) => sum + item.price * item.qty, 0)"></div>

<!-- Full name from parts -->
<div @calculate:fullName="firstName + ' ' + lastName"></div>

<!-- Validation state -->
<div @calculate:isValid="email.includes('@') && password.length >= 8"></div>
```

Calculated values are prioritized and updated before other bindings, so you can safely use them in other expressions.

**Alias:** `data-he-calculate`

### @effect

Runs a side effect whenever specified dependencies change. Use `:*` to run on any state change, or list specific dependencies separated by colons.

```html
<!-- Run on any state change -->
<div @effect:*="console.log('State changed:', $data)"></div>

<!-- Run when specific variables change -->
<div @effect:count:name="console.log('Count or name changed')"></div>
```

**Practical examples:**

```html
<!-- Save to localStorage when username changes -->
<div @effect:username="localStorage.setItem('user', username)"></div>

<!-- Log analytics event when page changes -->
<div @effect:currentPage="analytics.track('pageView', currentPage)"></div>

<!-- Update document title -->
<div @effect:unreadCount="document.title = `(${unreadCount}) Messages`"></div>

<!-- Sync multiple values -->
<div @effect:darkMode="document.body.classList.toggle('dark', darkMode)"></div>
```

Effects run after all other bindings have been updated, making them perfect for side effects like logging, storage, or external API calls.

**Alias:** `data-he-effect`

### @import

Imports global functions or variables into Helium's scope, making them available in expressions without the `window.` prefix.

```html
<div @import="myFunction, myVariable">
  <button @click="myFunction()">Call imported function</button>
  <span @text="myVariable">0</span>
</div>
```

If you have global functions defined elsewhere:

```javascript
function hello() {
  console.log("Hello!!!!")
}
```

You can import them:

```html
<div @import="hello">
  <button @click="hello()">Say Hello</button>
</div>
```

This is useful for integrating Helium with existing JavaScript code or third-party libraries.

**Alias:** `data-he-import`

## Event Listeners & Handlers

Event listeners and handlers can be created by prepending `@` before the event

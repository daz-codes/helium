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

## Helium Attributes

Helium uses custom attributes to add interactivity to HTML elements. To identify them, they all start with `@`, although there are also data attribute aliases that can be used instead.

### @helium

This attribute sets the root element. Helium attributes can only be used on this element and its children. If not set then it defaults to `document.body`.

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

**Alias:** `data-he-html`

### @bind

Creates a 2-way binding between an input element's value and a variable. Whatever is entered in the following input field will be stored as a variable called name:

```html
<input @bind="name" placeholder="Enter your name">
```

Works with text inputs, textareas, checkboxes, radio buttons, and select elements.

**Alias:** `data-he-bind`

### @hidden & @visible

Makes the element hidden or visible depending on the result of a JavaScript expression.

```html
<div @visible="count > 3">Only visible if the count is greater than 3</div>
<div @hidden="count <= 3">Hidden when count is 3 or less</div>
```

**Alias:** `data-he-hidden` & `data-he-visible`

### @data

Initializes variables that can be used in JavaScript expressions.

```html
<div @data="{ count: 0, open: false }"></div>
```

**Alias:** `data-he-data`

### @ref

Creates a reference to the element that can be used in JavaScript expressions. For example, this will create a reference called `$list` to this element:

```html
<ul @ref="list"></ul>
```

This element can then be accessed in other JavaScript expressions as `$list`, for example:

```html
<button @click="appendTo($list)">Add Task</button>
```

**Alias:** `data-he-ref`

### @init

A JavaScript expression that will run once when Helium initializes.

```html
<div @init="timestamp = Date.now()"></div>
```

**Alias:** `data-he-init`

### @calculate

Creates a computed property that automatically updates when its dependencies change. The calculated value is stored in a state variable.

```html
<div @calculate:total="price * quantity"></div>
```

This will create a `total` variable that automatically recalculates whenever `price` or `quantity` changes.

**Alias:** `data-he-calculate`

### @effect

Runs a side effect whenever specified dependencies change. Use `:*` to run on any state change, or list specific dependencies.

```html
<!-- Run on any state change -->
<div @effect:*="console.log('State changed')"></div>

<!-- Run when specific variables change -->
<div @effect:count:name="console.log('Count or name changed')"></div>
```

**Alias:** `data-he-effect`

## Event Listeners & Handlers

Event listeners and handlers can be created by prepending `@` before the event name, for example `@click="count++"` will run the code `count++` when the element is clicked on.

```html
<button @click="count++">Increment</button>
```

### Event Modifiers

You can add modifiers by appending them with a dot (`.`) after the event name:

- **prevent** - Prevents the default browser behavior
- **once** - Only runs the event handler once
- **outside** - Only fires when the event happens outside the element
- **document** - Attaches the listener to the document instead of the element
- **debounce** - Debounces the event handler (default 300ms)
- **debounce:500** - Debounces with custom delay in milliseconds
- **shift, ctrl, alt, meta** - Only fires if the modifier key is pressed
- **Key names** - For keyboard events, specify which key (e.g., `@keydown.enter`, `@keyup.esc`)

Examples:

```html
<button @click.prevent="submitForm()">Save</button>
<button @click.once="initialize()">Initialize</button>
<div @click.outside="closeModal()">Modal</div>
<input @input.debounce:500="search()">
<input @keydown.enter="submit()">
<input @keydown.ctrl.s.prevent="save()">
```

**Alias:** Prepend the event name with `data-he-on`, for example `data-he-onclick="count++"`

## HTTP Requests

Helium includes built-in support for making HTTP requests directly from event handlers.

### Available HTTP Methods

- `@get` - GET request
- `@post` - POST request
- `@put` - PUT request
- `@patch` - PATCH request
- `@delete` - DELETE request

The HTTP method is triggered by the element's default event (click for buttons, submit for forms, input for inputs, etc.).

```html
<button @get="/api/data">Load Data</button>
<form @post="/api/users">Submit</form>
```

### HTTP Request Options

Configure requests using these additional attributes:

- **@target** or **data-he-target** - Where to insert the response (CSS selector or ref)
- **@action** or **data-he-action** - How to insert: `replace`, `append`, `prepend`, `before`, `after`
- **@params** or **data-he-params** - Request parameters (object or FormData)
- **@options** or **data-he-options** - Additional fetch options
- **@template** or **data-he-template** - Template function to transform response
- **@loading** or **data-he-loading** - Loading state content to show during request

```html
<button 
  @get="/api/users"
  @target="#user-list"
  @action="replace">
  Load Users
</button>

<form 
  @post="/api/users"
  @params="{ name: username, email: email }"
  @target="#message"
  @loading="Saving...">
  <input @bind="username">
  <input @bind="email">
  <button>Save</button>
</form>
```

### Special Features

- Automatically includes CSRF tokens from `<meta name="csrf-token">` for same-origin requests
- Supports Turbo Stream responses
- Handles JSON and HTML responses
- Works with FormData for file uploads

## Dynamic Attributes

It's possible to dynamically update the attributes of elements. To do this, just prepend a `:` in front of the attribute name and write a JavaScript expression that evaluates to the desired attribute value. This will update whenever any of the Helium variables change value.

In the following example, the `<div>` element has a dynamic class attribute that will be 'normal' if the count is less than 10, but 'danger' if the count is 10 or more:

```html
<div :class="count < 10 ? 'normal' : 'danger'">
    The count is <b @text="count"></b>
</div>
```

### Special Dynamic Attributes

**:class** - Can accept an object to toggle multiple classes:

```html
<div :class="{ active: isActive, disabled: !isEnabled }"></div>
```

**:style** - Can accept an object for multiple styles:

```html
<div :style="{ color: textColor, fontSize: size + 'px' }"></div>
```

**Alias:** `data-he-attr:attributeName`

## Magic Variables

These special variables are available in all JavaScript expressions:

- **$** - Alias for `document.querySelector`
- **$el** - Reference to the current element
- **$event** - The event object (in event handlers)
- **$data** - The reactive data object containing all Helium variables
- **$html** - Helper function to create HTML elements from strings
- **$get, $post, $put, $patch, $delete** - HTTP request functions
- **$refs** - All elements marked with `@ref`

Examples:

```html
<div @click="$('#header').classList.add('active')">Activate Header!</div>
<div @click="$el.remove()">Click to remove me!</div>
<div @click="console.log($event.timeStamp)">Log the timestamp</div>
<div @click="console.log($data)">Log all data</div>
```

## Default Variables and Functions

The helium function accepts a single JavaScript object as an argument. This can include default variable values and functions that can then be called inside the JavaScript expressions.

For example, the following will set the count variable to an initial value of 29 and the name variable to "Helium":

```javascript
helium({ 
  count: 29, 
  name: "Helium"
})
```

The following example shows how a function can be added into Helium and then used by event listeners:

```javascript
helium({ 
  appendTo(element) {
    const li = document.createElement("li")
    li.textContent = "New Item"
    element.append(li)
  }
})
```

This function can then be called from an event handler, such as `@click`:

```html
<ul @ref="list"></ul>
<button @click="appendTo($list)">Append item to list</button>
```

### Important Note About Functions

Magic variables and Helium variables are not available inside these functions. However, you can pass them as arguments and they will then be available in the function. 

If you pass Helium variables, they will be passed as values and updating them inside the function will **not** trigger a reactive update. A solution is to pass the magic `$data` attribute as an argument, then updating the properties of this inside the function **will** trigger a reactive update.

So instead of this:

```html
<button @click="increment(count)">Increment Count</button>
```

```javascript
helium({ 
  increment(count, n = 1) {
    count += n  // Won't trigger reactivity
  }
})
```

You should do this instead:

```html
<button @click="increment($data)">Increment Count</button>
```

```javascript
helium({ 
  increment(data, n = 1) {
    data.count += n  // Will trigger reactivity
  }
})
```

## Advanced Features

### DOM Morphing

If Idiomorph is available, Helium will use it for efficient DOM updates when updating innerHTML, preserving element state and reducing flicker.

### List Rendering

When rendering arrays with `@html`, Helium can efficiently update lists by using `key` or `data-key` attributes on child elements for tracking.

```html
<ul @html="items.map(item => `<li key='${item.id}'>${item.name}</li>`)"></ul>
```

### MutationObserver

Helium automatically observes the DOM and processes new elements as they're added, making it work seamlessly with dynamically inserted content.

### CSRF Protection

Helium automatically includes CSRF tokens from `<meta name="csrf-token">` elements in same-origin requests for enhanced security.

## Browser Compatibility

Helium uses modern JavaScript features including Proxy, MutationObserver, and ES6 syntax. It works in all modern browsers that support ES6 modules.

# 🎈 Helium 🎈

The ultra-light library that makes HTML interactive!

Here's a simple example of a button that counts the number of times it has been clicked and turns red after more than 3 clicks:

```html
<button @click="count++" :style="count > 3 && 'background: red'">
    clicked <b @text="count">0</b> times
</button>
```

It's really simple to use - just sprinkle the magic @attributes into your HTML and watch it come alive!

[See more examples here](https://codepen.io/daz4126/pen/ogxGMX)

## Why Helium?

Helium is designed for developers who want:

- **Zero build step** - Works directly in the browser with a simple script tag
- **Minimal learning curve** - If you know HTML and basic JavaScript, you're ready
- **Ultra-lightweight** - Under 3KB minified and gzipped
- **Template-first** - Your HTML is the source of truth, not JavaScript
- **Progressive enhancement** - Add interactivity gradually where you need it

## Installation

### CDN (No build step required!)

Just import from the CDN in a script tag directly in your HTML page:

```html
<script type="module">
  import helium from 'https://cdn.jsdelivr.net/gh/daz-codes/helium/helium.js';
</script>
```

### NPM

```bash
npm install @daz4126/helium
```

Then include it in your JavaScript file and call the helium() function:

```javascript
import helium from "@daz4126/helium"
```

### Automatic Initialization

Helium automatically initializes on `DOMContentLoaded`, so you typically don't need to call `helium()` manually unless you're providing default values or functions.

## Helium Attributes

Helium uses custom attributes to add interactivity to HTML elements. To identify them, they all start with `@`, although there are also data attribute aliases that can be used instead (useful for HTML validators).

### @helium

This attribute sets the root element. Helium attributes can only be used on this element and its children. If not set then it defaults to `document.body`.

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

**Alias:** `data-he-bind`

### @hidden & @visible

Makes the element hidden or visible depending on the result of a JavaScript expression.

```html
<div @visible="count > 3">Only visible if the count is greater than 3</div>
<div @hidden="count <= 3">Hidden when count is 3 or less</div>
```

**Alias:** `data-he-hidden` & `data-he-visible`

### @data

Initializes variables that can be used in JavaScript expressions. This is useful for setting up initial state.

```html
<div @data="{ count: 0, open: false, name: 'Helium' }"></div>
```

You can then use these variables in other Helium attributes:

```html
<div @data="{ count: 0 }">
  <button @click="count++">Increment</button>
  <p @text="count"></p>
</div>
```

**Alias:** `data-he-data`

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

Imports global functions or variables from the `window` object into Helium's scope, making them available in Helium expressions.

```html
<div @import="myFunction,myVariable">
  <button @click="myFunction()">Call Imported Function</button>
  <p @text="myVariable"></p>
</div>
```

This is useful when you have existing global functions and want to use them with Helium without passing them through the `helium()` initialization.

**Example:**
```html
<script>
  function greet(name) {
    alert(`Hello, ${name}!`);
  }
  
  window.appConfig = {
    version: '1.0.0',
    apiUrl: 'https://api.example.com'
  };
</script>

<div @import="greet,appConfig">
  <button @click="greet('World')">Greet</button>
  <p @text="appConfig.version"></p>
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

**Alias:** Prepend the event name with `data-he-on`, for example `data-he-onclick="count++"`

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

### $refs
Object containing all elements marked with `@ref` (prefixed with `$`):

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

If you're using a Content Security Policy, note that Helium uses `new Function()` to evaluate expressions. You'll need to allow `unsafe-eval` or use a build step to pre-compile expressions (coming in a future version).

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

**❌ Don't mutate arrays/objects without triggering reactivity:**

```javascript
helium({
  addItem(items, item) {
    items.push(item); // ❌ Won't trigger updates
  }
})
```

**✅ Pass $data and update through it:**

```javascript
helium({
  addItem(data, item) {
    data.items.push(item); // ✅ Triggers updates
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

## Security Considerations

### XSS Protection

**Always sanitize user input when using @html:**

```html
<!-- ❌ Dangerous if userInput contains scripts -->
<div @html="userInput"></div>

<!-- ✅ Sanitize first -->
<div @html="sanitize(userInput)"></div>
```

Consider using a sanitization library like [DOMPurify](https://github.com/cure53/DOMPurify):

```javascript
import DOMPurify from 'dompurify';

helium({
  sanitize(html) {
    return DOMPurify.sanitize(html);
  }
});
```

**Use @text for plain text:**

```html
<!-- ✅ Safe - automatically escapes HTML -->
<div @text="userInput"></div>
```

### CSRF Protection

Helium automatically includes CSRF tokens in same-origin requests. Add this meta tag to your HTML:

```html
<meta name="csrf-token" content="your-csrf-token">
```

All POST, PUT, PATCH, and DELETE requests will include the `X-CSRF-Token` header automatically.

### Content Security Policy

If you're using a strict CSP, you may need to allow `'unsafe-eval'` since Helium uses `new Function()` to compile expressions, or use a hash/nonce for the script.

## Error Handling

### JavaScript Expression Errors

If an expression throws an error, Helium catches it silently and continues. Check the browser console for error messages.

```html
<!-- If items is undefined, this won't crash the page -->
<div @text="items.length"></div>
```

### HTTP Request Errors

Failed requests log errors to the console. Handle them in your expressions:

```html
<button 
  @post="/api/save"
  @params="{ data: formData }"
  @target="#message">
  Save
</button>

<div id="message" @html="saveError || 'Ready to save'"></div>
```

### Invalid Attribute Syntax

Helium gracefully handles invalid syntax. If an expression can't be compiled, it treats it as a literal value.


## Contributing

Helium is open source! Contributions, issues, and feature requests are welcome.

- GitHub: [github.com/daz-codes/helium](https://github.com/daz-codes/helium)
- Report issues: Create an issue on GitHub
- Suggest features: Open a discussion on GitHub

## License

MIT License - feel free to use Helium in personal and commercial projects.

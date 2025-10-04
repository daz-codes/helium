# 🎈Helium🎈

The ultra-light library that makes HTML interactive!

Here's a simple example of a button that counts clicks and turns red after more than 3 presses:

```html
<button @helium @click="count++" :style="count > 3 && 'background: red'">
    clicked <span @text="count">0</span> times
</button>
```

[See more examples here](https://codepen.io/daz4126/pen/YPwwdBK)

To use, just import from the CDN then call the `helium` funtion (no install or build step required!):

```javascript
import helium from "https://cdn.jsdelivr.net/gh/daz-codes/helium/helium.js"
helium()
```

Alernatively you can install from NPM:

```bash
npm install @daz4126/helium
```

Then include it in your

```javascript
import helium from "@daz4126/helium"
helium
```

## `@helium`

This attribute sets the root element. Helium attributes can only be used on this element and its children. If not set then it defaults to `document`.

Alias: `data-helium`

## `@text`

Inserts the result of a JavaScript expression into the text-content of the element.

This will update the textContent of the element with the value of the `count` variable:

```html
<b @text="count">0</b>
```

You can also use expresions. This will update the textContent of the element with the value of the `name` variable but in uppercase:

```html
<span @text="name.toUpperCase()">0</span>
```

Alias: `data-he-text`

## `@bind`

Creates a 2-way binding between an input or textcontent element's value attribute and a variable.

Whatever is entered in the following input field will be stored as a variable called `name`:

```html
<input @bind="name" placeholder="Enter your name">
```

Alias: `data-he-bind`

## `@hidden` & `@visible`

Makes the element hidden or visible depending on the result of a JavaScript expression.

```html
<div @hidden="count > 3">Only visible if the count is greater than 3</div>
```

Alias: `data-he-hidden` & `data-he-visible`

## `@data`

Initializes variables that can be used in JacaScript expressions.

```html
<div @data="{ count: 0, open: false }"></div>
```

Alias: `data-he-data`

## `@ref`

Creates a reference to the element that can be used in JavaScript expressions.

For example, this will create a reference called `$list` to this element:

```html
<ul @ref="list"></ul>
```

This element can then be accessed in other JavaScript expressions as `$list`, for example:

```html
<button @click="appendTo($list)">Add Task</button>
```

Alias: `data-he-ref`

## `@init`

A JavaScript expression that will run once when Helium initializes.

```html
<div @init="timestamp = Date.now()"></div>
```

Alias: `data-he-init`

## Event Listeners & Handlers

Event listeners and handlers can be created by prepending `@` before the event name, for example `@click="count++"` will run the cound `count++` when the element is clicked on.

```html
<button @click="count++">Increment</button>
```

You can add modifiers of `prevent` to prevent the default behaviour, `outside` to only fire when the event happens outside the element and `once` to only run the event handler once.

```html
<button @click.prevent="submitForm()">Save</button>
```

Alias: prepend the event name with `data-he-on`, for example `data-he-onclick="count++"`

## Conditional Attributes

## Magic Attributes

`$` is an alias for `document.querySelector`

`$el` is an alias for the element

`$event` is an alias for the event object of an event handler

## Default Variables and Functions

The helium function accepts a single JavaScript object as an argument. This can include default variable values and functions that can then be called inside the JavaScript expressions.

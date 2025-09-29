# 🎈Helium🎈

The ultra-light library that makes HTML interactive!

Here's a simple example of a button that counts clicks and turns red after more than 3 presses:

```html
<button @helium @click="count++" :style="count > 3 && 'background: red'">
    clicked <span @react="count">0</span> times
</button>
```

[See more examples here](https://codepen.io/daz4126/pen/YPwwdBK)

To use, just import from npm then call the `helium` funtion:

```javascript
import helium from "@daz4126/helium"
helium()
```

## @helium

This attribute is needed on the root element for all the other attributes to work.

Alias: `data-helium`

## @react

Inserts the result of a JavaScript expression into the text-content of the element

Alias: `data-he-react`

## @bind

Creates a 2-way binding between an input or textcontent element's value attribute and a variable.

Alias: `data-he-bind`

## @hidden and @visible

Makes the element hidden or visible depending on the result of a JavaScript expression.

Alias: `data-he-hidden` and `data-he-visible`

## @data

Initializes variables that can be used in JacaScript expressions.

Alias: `data-he-data`

## @ref

Creates a reference to the element that can be used in JavaScript expressions.

Alias: `data-he-ref`

## @init

A JavaScript expression that will run once when Helium initializes.

Alias: `data-he-init`

## Event Listeners & Handlers

Event listeners and handlers can be created by prepending `@` before the event name, for example `@click="count++"` will run the cound `count++` when the element is clicked on.

Alias: prepend the event name with `data-he-on`, for example `data-he-onclick="count++"`

## Conditional Attributes

## Magic Attributes

`$` is an alias for `document.querySelector`

`$el` is an alias for the element

`$event` is an alias for the event object of an event handler

## Default Variables and Functions

The helium function accepts a single JavaScript object as an argument. This can inlude default variable values  and functions that can then be called inside the JavaScript expressions.

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

## @react

## @bind

## @hidden and @visible

## @data

## @ref

## @init

## Event Handlers

## Conditional Attributes

## Magic Attributes
`$`
`$el`
`$event`

## Default State and Functions

# 🎈Helium🎈

The ultra-light library that makes HTML interactive!

Here's a simple example of a button that counts the number of times it has been clicked and turns red after more than 3 clicks:

```html
<button @click="count++" :style="count > 3 && 'background: red'">
    clicked <b @text="count">0</b> times
</button>
```

It's really simple to use - just sprinkle the magic @attributes into your HTML and watch it come alive!

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
helium()
```

# Helium Attributes

Helium uses custom attributes to add interactivity to HTML elements. To identify them, they all start with `@`, although there are also `data` attribute aliases that can be used instead.

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
<div @visible="count > 3">Only visible if the count is greater than 3</div>
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

## Dynamic Attributes

It's possible to dynamically update the attributes of elements. To do this, just prepend a `:` in front of the attribute name and write a JavaScript expression that evaulates to the desired attribute value. This will update whenever any of the Helium variables change value.

In the following example, the `<div>` element has a dynamic class attribute that will be 'normal' if the count is less than 10, but 'danger' if the count is 10 or more:

```html
<div :class="count < 10 ? 'normal' : 'danger'>
    The count is <b @text=count></b>
</div>
```

## Magic Attributes

`$` is an alias for `document.querySelector`


```html
<div @click="$('#header').classList.add('active')">Activate Header!</div>
```

`$el` is an alias for the element:

```html
<div @click="$el.remove()">Click to remove me!</div>
```

`$event` is an alias for the event object of an event handler:


```html
<div @click="console.log($event.timeStamp)">Log the timestamp</div>
```

`@data` gives you access to the data object that contains all the Helium variables:


```html
<div @click="console.log($data)">Log the data</div>
```

## Default Variables and Functions

The helium function accepts a single JavaScript object as an argument. This can include default variable values and functions that can then be called inside the JavaScript expressions.

For example, the following will set the `count` variable to an initial value of `29` and the `name` variable to "Helium":

```javascript
helium({ count: 29, name: "Helium"})
```

The following example shows how a function can be added into Helium and then used by even listeners:

```javascript
helium({ 
    appendTo(element){
        const li = document.createElement("li")
        li.textContent = "New Item"
        element.append(li)
    }
})
```

This function can then be called from an event handler, such as `@click`:

```html
<ul @ref="list"></ul>
<button @click="appendTo($list)>Append item to list</button>
```

Note that magic attributes and Helium variables are not available inside these functions. However, you can pass them as arguments and they will then be available in the function. If you pass Helium variables then they will be passed as values and updating them inside the function will *not* trigger a reactive update. A solution is to pass the magic `$data` attribute as an argument, then updating the properties of this inside the function *will* trigger a reactive update.

So instead of this:

```html
<button @click="increment(count)">Increment Count</button>
```

```javascript
helium({ 
    increment(count,n = 1){
        count += n
    }
})

You should do this instead:

```html
<button @click="increment($data)">Increment Count</button>
```

```javascript
helium({ 
    increment(data,n = 1){
        data.count += n
    }
})

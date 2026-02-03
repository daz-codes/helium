import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { helium, heliumTeardown, evaluate, preprocess } from './helium-csp.js';

describe('Helium CSP - CSP-Safe Reactive Library', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    container.setAttribute('data-helium', '');
    document.body.appendChild(container);
  });

  afterEach(() => {
    heliumTeardown();
    document.body.innerHTML = '';
  });

  describe('Expression Parser', () => {
    it('should preprocess count++ to assignment', () => {
      expect(preprocess('count++')).toBe('(count = count + 1) - 1');
      expect(preprocess('++count')).toBe('(count = count + 1)');
      expect(preprocess('count--')).toBe('(count = count - 1) + 1');
      expect(preprocess('--count')).toBe('(count = count - 1)');
    });

    it('should evaluate simple expressions', () => {
      const scope = { count: 5, name: 'World' };
      expect(evaluate('count', scope)).toBe(5);
      expect(evaluate('count + 1', scope)).toBe(6);
      expect(evaluate('name', scope)).toBe('World');
    });

    it('should evaluate property access', () => {
      const scope = { user: { name: 'Alice' }, items: [1, 2, 3] };
      expect(evaluate('user.name', scope)).toBe('Alice');
      expect(evaluate('items[0]', scope)).toBe(1);
      expect(evaluate('items.length', scope)).toBe(3);
    });

    it('should evaluate comparisons and ternary', () => {
      const scope = { count: 5 };
      expect(evaluate('count > 3', scope)).toBe(true);
      expect(evaluate('count > 3 ? "big" : "small"', scope)).toBe('big');
    });

    it('should handle assignments', () => {
      const scope = { count: 0 };
      evaluate('count = 5', scope);
      expect(scope.count).toBe(5);
    });

    it('should handle increment/decrement', () => {
      const scope = { count: 5 };
      expect(evaluate('count++', scope)).toBe(5);
      expect(scope.count).toBe(6);
      expect(evaluate('++count', scope)).toBe(7);
      expect(scope.count).toBe(7);
    });

    it('should call functions', () => {
      const scope = {
        greet: (name) => `Hello, ${name}!`,
        add: (a, b) => a + b
      };
      expect(evaluate('greet("World")', scope)).toBe('Hello, World!');
      expect(evaluate('add(2, 3)', scope)).toBe(5);
    });

    it('should handle comma operator', () => {
      const scope = { a: 0, b: 0, c: 0 };
      // Comma operator evaluates all expressions, returns the last
      expect(evaluate('a = 1, b = 2', scope)).toBe(2);
      expect(scope.a).toBe(1);
      expect(scope.b).toBe(2);

      // Three expressions
      expect(evaluate('a = 10, b = 20, c = 30', scope)).toBe(30);
      expect(scope.a).toBe(10);
      expect(scope.b).toBe(20);
      expect(scope.c).toBe(30);
    });

    it('should not transform commas inside function calls or arrays', () => {
      const scope = { add: (a, b) => a + b, arr: [] };
      expect(evaluate('add(1, 2)', scope)).toBe(3);
      expect(preprocess('add(1, 2)')).toBe('add(1, 2)');
      expect(preprocess('[1, 2, 3]')).toBe('[1, 2, 3]');
      expect(preprocess('{a: 1, b: 2}')).toBe('{a: 1, b: 2}');
    });
  });

  describe('State Reactivity', () => {
    it('should initialize with default data', async () => {
      container.innerHTML = '<div @text="count"></div>';
      await helium({ count: 5 });
      expect(container.querySelector('div').textContent).toBe('5');
    });

    it('should react to direct property assignment', async () => {
      container.innerHTML = '<div @text="count"></div>';
      const state = await helium({ count: 0 });

      state.count = 10;
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('div').textContent).toBe('10');
    });

    it('should react to nested object mutations', async () => {
      container.innerHTML = '<div @text="user.name"></div>';
      const state = await helium({ user: { name: 'Alice' } });

      state.user.name = 'Bob';
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('div').textContent).toBe('Bob');
    });

    it('should react to array push', async () => {
      container.innerHTML = '<div @text="items.length"></div>';
      const state = await helium({ items: [1, 2, 3] });

      state.items.push(4);
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('div').textContent).toBe('4');
    });

    it('should react to array index assignment', async () => {
      container.innerHTML = '<div @text="items[0]"></div>';
      const state = await helium({ items: ['a', 'b', 'c'] });

      state.items[0] = 'z';
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('div').textContent).toBe('z');
    });

    it('should react to complete array replacement', async () => {
      container.innerHTML = '<div @text="items.length"></div>';
      const state = await helium({ items: [1, 2, 3] });

      state.items = [...state.items, 4, 5];
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('div').textContent).toBe('5');
    });
  });

  describe('Directives - @text and @html', () => {
    it('should bind text content with @text', async () => {
      container.innerHTML = '<div @text="message"></div>';
      await helium({ message: 'Hello World' });
      expect(container.querySelector('div').textContent).toBe('Hello World');
    });

    it('should bind HTML content with @html', async () => {
      container.innerHTML = '<div @html="content"></div>';
      await helium({ content: '<strong>Bold</strong>' });
      expect(container.querySelector('div').innerHTML).toBe('<strong>Bold</strong>');
    });

    it('should work with data-he-text prefix', async () => {
      container.innerHTML = '<div data-he-text="message"></div>';
      await helium({ message: 'Test' });
      expect(container.querySelector('div').textContent).toBe('Test');
    });

    it('should evaluate expressions in @text', async () => {
      container.innerHTML = '<div @text="count * 2"></div>';
      await helium({ count: 5 });
      expect(container.querySelector('div').textContent).toBe('10');
    });

    it('should handle ternary in @text', async () => {
      container.innerHTML = '<span @text="count > 5 ? \'big\' : \'small\'"></span>';
      await helium({ count: 3 });
      expect(container.querySelector('span').textContent).toBe('small');
    });
  });

  describe('Directives - @bind', () => {
    it('should create two-way binding with input', async () => {
      container.innerHTML = '<input @bind="name" />';
      await helium({ name: 'John' });
      const input = container.querySelector('input');

      expect(input.value).toBe('John');
    });

    it('should update state when input changes', async () => {
      container.innerHTML = '<input @bind="name" /><span @text="name"></span>';
      await helium({ name: 'John' });
      const input = container.querySelector('input');

      input.value = 'Jane';
      input.dispatchEvent(new Event('input'));

      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('span').textContent).toBe('Jane');
    });

    it('should handle checkbox binding', async () => {
      container.innerHTML = '<input type="checkbox" @bind="checked" />';
      const state = await helium({ checked: true });
      const input = container.querySelector('input');

      expect(input.checked).toBe(true);

      input.checked = false;
      input.dispatchEvent(new Event('change'));

      expect(state.checked).toBe(false);
    });

    it('should handle radio button binding', async () => {
      container.innerHTML = `
        <input type="radio" name="color" value="red" @bind="color" />
        <input type="radio" name="color" value="blue" @bind="color" />
      `;
      const state = await helium({ color: 'red' });
      const [red, blue] = container.querySelectorAll('input');

      expect(red.checked).toBe(true);
      expect(blue.checked).toBe(false);

      blue.checked = true;
      blue.dispatchEvent(new Event('change'));

      expect(state.color).toBe('blue');
    });

    it('should handle select binding', async () => {
      container.innerHTML = `
        <select @bind="choice">
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
      `;
      const state = await helium({ choice: 'b' });
      const select = container.querySelector('select');

      expect(select.value).toBe('b');

      select.value = 'a';
      select.dispatchEvent(new Event('change'));

      expect(state.choice).toBe('a');
    });
  });

  describe('Directives - @hidden and @visible', () => {
    it('should hide element with @hidden when true', async () => {
      container.innerHTML = '<div @hidden="isHidden"></div>';
      await helium({ isHidden: true });
      expect(container.querySelector('div').hidden).toBe(true);
    });

    it('should show element with @hidden when false', async () => {
      container.innerHTML = '<div @hidden="isHidden"></div>';
      await helium({ isHidden: false });
      expect(container.querySelector('div').hidden).toBe(false);
    });

    it('should show element with @visible when true', async () => {
      container.innerHTML = '<div @visible="isVisible"></div>';
      await helium({ isVisible: true });
      expect(container.querySelector('div').hidden).toBe(false);
    });

    it('should hide element with @visible when false', async () => {
      container.innerHTML = '<div @visible="isVisible"></div>';
      await helium({ isVisible: false });
      expect(container.querySelector('div').hidden).toBe(true);
    });
  });

  describe('Directives - Dynamic Attributes (:attr)', () => {
    it('should bind attribute dynamically', async () => {
      container.innerHTML = '<div :class="className"></div>';
      await helium({ className: 'active' });
      expect(container.querySelector('div').getAttribute('class')).toBe('active');
    });

    it('should update attribute on state change', async () => {
      container.innerHTML = '<div :title="tooltip"></div>';
      const state = await helium({ tooltip: 'Initial' });

      state.tooltip = 'Updated';
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('div').getAttribute('title')).toBe('Updated');
    });

    it('should handle :class with object syntax', async () => {
      container.innerHTML = '<div :class="{ active: isActive, disabled: isDisabled }"></div>';
      await helium({ isActive: true, isDisabled: false });
      const div = container.querySelector('div');
      expect(div.classList.contains('active')).toBe(true);
      expect(div.classList.contains('disabled')).toBe(false);
    });

    it('should handle :style with object syntax', async () => {
      container.innerHTML = '<div :style="{ color: textColor }"></div>';
      await helium({ textColor: 'red' });
      expect(container.querySelector('div').style.color).toBe('red');
    });
  });

  describe('Event Handlers', () => {
    it('should handle click events', async () => {
      container.innerHTML = '<button @click="count++">Click</button><span @text="count"></span>';
      await helium({ count: 0 });

      container.querySelector('button').click();
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('span').textContent).toBe('1');
    });

    it('should handle event with prevent modifier', async () => {
      container.innerHTML = '<form @submit.prevent="submitted = true"></form>';
      await helium({ submitted: false });
      const form = container.querySelector('form');
      const event = new Event('submit', { cancelable: true });

      form.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it('should handle event with stop modifier', async () => {
      container.innerHTML = '<div @click="outer = true"><button @click.stop="inner = true">Click</button></div>';
      const state = await helium({ outer: false, inner: false });

      container.querySelector('button').click();
      await new Promise(r => setTimeout(r, 0));

      expect(state.inner).toBe(true);
      expect(state.outer).toBe(false);
    });

    it('should handle keyboard events with key modifiers', async () => {
      container.innerHTML = '<input @keydown.enter="pressed = true" />';
      const state = await helium({ pressed: false });
      const input = container.querySelector('input');

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      input.dispatchEvent(event);

      await new Promise(r => setTimeout(r, 0));
      expect(state.pressed).toBe(true);
    });

    it('should handle Space key', async () => {
      container.innerHTML = '<button @keydown.space="pressed = true">Press</button>';
      const state = await helium({ pressed: false });
      const button = container.querySelector('button');

      const event = new KeyboardEvent('keydown', { key: ' ' });
      button.dispatchEvent(event);

      await new Promise(r => setTimeout(r, 0));
      expect(state.pressed).toBe(true);
    });

    it('should handle Escape key as Esc', async () => {
      container.innerHTML = '<input @keydown.esc="pressed = true" />';
      const state = await helium({ pressed: false });
      const input = container.querySelector('input');

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      input.dispatchEvent(event);

      await new Promise(r => setTimeout(r, 0));
      expect(state.pressed).toBe(true);
    });

    it('should handle modifier keys (ctrl, shift, alt, meta)', async () => {
      container.innerHTML = '<input @keydown.ctrl.s="saved = true" />';
      const state = await helium({ saved: false });
      const input = container.querySelector('input');

      // Without ctrl - should not trigger
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
      await new Promise(r => setTimeout(r, 0));
      expect(state.saved).toBe(false);

      // With ctrl - should trigger
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
      await new Promise(r => setTimeout(r, 0));
      expect(state.saved).toBe(true);
    });

    it('should handle debounced events', async () => {
      container.innerHTML = '<input @input.debounce:100="value = $event.target.value" />';
      const state = await helium({ value: '' });
      const input = container.querySelector('input');

      input.value = 'test';
      input.dispatchEvent(new Event('input'));

      // Should not update immediately
      expect(state.value).toBe('');

      await new Promise(resolve => setTimeout(resolve, 150));
      expect(state.value).toBe('test');
    });

    it('should handle once modifier', async () => {
      container.innerHTML = '<button @click.once="count++">Click</button>';
      const state = await helium({ count: 0 });
      const button = container.querySelector('button');

      button.click();
      button.click();
      button.click();

      await new Promise(r => setTimeout(r, 0));
      expect(state.count).toBe(1);
    });
  });

  describe('@ref Directive', () => {
    it('should create reference to element', async () => {
      container.innerHTML = '<div @ref="myDiv"></div><button @click="$myDiv.textContent = \'Changed\'">Change</button>';
      await helium({});

      container.querySelector('button').click();
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('div').textContent).toBe('Changed');
    });

    it('should make refs available in state', async () => {
      container.innerHTML = '<input @ref="myInput" value="test" /><span @text="$myInput.value"></span>';
      await helium({});
      // The span should display the input's value via the ref
      expect(container.querySelector('span').textContent).toBe('test');
    });
  });

  describe('@init Directive', () => {
    it('should execute code on initialization', async () => {
      container.innerHTML = '<div @init="initialized = true"></div>';
      const state = await helium({ initialized: false });
      expect(state.initialized).toBe(true);
    });

    it('should run after all bindings are set up', async () => {
      container.innerHTML = '<span @text="value"></span><div @init="value = \'set by init\'"></div>';
      await helium({ value: 'initial' });
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('span').textContent).toBe('set by init');
    });
  });

  describe('@data Directive', () => {
    it('should merge data into state', async () => {
      container.innerHTML = '<div @data="{ user: \'Alice\', age: 30 }"></div><span @text="user"></span>';
      await helium({});
      expect(container.querySelector('span').textContent).toBe('Alice');
    });
  });

  describe('@calculate Directive', () => {
    it('should create computed properties', async () => {
      container.innerHTML = '<div @calculate:double="count * 2"></div><span @text="double"></span>';
      const state = await helium({ count: 5 });
      expect(container.querySelector('span').textContent).toBe('10');

      state.count = 10;
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('span').textContent).toBe('20');
    });
  });

  describe('@effect Directive', () => {
    it('should run side effects on state change', async () => {
      // Effect updates lastSeen which doesn't trigger the effect (different key)
      container.innerHTML = '<div @effect="lastSeen = count"></div>';
      const state = await helium({ count: 0, lastSeen: -1 });

      state.count = 1;
      await new Promise(r => setTimeout(r, 0));
      expect(state.lastSeen).toBe(1);

      state.count = 2;
      await new Promise(r => setTimeout(r, 0));
      expect(state.lastSeen).toBe(2);
    });

    it('should support wildcard @effect:*', async () => {
      // Effect tracks any change via a different state key
      container.innerHTML = '<div @effect:*="effectRan = anyValue > 0"></div>';
      const state = await helium({ effectRan: false, anyValue: 0 });

      state.anyValue = 42;
      await new Promise(r => setTimeout(r, 0));

      expect(state.effectRan).toBe(true);
    });
  });

  describe('Helper Functions', () => {
    it('should provide $ selector helper', async () => {
      container.innerHTML = '<div id="target"></div><button @click="$(\'#target\').textContent = \'Found\'">Click</button>';
      await helium({});

      container.querySelector('button').click();
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('#target').textContent).toBe('Found');
    });

    it('should provide $html helper to create elements', async () => {
      container.innerHTML = '<div @init="$el.appendChild($html(\'<span>Test</span>\'))"></div>';
      await helium({});
      expect(container.querySelector('span').textContent).toBe('Test');
    });

    it('should provide $event in event handlers', async () => {
      container.innerHTML = '<input @input="lastKey = $event.target.value" />';
      const state = await helium({ lastKey: '' });
      const input = container.querySelector('input');

      input.value = 'x';
      input.dispatchEvent(new Event('input'));

      expect(state.lastKey).toBe('x');
    });

    it('should provide $el in expressions', async () => {
      container.innerHTML = '<button @click="$el.textContent = \'Clicked\'">Click me</button>';
      await helium({});

      const button = container.querySelector('button');
      button.click();

      expect(button.textContent).toBe('Clicked');
    });
  });

  describe('AJAX Helpers', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it('should call GET request with $get', async () => {
      global.fetch.mockResolvedValueOnce({
        headers: { get: () => 'application/json' },
        json: async () => ({ data: 'test' })
      });

      container.innerHTML = '<button @click="$get(\'/api/data\', \'result\')">Load</button><div @text="result?.data"></div>';
      await helium({ result: null });

      container.querySelector('button').click();

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(global.fetch).toHaveBeenCalledWith('/api/data', expect.any(Object));
    });

    it('should call POST request with $post', async () => {
      global.fetch.mockResolvedValueOnce({
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true })
      });

      container.innerHTML = '<button @click="$post(\'/api/save\', { name: \'test\' }, \'response\')">Save</button>';
      await helium({ response: null });

      container.querySelector('button').click();

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(global.fetch).toHaveBeenCalledWith('/api/save', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'test' })
      }));
    });
  });

  describe('Dynamic DOM Updates', () => {
    it('should process dynamically added elements', async () => {
      container.innerHTML = '<div id="container"></div>';
      await helium({ message: 'Dynamic' });

      const newEl = document.createElement('span');
      newEl.setAttribute('data-he-text', 'message');
      container.querySelector('#container').appendChild(newEl);

      await new Promise(r => setTimeout(r, 100));
      expect(newEl.textContent).toBe('Dynamic');
    });

    it('should cleanup listeners when elements are removed', async () => {
      container.innerHTML = '<div id="wrapper"><button @click="count++">Click</button></div>';
      const state = await helium({ count: 0 });

      const button = container.querySelector('button');
      button.click();
      await new Promise(r => setTimeout(r, 0));
      expect(state.count).toBe(1);

      // Remove the element
      container.querySelector('#wrapper').innerHTML = '';
      await new Promise(r => setTimeout(r, 50));

      // The button should no longer exist and listeners should be cleaned up
      expect(container.querySelector('button')).toBe(null);
    });
  });

  describe('Template Literals', () => {
    it('should evaluate simple template literal', async () => {
      container.innerHTML = '<div @text="`Hello World`"></div>';
      await helium();
      expect(container.querySelector('div').textContent).toBe('Hello World');
    });

    it('should interpolate single variable', async () => {
      container.innerHTML = '<div @text="`Hello ${name}!`"></div>';
      await helium({ name: 'Alice' });
      expect(container.querySelector('div').textContent).toBe('Hello Alice!');
    });

    it('should interpolate multiple variables', async () => {
      container.innerHTML = '<div @text="`${greeting}, ${name}!`"></div>';
      await helium({ greeting: 'Hi', name: 'Bob' });
      expect(container.querySelector('div').textContent).toBe('Hi, Bob!');
    });

    it('should interpolate expressions', async () => {
      container.innerHTML = '<div @text="`Count: ${count + 1}`"></div>';
      await helium({ count: 5 });
      expect(container.querySelector('div').textContent).toBe('Count: 6');
    });

    it('should handle template at start of expression', async () => {
      container.innerHTML = '<div @text="`${name}`"></div>';
      await helium({ name: 'test' });
      expect(container.querySelector('div').textContent).toBe('test');
    });

    it('should handle adjacent dollar signs', async () => {
      container.innerHTML = '<div @text="`Price: $${price}`"></div>';
      await helium({ price: 99 });
      expect(container.querySelector('div').textContent).toBe('Price: $99');
    });

    it('should handle empty template literal', async () => {
      container.innerHTML = '<div @text="``"></div>';
      await helium();
      expect(container.querySelector('div').textContent).toBe('');
    });

    it('should handle template with no interpolation', async () => {
      container.innerHTML = '<div @text="`Just a string`"></div>';
      await helium();
      expect(container.querySelector('div').textContent).toBe('Just a string');
    });

    it('should handle nested braces in interpolation', async () => {
      container.innerHTML = '<div @text="`Result: ${obj.value}`"></div>';
      await helium({ obj: { value: 42 } });
      expect(container.querySelector('div').textContent).toBe('Result: 42');
    });

    it('should handle method calls in interpolation', async () => {
      container.innerHTML = '<div @text="`Name: ${name.toUpperCase()}`"></div>';
      await helium({ name: 'alice' });
      expect(container.querySelector('div').textContent).toBe('Name: ALICE');
    });

    it('should handle ternary in interpolation', async () => {
      container.innerHTML = '<div @text="`Status: ${active ? \'on\' : \'off\'}`"></div>';
      await helium({ active: true });
      expect(container.querySelector('div').textContent).toBe('Status: on');
    });

    it('should escape single quotes in static parts', async () => {
      container.innerHTML = `<div @text="\`It's working\`"></div>`;
      await helium();
      expect(container.querySelector('div').textContent).toBe("It's working");
    });

    it('should handle escaped backticks', async () => {
      container.innerHTML = '<div @text="`Code: \\`test\\``"></div>';
      await helium();
      expect(container.querySelector('div').textContent).toBe('Code: `test`');
    });

    it('should handle escaped dollar signs', async () => {
      container.innerHTML = '<div @text="`Cost: \\${100}`"></div>';
      await helium();
      expect(container.querySelector('div').textContent).toBe('Cost: ${100}');
    });

    it('should update reactively', async () => {
      container.innerHTML = '<div @text="`Count: ${count}`"></div>';
      const state = await helium({ count: 0 });
      expect(container.querySelector('div').textContent).toBe('Count: 0');
      state.count = 5;
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('div').textContent).toBe('Count: 5');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined state values', async () => {
      container.innerHTML = '<div @text="undefined"></div>';
      await helium({});
      expect(container.querySelector('div').textContent).toBe('');
    });

    it('should handle null state values', async () => {
      container.innerHTML = '<div @text="value"></div>';
      await helium({ value: null });
      expect(container.querySelector('div').textContent).toBe('');
    });

    it('should handle circular references in state', () => {
      const obj = { name: 'test' };
      obj.self = obj;

      container.innerHTML = '<div @text="obj.name"></div>';
      expect(() => helium({ obj })).not.toThrow();
    });

    it('should not process already processed elements', async () => {
      container.innerHTML = '<div @text="count"></div>';
      const state = await helium({ count: 0 });

      state.count = 5;
      // Should still work because binding was already created
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('div').textContent).toBe('5');
    });

    it('should handle reserved words in expressions', async () => {
      container.innerHTML = '<div @text="true"></div>';
      await helium({});
      expect(container.querySelector('div').textContent).toBe('true');
    });

    it('should not auto-initialize reserved words as state', async () => {
      container.innerHTML = '<span @text="null">placeholder</span>';
      const state = await helium({});
      // Use Object.keys since state is a Proxy that returns true for all `in` checks
      expect(Object.keys(state).includes('null')).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should handle many bindings efficiently', async () => {
      const html = Array.from({ length: 100 }, (_, i) =>
        `<div @text="items[${i}]"></div>`
      ).join('');

      container.innerHTML = html;
      const items = Array.from({ length: 100 }, (_, i) => i);

      const start = performance.now();
      await helium({ items });
      const end = performance.now();

      expect(end - start).toBeLessThan(500); // Should initialize reasonably fast
    });

    it('should not cause infinite loops with DOM mutations', async () => {
      container.innerHTML = '<div @html="content"></div>';
      const state = await helium({ content: '<span>Test</span>', updateCount: 0 });

      let mutationCount = 0;
      const observer = new MutationObserver(() => {
        mutationCount++;
      });
      observer.observe(container, { childList: true, subtree: true });

      state.content = '<span>Updated</span>';
      await new Promise(r => setTimeout(r, 100));
      expect(mutationCount).toBeLessThan(10); // Should not cause excessive mutations
      observer.disconnect();
    });
  });
});

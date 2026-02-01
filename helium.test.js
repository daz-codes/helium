import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import helium from './helium.js';

describe('Helium Reactive Library', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    container.setAttribute('data-helium', '');
    document.body.appendChild(container);
  });

  afterEach(() => {
    window.heliumTeardown?.();
    document.body.innerHTML = '';
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

    it('should handle keyboard events with key modifiers', async () => {
      container.innerHTML = '<input @keydown.enter="pressed = true" />';
      const state = await helium({ pressed: false });
      const input = container.querySelector('input');

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      input.dispatchEvent(event);

      await new Promise(r => setTimeout(r, 0));
      expect(state.pressed).toBe(true);
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
  });

  describe('@init Directive', () => {
    it('should execute code on initialization', async () => {
      container.innerHTML = '<div @init="initialized = true"></div>';
      const state = await helium({ initialized: false });
      expect(state.initialized).toBe(true);
    });
  });

  describe('@data Directive', () => {
    it('should merge data into state', async () => {
      container.innerHTML = '<div @data="{ user: \'Alice\', age: 30 }"></div><span @text="user"></span>';
      await helium({});
      expect(container.querySelector('span').textContent).toBe('Alice');
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

  describe('Server-Sent Events (SSE)', () => {
    // Helper to create a mock SSE ReadableStream
    const createSSEStream = (events) => {
      const encoder = new TextEncoder();
      let index = 0;
      return new ReadableStream({
        pull(controller) {
          if (index < events.length) {
            controller.enqueue(encoder.encode(events[index]));
            index++;
          } else {
            controller.close();
          }
        }
      });
    };

    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it('should handle basic SSE stream updating DOM target', async () => {
      // Simulate SSE response like Datastar hello-world example
      const sseData = 'event: #message\ndata: <div>Hello from SSE!</div>\n\n';

      global.fetch.mockResolvedValueOnce({
        headers: { get: () => 'text/event-stream' },
        body: createSSEStream([sseData])
      });

      container.innerHTML = `
        <button @get="/api/hello-world" @target="#message">Start</button>
        <div id="message"></div>
      `;
      await helium({});

      container.querySelector('button').click();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(container.querySelector('#message').innerHTML).toBe('<div>Hello from SSE!</div>');
    });

    it('should handle multiple SSE events in sequence', async () => {
      const sseData = [
        'event: #counter\ndata: <span>1</span>\n\n',
        'event: #counter\ndata: <span>2</span>\n\n',
        'event: #counter\ndata: <span>3</span>\n\n'
      ];

      global.fetch.mockResolvedValueOnce({
        headers: { get: () => 'text/event-stream' },
        body: createSSEStream(sseData)
      });

      container.innerHTML = `
        <button @get="/api/count" @target="#counter">Count</button>
        <div id="counter"></div>
      `;
      await helium({});

      container.querySelector('button').click();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have the last value after all events processed
      expect(container.querySelector('#counter').innerHTML).toBe('<span>3</span>');
    });

    it('should update state when event targets a state property', async () => {
      const sseData = 'event: message\ndata: Hello World\n\n';

      global.fetch.mockResolvedValueOnce({
        headers: { get: () => 'text/event-stream' },
        body: createSSEStream([sseData])
      });

      container.innerHTML = `
        <button @get="/api/message" @target="message">Load</button>
        <span @text="message"></span>
      `;
      const state = await helium({ message: '' });

      container.querySelector('button').click();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(state.message).toBe('Hello World');
      expect(container.querySelector('span').textContent).toBe('Hello World');
    });

    it('should handle multiline data in SSE events', async () => {
      const sseData = 'data: line 1\ndata: line 2\ndata: line 3\n\n';

      global.fetch.mockResolvedValueOnce({
        headers: { get: () => 'text/event-stream' },
        body: createSSEStream([sseData])
      });

      container.innerHTML = `
        <button @get="/api/multiline" @target="#output">Load</button>
        <pre id="output"></pre>
      `;
      await helium({});

      container.querySelector('button').click();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(container.querySelector('#output').innerHTML).toBe('line 1\nline 2\nline 3');
    });

    it('should use @target for SSE updates', async () => {
      const sseData = 'data: <div>SSE content</div>\n\n';

      global.fetch.mockResolvedValueOnce({
        headers: { get: () => 'text/event-stream' },
        body: createSSEStream([sseData])
      });

      container.innerHTML = `
        <button @get="/api/simple" @target="#result">Load</button>
        <div id="result"></div>
      `;
      await helium({});

      container.querySelector('button').click();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(container.querySelector('#result').innerHTML).toBe('<div>SSE content</div>');
    });

    it('should track event id for potential reconnection', async () => {
      const sseData = 'id: 42\ndata: <span>Connected</span>\n\n';

      global.fetch.mockResolvedValueOnce({
        headers: { get: () => 'text/event-stream' },
        body: createSSEStream([sseData])
      });

      container.innerHTML = `
        <button @get="/api/status" @target="#status">Connect</button>
        <div id="status"></div>
      `;
      await helium({});

      container.querySelector('button').click();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(container.querySelector('#status').innerHTML).toBe('<span>Connected</span>');
    });

    it('should handle chunked SSE data', async () => {
      // Simulate data arriving in chunks (like real network)
      const chunk1 = 'event: #result\nda';
      const chunk2 = 'ta: <div>Chunked!</div>\n\n';

      global.fetch.mockResolvedValueOnce({
        headers: { get: () => 'text/event-stream' },
        body: createSSEStream([chunk1, chunk2])
      });

      container.innerHTML = `
        <button @get="/api/chunked" @target="#result">Load</button>
        <div id="result"></div>
      `;
      await helium({});

      container.querySelector('button').click();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(container.querySelector('#result').innerHTML).toBe('<div>Chunked!</div>');
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

    it('should handle innerHTML updates with new bindings', async () => {
      container.innerHTML = '<div @html="content"></div>';
      const state = await helium({ content: '', name: 'Test' });

      state.content = '<span data-he-text="name"></span>';
      await new Promise(r => setTimeout(r, 100));
      expect(container.querySelector('span').textContent).toBe('Test');
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

      // Manually mark as processed
      container.querySelector('div').setAttribute('data-helium-processed', '');

      state.count = 5;
      // Should still work because binding was already created
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('div').textContent).toBe('5');
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

      expect(end - start).toBeLessThan(100); // Should initialize in < 100ms
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

describe('@calculate', () => {
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

  it('should compute derived values from state', async () => {
    container.innerHTML = `
      <div @data="{ firstname: 'John', lastname: 'Doe' }">
        <span @calculate:fullname="firstname + ' ' + lastname"></span>
        <span id="result" @text="fullname"></span>
      </div>
    `;
    await helium();
    expect(container.querySelector('#result').textContent).toBe('John Doe');
  });

  it('should update when dependencies change', async () => {
    container.innerHTML = `
      <div @data="{ x: 5, y: 3 }">
        <span @calculate:sum="x + y"></span>
        <span id="result" @text="sum"></span>
        <button @click="x = 10">Update</button>
      </div>
    `;
    const state = await helium();
    expect(container.querySelector('#result').textContent).toBe('8');
    
    container.querySelector('button').click();
    await new Promise(r => setTimeout(r, 10));
    expect(container.querySelector('#result').textContent).toBe('13');
  });

  it('should update @text with fallback expression when @calculate value changes', async () => {
    container.innerHTML = `
      <div @data="{ firstname: '', lastname: '' }">
        <input id="first" @bind="firstname">
        <input id="last" @bind="lastname">
        <span @calculate:fullname="firstname && lastname ? firstname + ' ' + lastname : firstname || lastname || ''"></span>
        <span id="result" @text="fullname || 'stranger'"></span>
      </div>
    `;
    const state = await helium();

    // Initially should show 'stranger' since fullname is ''
    expect(container.querySelector('#result').textContent).toBe('stranger');

    // Update firstname
    const firstInput = container.querySelector('#first');
    firstInput.value = 'John';
    firstInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));

    // Should now show 'John' (since lastname is still empty, fullname = 'John')
    expect(container.querySelector('#result').textContent).toBe('John');

    // Update lastname
    const lastInput = container.querySelector('#last');
    lastInput.value = 'Doe';
    lastInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));

    // Should now show 'John Doe'
    expect(container.querySelector('#result').textContent).toBe('John Doe');
  });

  it('should handle password strength pattern with nested property access', async () => {
    container.innerHTML = `
      <div @data="{ password: '' }">
        <input id="pw" type="password" @bind="password">
        <span @calculate:strength="password.length < 4 ? 'Weak' : password.length < 8 ? 'Medium' : 'Strong'"></span>
        <span id="result" @text="strength"></span>
      </div>
    `;
    await helium();

    // Initially should show 'Weak' (empty password)
    expect(container.querySelector('#result').textContent).toBe('Weak');

    // Type 'abc' (3 chars) - still Weak
    const input = container.querySelector('#pw');
    input.value = 'abc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));
    expect(container.querySelector('#result').textContent).toBe('Weak');

    // Type 'abcdef' (6 chars) - Medium
    input.value = 'abcdef';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));
    expect(container.querySelector('#result').textContent).toBe('Medium');

    // Type 'abcdefgh' (8 chars) - Strong
    input.value = 'abcdefgh';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));
    expect(container.querySelector('#result').textContent).toBe('Strong');
  });
});

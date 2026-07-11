import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import helium from './helium-sse.js';

// State changes are batched and applied on a microtask; a macrotask tick also
// lets MutationObserver-driven processing of structural content settle.
const tick = () => new Promise(r => setTimeout(r, 0));

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

    it('should re-track conditional dependencies when their branch changes', async () => {
      container.innerHTML = '<div @text="show ? a : b"></div>';
      const state = await helium({ show: true, a: 'A', b: 'B' });

      expect(container.querySelector('div').textContent).toBe('A');
      state.show = false;
      state.b = 'updated B';
      await tick();
      expect(container.querySelector('div').textContent).toBe('updated B');

      state.show = true;
      state.a = 'updated A';
      await tick();
      expect(container.querySelector('div').textContent).toBe('updated A');
    });

    it('should prefer common state names over window properties', async () => {
      const originalName = window.name;
      window.name = 'window value';
      container.innerHTML = '<button @click="name = \'state value\'"></button>';

      const state = await helium();
      container.querySelector('button').click();

      expect(state.name).toBe('state value');
      expect(window.name).toBe('window value');
      window.name = originalName;
    });

    it('should react to nested object mutations', async () => {
      container.innerHTML = '<div @text="user.name"></div>';
      const state = await helium({ user: { name: 'Alice' } });

      state.user.name = 'Bob';
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('div').textContent).toBe('Bob');
    });

    it('should react to deeply nested object mutations', async () => {
      container.innerHTML = '<div @text="user.address.city"></div>';
      const state = await helium({ user: { address: { city: 'Paris' } } });

      state.user.address.city = 'Berlin';
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('div').textContent).toBe('Berlin');

      // replacing an intermediate object should also update
      state.user.address = { city: 'Rome' };
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('div').textContent).toBe('Rome');
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

    it('should not proxy Date instances', async () => {
      container.innerHTML = '<div @text="when.getUTCFullYear()"></div>';
      const when = new Date('2020-01-01T00:00:00Z');
      const state = await helium({ when });

      expect(state.when).toBe(when);
      expect(container.querySelector('div').textContent).toBe('2020');
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

    it('should keep plain malformed strings quiet but warn for expression-like compile failures', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      container.innerHTML = `
        <span id="literal" @text="Loading..."></span>
        <span id="punctuation" @text="Hello! Error: missing"></span>
        <span id="broken" @text="user.name."></span>
      `;
      await helium({});

      expect(container.querySelector('#literal').textContent).toBe('Loading...');
      expect(container.querySelector('#punctuation').textContent).toBe('Hello! Error: missing');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('Helium expression compile warning');
      expect(warnSpy.mock.calls[0][0]).toContain('@text');
      expect(warnSpy.mock.calls[0][1]).toBe('user.name.');
      warnSpy.mockRestore();
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

    it('@bind.number should coerce the value to a number', async () => {
      container.innerHTML = '<input type="number" @bind.number="age" />';
      const state = await helium({ age: 0 });
      const input = container.querySelector('input');

      input.value = '42';
      input.dispatchEvent(new Event('input'));
      await new Promise(r => setTimeout(r, 0));
      expect(state.age).toBe(42);
      expect(typeof state.age).toBe('number');
    });

    it('@bind.number should keep an empty field as an empty string', async () => {
      container.innerHTML = '<input type="number" @bind.number="age" />';
      const state = await helium({ age: 5 });
      const input = container.querySelector('input');

      input.value = '';
      input.dispatchEvent(new Event('input'));
      await new Promise(r => setTimeout(r, 0));
      expect(state.age).toBe('');
    });

    it('@bind.trim should trim user input', async () => {
      container.innerHTML = '<input @bind.trim="name" />';
      const state = await helium({ name: '' });
      const input = container.querySelector('input');

      input.value = '  Jane  ';
      input.dispatchEvent(new Event('input'));
      expect(state.name).toBe('Jane');
    });

    it('@bind.lazy should update on change rather than input', async () => {
      container.innerHTML = '<input @bind.lazy="name" />';
      const state = await helium({ name: 'John' });
      const input = container.querySelector('input');

      input.value = 'Jane';
      input.dispatchEvent(new Event('input'));
      expect(state.name).toBe('John');
      input.dispatchEvent(new Event('change'));
      expect(state.name).toBe('Jane');
    });

    it('should combine @bind.lazy.trim.number modifiers', async () => {
      container.innerHTML = '<input @bind.lazy.trim.number="amount" />';
      const state = await helium({ amount: 0 });
      const input = container.querySelector('input');

      input.value = ' 42 ';
      input.dispatchEvent(new Event('change'));
      expect(state.amount).toBe(42);
      expect(typeof state.amount).toBe('number');
    });

    it('should two-way bind a nested path', async () => {
      container.innerHTML = '<input @bind="user.name" /><span @text="user.name"></span>';
      const state = await helium({ user: { name: 'Alice' } });
      const input = container.querySelector('input');

      expect(input.value).toBe('Alice');
      input.value = 'Bob';
      input.dispatchEvent(new Event('input'));

      await new Promise(r => setTimeout(r, 0));
      expect(state.user.name).toBe('Bob');
      expect(state['user.name']).toBeUndefined();
      expect(container.querySelector('span').textContent).toBe('Bob');
    });

    it('should two-way bind a deeply nested path', async () => {
      container.innerHTML = '<input @bind="user.address.city" /><span @text="user.address.city"></span>';
      const state = await helium({ user: { address: { city: 'Paris' } } });
      const input = container.querySelector('input');

      input.value = 'Berlin';
      input.dispatchEvent(new Event('input'));

      await new Promise(r => setTimeout(r, 0));
      expect(state.user.address.city).toBe('Berlin');
      expect(container.querySelector('span').textContent).toBe('Berlin');
    });

    it('should log an error when a nested path parent is missing', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      container.innerHTML = '<input @bind="missing.name" />';
      const state = await helium({});
      const input = container.querySelector('input');

      input.value = 'Bob';
      input.dispatchEvent(new Event('input'));

      await new Promise(r => setTimeout(r, 0));
      expect(state['missing.name']).toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('cannot set'));
      errorSpy.mockRestore();
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

    it('should remove stale object-form classes while preserving static classes', async () => {
      container.innerHTML = '<div class="base" :class="classes"></div>';
      const state = await helium({ classes: { active: true, stale: true } });
      const element = container.querySelector('div');

      state.classes = { active: false, current: true };
      await tick();

      expect(element.classList.contains('base')).toBe(true);
      expect(element.classList.contains('active')).toBe(false);
      expect(element.classList.contains('stale')).toBe(false);
      expect(element.classList.contains('current')).toBe(true);
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

    it('should match key modifiers regardless of order with other modifiers', async () => {
      container.innerHTML = '<input @keydown.enter.prevent="pressed = true" />';
      const state = await helium({ pressed: false });
      const input = container.querySelector('input');

      // non-matching key should be ignored even though .prevent is last
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', cancelable: true }));
      await new Promise(r => setTimeout(r, 0));
      expect(state.pressed).toBe(false);

      // matching key still fires and the .prevent modifier still applies
      const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
      input.dispatchEvent(enter);
      await new Promise(r => setTimeout(r, 0));
      expect(state.pressed).toBe(true);
      expect(enter.defaultPrevented).toBe(true);
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

    it('once combined with a key filter should fire once when the key matches', async () => {
      container.innerHTML = '<input @keydown.once.enter="count++">';
      const state = await helium({ count: 0 });
      const input = container.querySelector('input');

      // A non-matching key must NOT consume the .once (the old {once:true}
      // option removed the listener on the first keydown regardless of key).
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
      await new Promise(r => setTimeout(r, 0));
      expect(state.count).toBe(0);

      // First Enter fires and removes; subsequent Enters do nothing.
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise(r => setTimeout(r, 0));
      expect(state.count).toBe(1);
    });

    it('outside.once should only be consumed by a matching outside event', async () => {
      container.innerHTML = '<div id="inside" @click.outside.once="count++"></div><button id="outside"></button>';
      const state = await helium({ count: 0 });

      container.querySelector('#inside').click();
      expect(state.count).toBe(0);

      container.querySelector('#outside').click();
      container.querySelector('#outside').click();
      expect(state.count).toBe(1);
    });

    it('should warn for event handler compile failures', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      container.innerHTML = '<button @click="count +"></button>';
      await helium({ count: 1 });

      container.querySelector('button').click();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Helium expression compile warning'),
        'count +',
        expect.any(String)
      );
      expect(warnSpy.mock.calls[0][0]).toContain('@click');
      warnSpy.mockRestore();
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

    it('should remove references when their elements are detached', async () => {
      container.innerHTML = '<div id="referenced" @ref="thing"></div><button @click="seen = typeof $thing"></button>';
      const state = await helium({ seen: '' });

      container.querySelector('#referenced').remove();
      await new Promise(r => setTimeout(r, 0));
      container.querySelector('button').click();

      expect(state.seen).toBe('undefined');
    });

    it('should make refs available in @params for AJAX requests', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true })
      });

      container.innerHTML = `
        <form @ref="myForm">
          <input name="title" value="Test Title">
          <button @post="/api/test" @params="new FormData($myForm)">Submit</button>
        </form>
      `;
      await helium({});

      container.querySelector('button').click();
      await new Promise(r => setTimeout(r, 100));

      expect(global.fetch).toHaveBeenCalled();
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe('/api/test');
      expect(options.body).toBeInstanceOf(FormData);
    });

    it('should make refs available with nested local @data sections', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true })
      });

      // Mimic the examples page structure with nested local @data
      container.innerHTML = `
        <div @data="{ count: 0 }">
          <div @data="{ templates: { post: data => data.title } }">
            <section @ref="posts">
              <form @ref="form">
                <input name="title" value="Test">
                <button @post.prevent="/api/posts" @params="new FormData($form)" @target="$posts:append" @template="templates.post">Submit</button>
              </form>
            </section>
          </div>
        </div>
      `;
      await helium({});

      container.querySelector('button').click();
      await new Promise(r => setTimeout(r, 100));

      expect(global.fetch).toHaveBeenCalled();
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe('/api/posts');
      expect(options.body).toBeInstanceOf(FormData);
    });
  });

  describe('@init Directive', () => {
    it('should execute code on initialization', async () => {
      container.innerHTML = '<div @init="initialized = true"></div>';
      const state = await helium({ initialized: false });
      expect(state.initialized).toBe(true);
    });

    it('should run a returned cleanup function when the element is removed', async () => {
      const cleanup = vi.fn();
      const startClock = vi.fn(() => cleanup);
      container.innerHTML = '<div @init="start_clock($el, $data)"></div>';

      const state = await helium({ start_clock: startClock });
      const element = container.firstElementChild;
      expect(startClock).toHaveBeenCalledWith(element, state);

      element.remove();
      await new Promise(r => setTimeout(r, 0));

      expect(cleanup).toHaveBeenCalledOnce();
    });

    it('should initialize and clean up dynamically added elements', async () => {
      const cleanup = vi.fn();
      const startClock = vi.fn(() => cleanup);
      await helium({ start_clock: startClock });

      const element = document.createElement('div');
      element.setAttribute('data-he-init', 'start_clock($el)');
      container.appendChild(element);
      await new Promise(r => setTimeout(r, 0));
      expect(startClock).toHaveBeenCalledWith(element);

      element.remove();
      await new Promise(r => setTimeout(r, 0));
      expect(cleanup).toHaveBeenCalledOnce();
    });

    it('should run cleanup when Helium is torn down', async () => {
      const cleanup = vi.fn();
      container.innerHTML = '<div @init="start()"></div>';
      await helium({ start: () => cleanup });

      window.heliumTeardown();

      expect(cleanup).toHaveBeenCalledOnce();
    });
  });

  describe('@data Directive', () => {
    it('should merge root data into root state', async () => {
      container.setAttribute('data-he-data', "{ user: 'Alice', age: 30 }");
      container.innerHTML = '<span @text="user"></span>';
      const state = await helium({});
      expect(container.querySelector('span').textContent).toBe('Alice');
      expect(state.user).toBe('Alice');
    });

    it('should isolate nested local state from root state and sibling data scopes', async () => {
      container.innerHTML = `
        <section id="first" @data="{ count: 0 }">
          <button @click="count++"></button><span @text="count"></span>
        </section>
        <section id="second" @data="{ count: 10 }">
          <button @click="count++"></button><span @text="count"></span>
        </section>
        <span id="root-count" @text="count"></span>
      `;
      const state = await helium({ count: 100 });

      container.querySelector('#first button').click();
      await tick();

      expect(container.querySelector('#first span').textContent).toBe('1');
      expect(container.querySelector('#second span').textContent).toBe('10');
      expect(container.querySelector('#root-count').textContent).toBe('100');
      expect(state.count).toBe(100);
    });

    it('should inherit outer values and assign to the nearest declaring data object', async () => {
      container.innerHTML = `
        <section @data="{ count: 1, label: 'outer' }">
          <span id="outer-count" @text="count"></span>
          <div @data="{ label: 'inner' }">
            <button id="increment" @click="count++"></button>
            <button id="rename" @click="label = 'changed'"></button>
            <span id="inner-count" @text="count"></span>
            <span id="inner-label" @text="label"></span>
          </div>
        </section>
      `;
      const state = await helium({ count: 50, label: 'root' });

      container.querySelector('#increment').click();
      container.querySelector('#rename').click();
      await tick();

      expect(container.querySelector('#outer-count').textContent).toBe('2');
      expect(container.querySelector('#inner-count').textContent).toBe('2');
      expect(container.querySelector('#inner-label').textContent).toBe('changed');
      expect(state).toMatchObject({ count: 50, label: 'root' });
    });

    it('should react to deep local mutations, @bind, and local @calculate values', async () => {
      container.innerHTML = `
        <section @data="{ user: { name: 'Ada' }, name: 'Ada', quantity: 2, total: 0 }">
          <input @bind="name">
          <button @click="user.name = 'Grace', quantity++"></button>
          <i @calculate:total="quantity * 5"></i>
          <span id="name" @text="user.name"></span>
          <span id="bound-name" @text="name"></span>
          <span id="total" @text="total"></span>
        </section>
      `;
      const state = await helium({ user: { name: 'Root' }, name: 'Root', quantity: 20, total: 100 });

      container.querySelector('button').click();
      const input = container.querySelector('input');
      input.value = 'Katherine';
      input.dispatchEvent(new Event('input'));
      await tick();

      expect(container.querySelector('#name').textContent).toBe('Grace');
      expect(container.querySelector('#bound-name').textContent).toBe('Katherine');
      expect(container.querySelector('#total').textContent).toBe('15');
      expect(state).toMatchObject({ user: { name: 'Root' }, name: 'Root', quantity: 20, total: 100 });
    });

    it('should two-way bind a nested path against local data values', async () => {
      container.innerHTML = `
        <section @data="{ user: { name: 'Ada' } }">
          <input @bind="user.name">
          <span @text="user.name"></span>
        </section>
      `;
      const state = await helium({ user: { name: 'Root' } });

      const input = container.querySelector('input');
      expect(input.value).toBe('Ada');
      input.value = 'Grace';
      input.dispatchEvent(new Event('input'));
      await tick();

      expect(container.querySelector('span').textContent).toBe('Grace');
      expect(state).toMatchObject({ user: { name: 'Root' } });
    });

    it('should support data-he-data for local state and initialize from parent state', async () => {
      container.innerHTML = `
        <div data-he-data="{ count: startingCount }">
          <button @click="count++"></button><span @text="count"></span>
        </div>
      `;
      const state = await helium({ startingCount: 4 });

      container.querySelector('button').click();
      await tick();

      expect(container.querySelector('span').textContent).toBe('5');
      expect(state.startingCount).toBe(4);
      expect(state.count).toBeUndefined();
    });

    it('should initialize local bindings added dynamically', async () => {
      const state = await helium({ count: 40 });
      const section = document.createElement('section');
      section.setAttribute('data-he-data', '{ count: 3 }');
      section.innerHTML = '<button @click="count++"></button><span @text="count"></span>';

      container.appendChild(section);
      await new Promise(resolve => setTimeout(resolve, 0));
      section.querySelector('button').click();
      await tick();

      expect(section.querySelector('span').textContent).toBe('4');
      expect(state.count).toBe(40);
    });

    it('should compose local state with keyed @for row data', async () => {
      container.innerHTML = `
        <section @data="{ suffix: 'local', items: [{ id: 1, name: 'one' }] }">
          <template @for="item in items" :key="item.id">
            <p @text="item.name + '-' + suffix"></p>
          </template>
          <button @click="items = [...items, { id: 2, name: 'two' }]"></button>
        </section>
      `;
      const state = await helium({ suffix: 'root', items: [] });

      container.querySelector('button').click();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect([...container.querySelectorAll('p')].map(el => el.textContent)).toEqual(['one-local', 'two-local']);
      expect(state).toMatchObject({ suffix: 'root', items: [] });
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
        <button @get="/api/hello-world">Start</button>
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

    it('should send the event id when reconnecting', async () => {
      const sseData = 'id: 42\ndata: <span>Connected</span>\n\n';

      global.fetch
        .mockResolvedValueOnce({
          headers: { get: () => 'text/event-stream' },
          body: createSSEStream([sseData])
        })
        .mockResolvedValueOnce({
          headers: { get: () => 'text/html' },
          text: async () => '<span>Reconnected</span>'
        });

      container.innerHTML = `
        <button @get="/api/status" @target="#status"
          @options="{ retryMode: 'always', retry: 1 }">Connect</button>
        <div id="status"></div>
      `;
      await helium({});

      container.querySelector('button').click();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch.mock.calls[1][1].headers['Last-Event-ID']).toBe('42');
      expect(container.querySelector('#status').innerHTML).toBe('<span>Reconnected</span>');
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

describe(':style Directive', () => {
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

  it('should apply style object with camelCase properties', async () => {
    container.innerHTML = '<div :style="{ backgroundColor: color }"></div>';
    await helium({ color: 'blue' });
    const div = container.querySelector('div');
    expect(div.style.backgroundColor).toBe('blue');
  });

  it('should apply style object with kebab-case properties', async () => {
    container.innerHTML = '<div :style="{ \'background-color\': color }"></div>';
    await helium({ color: 'red' });
    const div = container.querySelector('div');
    expect(div.style.backgroundColor).toBe('red');
  });

  it('should apply multiple style properties', async () => {
    container.innerHTML = '<div :style="{ backgroundColor: bg, fontSize: size }"></div>';
    await helium({ bg: 'green', size: '20px' });
    const div = container.querySelector('div');
    expect(div.style.backgroundColor).toBe('green');
    expect(div.style.fontSize).toBe('20px');
  });

  it('should update style when state changes', async () => {
    container.innerHTML = '<div :style="{ backgroundColor: color }"></div>';
    const state = await helium({ color: 'blue' });
    const div = container.querySelector('div');
    expect(div.style.backgroundColor).toBe('blue');

    state.color = 'red';
    await new Promise(r => setTimeout(r, 0));
    expect(div.style.backgroundColor).toBe('red');
  });

  it('should filter out null and false values', async () => {
    container.innerHTML = '<div :style="{ backgroundColor: bg, color: textColor }"></div>';
    await helium({ bg: 'blue', textColor: null });
    const div = container.querySelector('div');
    expect(div.style.backgroundColor).toBe('blue');
    expect(div.style.color).toBe('');
  });

  it('should handle width with percentage', async () => {
    container.innerHTML = '<div :style="{ width: width + \'%\' }"></div>';
    await helium({ width: 50 });
    const div = container.querySelector('div');
    expect(div.style.width).toBe('50%');
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

  describe('@local-storage', () => {
    afterEach(() => {
      localStorage.clear();
    });

    it('should not overwrite localStorage values with @data defaults', async () => {
      // Simulate saved state from a previous session
      localStorage.setItem('test-todos', JSON.stringify({ todos: ['buy milk', 'walk dog'], filter: 'active', nextId: 3 }));

      container.setAttribute('data-he-local-storage', 'test-todos');
      container.setAttribute('data-he-data', "{ todos: [], filter: 'all', nextId: 1 }");
      container.innerHTML = `
        <div>
          <span id="count" @text="todos.length"></span>
          <span id="filter" @text="filter"></span>
          <span id="nextId" @text="nextId"></span>
        </div>
      `;
      await helium();
      await new Promise(r => setTimeout(r, 10));

      // localStorage values should be preserved, not overwritten by @data defaults
      expect(container.querySelector('#count').textContent).toBe('2');
      expect(container.querySelector('#filter').textContent).toBe('active');
      expect(container.querySelector('#nextId').textContent).toBe('3');
    });

    it('should set @data values that are not in localStorage', async () => {
      // Saved state only has some keys
      localStorage.setItem('test-partial', JSON.stringify({ count: 42 }));

      container.setAttribute('data-he-local-storage', 'test-partial');
      container.setAttribute('data-he-data', "{ count: 0, name: 'default' }");
      container.innerHTML = `
        <div>
          <span id="count" @text="count"></span>
          <span id="name" @text="name"></span>
        </div>
      `;
      await helium();
      await new Promise(r => setTimeout(r, 10));

      // count should come from localStorage, name should come from @data
      expect(container.querySelector('#count').textContent).toBe('42');
      expect(container.querySelector('#name').textContent).toBe('default');
    });

    it('should save state changes to localStorage', async () => {
      container.setAttribute('data-he-local-storage', 'test-save');
      container.setAttribute('data-he-data', "{ count: 0 }");
      container.innerHTML = `
        <div>
          <button @click="count++">Inc</button>
          <span @text="count"></span>
        </div>
      `;
      await helium();

      container.querySelector('button').click();
      await new Promise(r => setTimeout(r, 10));

      const saved = JSON.parse(localStorage.getItem('test-save'));
      expect(saved.count).toBe(1);
    });

    it('should preserve functions from @data when localStorage is active', async () => {
      localStorage.setItem('test-funcs', JSON.stringify({ count: 5 }));

      container.setAttribute('data-he-local-storage', 'test-funcs');
      container.setAttribute('data-he-data', "{ count: 0, double(n) { return n * 2 } }");
      container.innerHTML = `
        <div>
          <span id="result" @text="double(count)"></span>
        </div>
      `;
      await helium();
      await new Promise(r => setTimeout(r, 10));

      // count from localStorage (5), function from @data
      expect(container.querySelector('#result').textContent).toBe('10');
    });
  });
});

  describe('Re-initialization', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    container.setAttribute('data-helium', '');
    document.body.appendChild(container);
  });

  describe('Explicit mounts', () => {
    it('should mount independent roots and unmount them idempotently', async () => {
      container.innerHTML = `
        <section id="mount-a"><button @click="count++">A</button><span @text="count"></span></section>
        <section id="mount-b"><button @click="count++">B</button><span @text="count"></span></section>
      `;

      const a = await helium.mount('#mount-a', { count: 1 });
      const b = await helium.mount(container.querySelector('#mount-b'), { count: 10 });

      container.querySelector('#mount-a button').click();
      await tick();
      expect(a.state.count).toBe(2);
      expect(b.state.count).toBe(10);
      expect(container.querySelector('#mount-a span').textContent).toBe('2');
      expect(container.querySelector('#mount-b span').textContent).toBe('10');

      a.unmount();
      a.unmount();
      a.state.count = 99;
      b.state.count = 11;
      await tick();

      expect(container.querySelector('#mount-a span').textContent).toBe('2');
      expect(container.querySelector('#mount-b span').textContent).toBe('11');
      b.unmount();
    });

    it('should reject a selector that does not match a root', async () => {
      await expect(helium.mount('#missing-root')).rejects.toThrow(/root/i);
    });
  });

  describe('Keyed @for', () => {
    it('should render, reorder, update, and remove keyed rows without replacing them', async () => {
      const cleaned = vi.fn();
      container.innerHTML = `
        <ul>
          <template @for="item, index in items" :key="item.id">
            <li :data-id="item.id" @init="setup(item.id)">
              <button @click="item.name += '!'" @text="index + ': ' + item.name"></button>
            </li>
          </template>
        </ul>
      `;
      const state = await helium({
        items: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }],
        setup: id => () => cleaned(id)
      });
      await new Promise(resolve => setTimeout(resolve, 0));

      const rowA = container.querySelector('[data-id="a"]');
      expect([...container.querySelectorAll('button')].map(el => el.textContent)).toEqual(['0: Alpha', '1: Beta']);
      expect(state.item).toBeUndefined();
      expect(state.index).toBeUndefined();

      const focused = rowA.querySelector('button');
      focused.focus();
      state.items[0].name = 'Alpha+';
      await tick();
      expect(document.activeElement).toBe(focused);

      state.items = [state.items[1], state.items[0]];
      await tick();
      expect(container.querySelectorAll('li')[1]).toBe(rowA);
      expect([...container.querySelectorAll('button')].map(el => el.textContent)).toEqual(['0: Beta', '1: Alpha+']);

      container.querySelector('[data-id="b"] button').click();
      await tick();
      expect(state.items[0].name).toBe('Beta!');
      expect(container.querySelector('[data-id="b"] button').textContent).toBe('0: Beta!');

      const rowB = container.querySelector('[data-id="b"]');
      state.items = [{ id: 'b', name: 'Replacement' }];
      await tick();
      expect(container.querySelector('[data-id="b"]')).toBe(rowB);
      expect(rowB.querySelector('button').textContent).toBe('0: Replacement');
      expect(container.querySelector('[data-id="a"]')).toBeNull();
      expect(cleaned).toHaveBeenCalledWith('a');
    });

    it('should process bindings in newly inserted keyed rows', async () => {
      container.innerHTML = `
        <template data-he-for="item in items" :key="item.id">
          <span :data-id="item.id" @text="item.name"></span>
        </template>
      `;
      const state = await helium({ items: [] });
      state.items.push({ id: 1, name: 'Added' });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(container.querySelector('[data-id="1"]').textContent).toBe('Added');
    });
  });

  describe('Conditional @if', () => {
    it('should render template content only while the expression is truthy', async () => {
      container.innerHTML = `
        <template @if="loggedIn"><p @text="'Hello ' + user"></p></template>
      `;
      const state = await helium({ loggedIn: false, user: 'Ada' });
      expect(container.querySelector('p')).toBeNull();

      state.loggedIn = true;
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('p').textContent).toBe('Hello Ada');

      state.user = 'Grace';
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('p').textContent).toBe('Hello Grace');

      state.loggedIn = false;
      await tick();
      expect(container.querySelector('p')).toBeNull();
    });

    it('should clean up listeners and @init effects when content is removed', async () => {
      const cleaned = vi.fn();
      container.innerHTML = `
        <template @if="show">
          <button @init="setup()" @click="count++">+</button>
        </template>
      `;
      const state = await helium({ show: true, count: 0, setup: () => () => cleaned() });
      await new Promise(r => setTimeout(r, 0));

      const button = container.querySelector('button');
      button.click();
      expect(state.count).toBe(1);

      state.show = false;
      await tick();
      expect(container.querySelector('button')).toBeNull();
      expect(cleaned).toHaveBeenCalledTimes(1);
      button.click();
      expect(state.count).toBe(1);
    });

    it('should re-insert fresh, working content after toggling off and on', async () => {
      container.innerHTML = `
        <template @if="show"><span @text="count"></span></template>
      `;
      const state = await helium({ show: true, count: 1 });
      await new Promise(r => setTimeout(r, 0));

      state.show = false;
      state.count = 2;
      state.show = true;
      await new Promise(r => setTimeout(r, 0));

      expect(container.querySelector('span').textContent).toBe('2');
      state.count = 3;
      await tick();
      expect(container.querySelector('span').textContent).toBe('3');
    });

    it('should support data-he-if and multiple root nodes', async () => {
      container.innerHTML = `
        <template data-he-if="show"><b>one</b><i>two</i></template>
      `;
      const state = await helium({ show: true });
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('b').textContent).toBe('one');
      expect(container.querySelector('i').textContent).toBe('two');

      state.show = false;
      await tick();
      expect(container.querySelector('b')).toBeNull();
      expect(container.querySelector('i')).toBeNull();
    });

    it('should see @for row aliases from inside a row', async () => {
      container.innerHTML = `
        <ul>
          <template @for="item in items" :key="item.id">
            <template @if="item.show"><li @text="item.name"></li></template>
          </template>
        </ul>
      `;
      await helium({ items: [
        { id: 1, name: 'visible', show: true },
        { id: 2, name: 'hidden', show: false }
      ]});
      await new Promise(r => setTimeout(r, 0));
      await new Promise(r => setTimeout(r, 0));

      const rows = [...container.querySelectorAll('li')];
      expect(rows.map(li => li.textContent)).toEqual(['visible']);
    });

    it('should reject @if on non-template elements', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      container.innerHTML = '<div @if="show">nope</div>';
      await helium({ show: true });
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('@if requires'));
      errorSpy.mockRestore();
    });
  });

  afterEach(() => {
    window.heliumTeardown?.();
    document.body.innerHTML = '';
  });

  it('should not throw when helium() is called twice without teardown', async () => {
    container.innerHTML = '<p @text="count"></p>';
    await helium({ count: 1 });
    // Second call (e.g. Turbo navigation) must not crash on stale bindings.
    await expect(helium({ count: 2 })).resolves.toBeDefined();
    expect(container.querySelector('p').textContent).toBe('2');
  });

  it('should stay reactive after re-initialization', async () => {
    container.innerHTML = '<p @text="count"></p><button @click="count++">+</button>';
    await helium({ count: 0 });
    const state = await helium({ count: 10 });
    container.querySelector('button').click();
    await new Promise(r => setTimeout(r, 0));
    expect(state.count).toBe(11);
    expect(container.querySelector('p').textContent).toBe('11');
  });

  it('should ignore mutations made through a stale state proxy', async () => {
    container.innerHTML = '<p @text="count"></p>';
    const first = await helium({ count: 1 });
    const second = await helium({ count: 10 });

    first.count = 99;

    expect(first.count).toBe(99);
    expect(second.count).toBe(10);
    expect(container.querySelector('p').textContent).toBe('10');
  });

  it('should re-initialize on a turbo:render cycle', async () => {
    container.innerHTML = '<p @text="count"></p>';
    await helium({ count: 5 });
    expect(container.querySelector('p').textContent).toBe('5');

    // Simulate a Turbo navigation: before-render tears down, render re-inits.
    document.dispatchEvent(new Event('turbo:before-render'));
    document.dispatchEvent(new Event('turbo:render'));
    await new Promise(r => setTimeout(r, 0));

    // Helium must still be alive: a fresh helium() works and updates the DOM.
    const state = await helium({ count: 7 });
    expect(container.querySelector('p').textContent).toBe('7');
    state.count = 9;
    await new Promise(r => setTimeout(r, 0));
    expect(container.querySelector('p').textContent).toBe('9');
  });
});

describe('data-he-* aliases', () => {
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

  it('root data-he-data should initialize root state', async () => {
    container.setAttribute('data-he-data', "{ count: 7 }");
    container.innerHTML = '<span @text="count"></span>';
    const state = await helium();
    expect(state.count).toBe(7);
    expect(container.querySelector('span').textContent).toBe('7');
  });

  it('nested data-he-data should initialize local state', async () => {
    container.innerHTML = '<div data-he-data="{ count: 7 }"><span @text="count"></span></div>';
    const state = await helium();
    expect(state.count).toBeUndefined();
    expect(container.querySelector('span').textContent).toBe('7');
  });

  it('data-he-click should attach a click handler (alias for @click)', async () => {
    container.innerHTML = '<button data-he-click="count++">+</button><span @text="count"></span>';
    const state = await helium({ count: 0 });
    container.querySelector('button').click();
    await new Promise(r => setTimeout(r, 0));
    expect(state.count).toBe(1);
    expect(container.querySelector('span').textContent).toBe('1');
  });
});

describe('HTTP robustness', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    container.setAttribute('data-helium', '');
    document.body.appendChild(container);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    window.heliumTeardown?.();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('should not crash when @get has no @target', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ data: 'ok' })
    });
    container.innerHTML = '<button @get="/api/data">Load</button>';
    await helium({});
    container.querySelector('button').click();
    await new Promise(r => setTimeout(r, 50));
    // Reaching here without a thrown "Invalid selector" is the assertion.
    expect(global.fetch).toHaveBeenCalledWith('/api/data', expect.any(Object));
  });

  it('should not render an error response into the success target', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch.mockResolvedValueOnce({
      ok: false, status: 500, statusText: 'Server Error',
      headers: { get: () => 'text/html' },
      text: async () => '<b>boom</b>'
    });
    container.innerHTML = '<button @get="/api/data" @target="#out">Load</button><div id="out">original</div>';
    await helium({});
    container.querySelector('button').click();
    await new Promise(r => setTimeout(r, 50));
    expect(container.querySelector('#out').innerHTML).toBe('original');
    expect(spy).toHaveBeenCalledWith('AJAX:', expect.stringContaining('HTTP 500'));
  });

  it('should accept a null JSON response', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => null
    });
    container.innerHTML = '<button @get="/api/empty" @target="#out">Load</button><div id="out">original</div>';
    await helium({});

    container.querySelector('button').click();
    await new Promise(r => setTimeout(r, 50));

    expect(container.querySelector('#out').innerHTML).toBe('');
    expect(spy).not.toHaveBeenCalled();
  });

  it('should encode GET @params into the query string', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({})
    });
    container.innerHTML = `<button @get="/api/search" @params="{ q: 'hello world', page: 2 }">Search</button>`;
    await helium({});
    container.querySelector('button').click();
    await new Promise(r => setTimeout(r, 50));
    const [calledUrl] = global.fetch.mock.calls[0];
    expect(calledUrl).toContain('/api/search?');
    expect(calledUrl).toContain('q=hello+world');
    expect(calledUrl).toContain('page=2');
  });

  it('$get should return an awaitable promise', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true })
    });
    container.innerHTML = `<button @click="$get('/api/data', '#out').then(() => done = true)">Go</button><div id="out"></div>`;
    const state = await helium({ done: false });
    container.querySelector('button').click();
    await new Promise(r => setTimeout(r, 50));
    expect(state.done).toBe(true);
  });

  it('should parse SSE streams that use CRLF line endings', async () => {
    const encoder = new TextEncoder();
    const chunk = 'event: message\r\ndata: <span>hi</span>\r\n\r\n';
    let sent = false;
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'text/event-stream' },
      body: new ReadableStream({
        pull(controller) {
          if (!sent) { controller.enqueue(encoder.encode(chunk)); sent = true; }
          else controller.close();
        }
      })
    });
    container.innerHTML = '<button @get="/api/sse" @target="#out">Start</button><div id="out"></div>';
    await helium({});
    container.querySelector('button').click();
    await new Promise(r => setTimeout(r, 50));
    expect(container.querySelector('#out').innerHTML).toBe('<span>hi</span>');
  });
});

describe('Nested & shared reactivity', () => {
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

  it('should update every binding that reaches a shared object reference', async () => {
    const shared = { x: 1 };
    container.innerHTML = '<span id="a" @text="a.x"></span><span id="b" @text="b.x"></span>';
    const state = await helium({ a: shared, b: shared });
    expect(container.querySelector('#a').textContent).toBe('1');
    expect(container.querySelector('#b').textContent).toBe('1');

    // Mutating through one property must refresh bindings that read the other.
    state.a.x = 99;
    await new Promise(r => setTimeout(r, 0));
    expect(container.querySelector('#a').textContent).toBe('99');
    expect(container.querySelector('#b').textContent).toBe('99');
  });

  it('should not infinite-loop on cyclic references', async () => {
    const node = { val: 1 };
    node.self = node;
    container.innerHTML = '<span @text="node.self.val"></span>';
    const state = await helium({ node });
    expect(container.querySelector('span').textContent).toBe('1');

    state.node.val = 5;
    await new Promise(r => setTimeout(r, 0));
    expect(container.querySelector('span').textContent).toBe('5');
  });

  it('should still re-trigger ancestor bindings on a deep mutation', async () => {
    container.innerHTML = '<span @text="user.address.city"></span>';
    const state = await helium({ user: { address: { city: 'Paris' } } });
    expect(container.querySelector('span').textContent).toBe('Paris');

    state.user.address.city = 'Lyon';
    await new Promise(r => setTimeout(r, 0));
    expect(container.querySelector('span').textContent).toBe('Lyon');
  });
});

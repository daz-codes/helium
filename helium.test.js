import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pathToFileURL } from 'node:url';
import helium, { createHelium } from './helium-turbo-sse.js';

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
    delete globalThis.Turbo;
    delete globalThis.Idiomorph;
    document.body.innerHTML = '';
  });

  describe('Prototype pollution safety', () => {
    afterEach(() => {
      delete Object.prototype.polluted;
      delete Object.prototype.polluted2;
    });

    it('does not pollute Object.prototype through an @bind path', async () => {
      container.innerHTML = '<input @bind="__proto__.polluted" value="x">';
      await helium({});
      const input = container.querySelector('input');
      input.value = 'hacked';
      input.dispatchEvent(new Event('input'));
      await tick();
      expect(({}).polluted).toBeUndefined();
    });

    it('does not pollute Object.prototype through a @calculate path', async () => {
      container.innerHTML = '<div @calculate:__proto__.polluted2="1"></div>';
      await helium({});
      await tick();
      expect(({}).polluted2).toBeUndefined();
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

    it('should prefer Turbo morphChildren for @html when Turbo exposes it', async () => {
      const idiomorph = vi.fn();
      const morphChildren = vi.fn((element, incoming) => {
        element.innerHTML = incoming.innerHTML;
      });
      globalThis.Turbo = { morphChildren };
      globalThis.Idiomorph = { morph: idiomorph };
      container.innerHTML = '<div @html="content"></div>';

      const state = await helium({ content: '<strong>One</strong>' });
      expect(morphChildren).toHaveBeenCalledOnce();
      expect(morphChildren.mock.calls[0][1].innerHTML).toBe('<strong>One</strong>');
      expect(idiomorph).not.toHaveBeenCalled();

      state.content = '<strong>Two</strong>';
      await tick();
      expect(morphChildren).toHaveBeenCalledTimes(2);
      expect(container.querySelector('strong').textContent).toBe('Two');
    });

    it('should fall back to a standalone Idiomorph global for @html', async () => {
      const morph = vi.fn((element, content) => { element.innerHTML = content; });
      globalThis.Idiomorph = { morph };
      container.innerHTML = '<div @html="content"></div>';

      await helium({ content: '<em>Morphed</em>' });
      expect(morph).toHaveBeenCalledWith(
        container.querySelector('div'),
        '<em>Morphed</em>',
        { morphStyle: 'innerHTML' },
      );
      expect(container.querySelector('em').textContent).toBe('Morphed');
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
      expect(errorSpy).toHaveBeenCalledWith('Helium binding error:', expect.stringContaining('Cannot set'));
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
      const other = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
      input.dispatchEvent(other);
      await new Promise(r => setTimeout(r, 0));
      expect(state.pressed).toBe(false);
      expect(other.defaultPrevented).toBe(false);

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

    it('should dispatch bubbling custom events with detail and return the event', async () => {
      container.innerHTML = `
        <div @notice="received = $event.detail.value, $event.preventDefault()">
          <button @click="cancelled = $dispatch('notice', { value: 7 }).defaultPrevented">Dispatch</button>
        </div>
      `;
      const state = await helium({ received: 0, cancelled: false });

      container.querySelector('button').click();

      expect(state.received).toBe(7);
      expect(state.cancelled).toBe(true);
    });

    it('should support dispatch target, bubbles, and cancelable options', async () => {
      container.innerHTML = `
        <div @notice="rootCount++">
          <section @ref="recipient" @notice="targetCount++">
            <button @click="notCancelable = !$dispatch('notice', {}, { target: $recipient, bubbles: false, cancelable: false }).cancelable"></button>
          </section>
        </div>
      `;
      const state = await helium({ rootCount: 0, targetCount: 0, notCancelable: false });

      container.querySelector('button').click();

      expect(state.targetCount).toBe(1);
      expect(state.rootCount).toBe(0);
      expect(state.notCancelable).toBe(true);
    });

    it('should listen on window and remove the listener when its element is detached', async () => {
      container.innerHTML = '<div @resize.window="count++"></div>';
      const state = await helium({ count: 0 });
      const listener = container.querySelector('div');

      window.dispatchEvent(new Event('resize'));
      expect(state.count).toBe(1);

      listener.remove();
      await tick();
      window.dispatchEvent(new Event('resize'));
      expect(state.count).toBe(1);
    });

    it('should only run self handlers for events targeting the element itself', async () => {
      container.innerHTML = '<div id="parent" @click.self="count++"><button></button></div>';
      const state = await helium({ count: 0 });

      container.querySelector('button').click();
      expect(state.count).toBe(0);

      container.querySelector('#parent').click();
      expect(state.count).toBe(1);
    });

    it('should attach capture and passive listeners with native event options', async () => {
      container.innerHTML = '<div @click.capture="order.push(\'parent\')"><button @click.passive="order.push(\'child\')"></button></div>';
      const button = container.querySelector('button');
      const addSpy = vi.spyOn(button, 'addEventListener');
      const state = await helium({ order: [] });

      expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function), { passive: true, capture: false });
      button.click();
      expect([...state.order]).toEqual(['parent', 'child']);
      addSpy.mockRestore();
    });

    it('should reject the incompatible passive.prevent combination', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      container.innerHTML = '<button @click.passive.prevent="count++"></button>';
      const state = await helium({ count: 0 });

      container.querySelector('button').click();

      expect(state.count).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('.passive and .prevent cannot be combined'));
      warnSpy.mockRestore();
    });

    it('should throttle with an immediate leading call and one trailing call', async () => {
      container.innerHTML = '<button @click.throttle:40="count++"></button>';
      const state = await helium({ count: 0 });
      const button = container.querySelector('button');

      button.click();
      button.click();
      button.click();
      expect(state.count).toBe(1);

      await new Promise(resolve => setTimeout(resolve, 60));
      expect(state.count).toBe(2);
    });

    it('should cancel pending throttled work when the element is detached', async () => {
      container.innerHTML = '<button @click.throttle:40="count++"></button>';
      const state = await helium({ count: 0 });
      const button = container.querySelector('button');

      button.click();
      button.click();
      expect(state.count).toBe(1);
      button.remove();
      await tick();

      await new Promise(resolve => setTimeout(resolve, 60));
      expect(state.count).toBe(1);
    });

    it('should cancel pending debounced work when the element is detached', async () => {
      container.innerHTML = '<button @click.debounce:40="count++"></button>';
      const state = await helium({ count: 0 });
      const button = container.querySelector('button');

      button.click();
      button.remove();
      await tick();

      await new Promise(resolve => setTimeout(resolve, 60));
      expect(state.count).toBe(0);
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

    it('should expose singular and plural refs in DOM order', async () => {
      const capture = vi.fn();
      container.innerHTML = `
        <span id="first" @ref="hello"></span>
        <span id="second" @ref="hello"></span>
        <button @click="capture($hello, $refs.hello, $refs.missing)"></button>
      `;
      await helium({ capture });

      container.querySelector('button').click();

      expect(capture).toHaveBeenCalledWith(
        container.querySelector('#first'),
        [container.querySelector('#first'), container.querySelector('#second')],
        []
      );
    });

    it('should isolate refs by local @data scope and fall back lexically', async () => {
      const capture = vi.fn();
      container.innerHTML = `
        <section @data="{ outer: true }">
          <span id="outer-first" @ref="hello"></span>
          <span id="outer-second" @ref="hello"></span>
          <span id="shared" @ref="shared"></span>
          <button id="outer" @click="capture('outer', $hello, $refs.hello)"></button>
          <div @data="{ inner: true }">
            <span id="inner-ref" @ref="hello"></span>
            <button id="inner" @click="capture('inner', $hello, $refs.hello, $shared)"></button>
          </div>
        </section>
      `;
      await helium({ capture });

      container.querySelector('#outer').click();
      container.querySelector('#inner').click();

      expect(capture).toHaveBeenNthCalledWith(1, 'outer', container.querySelector('#outer-first'), [
        container.querySelector('#outer-first'), container.querySelector('#outer-second')
      ]);
      expect(capture).toHaveBeenNthCalledWith(2, 'inner', container.querySelector('#inner-ref'), [
        container.querySelector('#inner-ref')
      ], container.querySelector('#shared'));
    });

    it('should promote the next plural ref when the singular ref is removed', async () => {
      const capture = vi.fn();
      container.innerHTML = `
        <span id="first" @ref="hello"></span>
        <span id="second" @ref="hello"></span>
        <button @click="capture($hello, $refs.hello)"></button>
      `;
      await helium({ capture });

      container.querySelector('#first').remove();
      await new Promise(r => setTimeout(r, 0));
      container.querySelector('button').click();

      expect(capture).toHaveBeenCalledWith(container.querySelector('#second'), [container.querySelector('#second')]);
    });

    it('should keep plural refs in current DOM order when elements move', async () => {
      const capture = vi.fn();
      container.innerHTML = `
        <span id="first" @ref="hello"></span>
        <span id="second" @ref="hello"></span>
        <button @click="capture($hello, $refs.hello)"></button>
      `;
      await helium({ capture });

      container.querySelector('button').click();
      capture.mockClear();
      container.querySelector('#first').before(container.querySelector('#second'));
      await new Promise(r => setTimeout(r, 0));
      container.querySelector('button').click();

      expect(capture).toHaveBeenCalledWith(container.querySelector('#second'), [
        container.querySelector('#second'), container.querySelector('#first')
      ]);
    });

    it('should collect refs rendered by @for in their explicit data scope', async () => {
      const capture = vi.fn();
      container.innerHTML = `
        <section @data="{ items: [{ id: 1 }, { id: 2 }] }">
          <template @for="item in items" :key="item.id">
            <span class="row" @ref="row" @text="item.id"></span>
          </template>
          <button @click="capture($refs.row)"></button>
        </section>
      `;
      await helium({ capture });
      await new Promise(r => setTimeout(r, 0));

      container.querySelector('button').click();

      expect(capture).toHaveBeenCalledWith([...container.querySelectorAll('.row')]);
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

    it('should resolve HTTP ref targets in the initiating local scope', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () => 'Scoped response'
      });
      container.innerHTML = `
        <section @data="{ id: 1 }">
          <div id="first-result" @ref="result"></div>
        </section>
        <section @data="{ id: 2 }">
          <button @get="/scoped" @target="$result"></button>
          <div id="second-result" @ref="result"></div>
        </section>
      `;
      await helium({});

      container.querySelector('button').click();
      await new Promise(r => setTimeout(r, 0));

      expect(container.querySelector('#first-result').textContent).toBe('');
      expect(container.querySelector('#second-result').textContent).toBe('Scoped response');
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

    it('should manage namespaced initializers independently', async () => {
      const started = [];
      const cleaned = [];
      const setup = name => {
        started.push(name);
        return () => cleaned.push(name);
      };
      container.innerHTML = `
        <div
          data-he-init:editor="setup('editor')"
          data-he-init:tooltip="setup('tooltip')"
        ></div>
      `;
      await helium({ setup });
      const element = container.firstElementChild;

      expect(started).toEqual(['editor', 'tooltip']);
      expect(cleaned).toEqual([]);

      element.setAttribute('data-he-init:editor', "setup('replacement-editor')");
      await tick();
      expect(started).toEqual(['editor', 'tooltip', 'replacement-editor']);
      expect(cleaned).toEqual(['editor']);

      element.removeAttribute('data-he-init:tooltip');
      await tick();
      expect(cleaned).toEqual(['editor', 'tooltip']);

      element.remove();
      await tick();
      expect(cleaned).toEqual(['editor', 'tooltip', 'replacement-editor']);
    });

    it('should clean up every namespaced initializer when the root unmounts', async () => {
      const cleaned = [];
      container.innerHTML = `
        <div
          @init:editor="setup('editor')"
          @init:tooltip="setup('tooltip')"
        ></div>
      `;
      await helium({ setup: name => () => cleaned.push(name) });

      window.heliumTeardown();

      expect(cleaned).toEqual(['editor', 'tooltip']);
    });

    it('should give each initializer an independent signal and abort it before cleanup', async () => {
      const signals = new Map();
      const order = [];
      container.innerHTML = `
        <div
          data-he-init:editor="setup('editor', $signal)"
          data-he-init:tooltip="setup('tooltip', $signal)"
        ></div>
      `;
      const instance = createHelium({ root: container });
      await instance.helium({
        setup: (name, signal) => {
          signals.set(name, signal);
          return () => order.push([name, signal.aborted]);
        }
      });
      const element = container.firstElementChild;

      expect(signals.get('editor').aborted).toBe(false);
      expect(signals.get('tooltip').aborted).toBe(false);

      element.removeAttribute('data-he-init:editor');
      await tick();
      expect(signals.get('editor').aborted).toBe(true);
      expect(signals.get('tooltip').aborted).toBe(false);
      expect(order).toEqual([['editor', true]]);

      instance.heliumTeardown();
      expect(signals.get('tooltip').aborted).toBe(true);
      expect(order).toEqual([['editor', true], ['tooltip', true]]);
    });

    it('should clean up stale asynchronous setup without replacing the current initializer', async () => {
      let resolveOld;
      const oldSignal = [];
      const replacementSignal = [];
      const cleaned = [];
      container.innerHTML = '<div data-he-init:feature="startOld($signal)"></div>';
      const instance = createHelium({ root: container });
      await instance.helium({
        startOld: signal => {
          oldSignal.push(signal);
          return new Promise(resolve => { resolveOld = resolve; });
        },
        startNew: async signal => {
          replacementSignal.push(signal);
          await Promise.resolve();
          return async () => { cleaned.push('new'); };
        }
      });
      const element = container.firstElementChild;

      element.setAttribute('data-he-init:feature', 'startNew($signal)');
      await tick();
      expect(oldSignal[0].aborted).toBe(true);
      expect(replacementSignal[0].aborted).toBe(false);

      resolveOld(async () => { cleaned.push('old'); });
      await tick();
      expect(cleaned).toEqual(['old']);

      element.removeAttribute('data-he-init:feature');
      await tick();
      expect(replacementSignal[0].aborted).toBe(true);
      expect(cleaned).toEqual(['old', 'new']);
      instance.heliumTeardown();
    });

    it('should route setup, cleanup, binding, event, import, and request errors through handleError', async () => {
      const errors = [];
      const cleanupError = new Error('cleanup failed');
      const fetchError = new Error('request failed');
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(fetchError);
      container.innerHTML = `
        <span @text="failBinding()"></span>
        <button id="event" @click="failEvent()"></button>
        <button id="request" @get="/failure"></button>
        <div id="setup" data-he-init:bad="failSetup()"></div>
        <div id="cleanup" data-he-init:cleanup="startCleanup()"></div>
        <div data-he-import="/missing-helium-lifecycle-module.js"></div>
      `;
      const instance = createHelium({
        root: container,
        handleError: (error, context) => errors.push({ error, context }),
      });
      try {
        await instance.helium({
          failBinding: () => { throw new Error('binding failed'); },
          failEvent: () => Promise.reject(new Error('event failed')),
          failSetup: () => { throw new Error('setup failed'); },
          startCleanup: () => async () => { throw cleanupError; },
        });
        container.querySelector('#event').click();
        container.querySelector('#request').click();
        container.querySelector('#cleanup').remove();
        await tick();
        await tick();

        const phases = errors.map(({ context }) => context.phase);
        expect(phases).toEqual(expect.arrayContaining(['binding', 'event', 'request', 'setup', 'cleanup', 'import']));
        expect(errors.find(({ context }) => context.phase === 'setup').context).toMatchObject({
          directive: 'data-he-init:bad',
          expression: 'failSetup()',
          element: container.querySelector('#setup'),
        });
        expect(errors.find(({ error }) => error === fetchError).context).toMatchObject({
          phase: 'request', method: 'GET', url: '/failure',
        });
        expect(errors.find(({ error }) => error === cleanupError).context.signal.aborted).toBe(true);
      } finally {
        instance.heliumTeardown();
        global.fetch = originalFetch;
      }
    });

    it('should report asynchronous setup rejection and ignore expected abort rejection', async () => {
      const errors = [];
      container.innerHTML = `
        <div data-he-init:reject="rejectSetup()"></div>
        <div id="abort" data-he-init:abort="waitForAbort($signal)"></div>
      `;
      const instance = createHelium({
        root: container,
        handleError: (error, context) => errors.push({ error, context }),
      });
      await instance.helium({
        rejectSetup: async () => { throw new Error('async setup failed'); },
        waitForAbort: signal => new Promise((_, reject) => signal.addEventListener('abort', () => {
          reject(new DOMException('cancelled', 'AbortError'));
        }, { once: true })),
      });
      container.querySelector('#abort').remove();
      await tick();

      expect(errors).toHaveLength(1);
      expect(errors[0].error.message).toBe('async setup failed');
      expect(errors[0].context.phase).toBe('setup');
      instance.heliumTeardown();
    });
  });

  describe('@import lifecycle behaviors', () => {
    const one = pathToFileURL(`${process.cwd()}/test-fixtures/import-behavior-one.js`).href;
    const two = pathToFileURL(`${process.cwd()}/test-fixtures/import-behavior-two.js`).href;

    afterEach(() => {
      delete globalThis.__heliumImportBehavior;
    });

    it('should run default exports independently and preserve named exports', async () => {
      const calls = [];
      const contexts = new Map();
      const cleaned = [];
      globalThis.__heliumImportBehavior = (name, context) => {
        calls.push([name, context.element.id]);
        contexts.set(`${name}:${context.element.id}`, context);
        return () => cleaned.push([name, context.element.id, context.signal.aborted]);
      };

      container.innerHTML = `
        <section id="outer" data-he-data="{ count: 2 }">
          <button id="outer-trigger" class="candidate" data-he-ref="trigger"></button>
          <aside id="nested">
            <button id="nested-trigger" class="candidate" data-he-ref="trigger"></button>
          </aside>
        </section>
      `;
      const outer = container.querySelector('#outer');
      const nested = container.querySelector('#nested');
      outer.setAttribute('data-he-import', `${one}, ${two}`);
      nested.setAttribute('data-he-import', two);

      const instance = createHelium({ root: container });
      const state = await instance.helium({});

      expect(state.importedGreeting('Helium')).toBe('Hello Helium');
      expect(state.importedBehaviorTwo).toBe(true);
      expect(calls).toEqual([['one', 'outer'], ['two', 'outer'], ['two', 'nested']]);

      const outerOne = contexts.get('one:outer');
      const outerTwo = contexts.get('two:outer');
      const nestedTwo = contexts.get('two:nested');
      expect(outerOne).toMatchObject({ element: outer, root: container, scope: outer });
      expect(outerOne.data.count).toBe(2);
      expect(typeof outerOne.dispatch).toBe('function');
      expect(typeof outerOne.watch).toBe('function');
      expect(outerOne.refs.trigger).toEqual([container.querySelector('#outer-trigger')]);
      expect(outerOne.query('.candidate')).toBe(container.querySelector('#outer-trigger'));
      expect(outerOne.query.all('.candidate')).toEqual([container.querySelector('#outer-trigger')]);
      expect(outerTwo.refs.trigger).toEqual(outerOne.refs.trigger);
      expect(nestedTwo.refs.trigger).toEqual([container.querySelector('#nested-trigger')]);
      expect(nestedTwo.query.all('.candidate')).toEqual([container.querySelector('#nested-trigger')]);

      const added = document.createElement('button');
      added.className = 'candidate';
      added.setAttribute('data-he-ref', 'trigger');
      outer.insertBefore(added, nested);
      await tick();
      expect(outerOne.refs.trigger).toEqual([container.querySelector('#outer-trigger'), added]);
      expect(outerOne.query.all('.candidate')).toEqual([container.querySelector('#outer-trigger'), added]);

      outer.setAttribute('data-he-import', two);
      await tick();
      expect(cleaned).toEqual([['one', 'outer', true]]);
      expect(outerOne.signal.aborted).toBe(true);
      expect(outerTwo.signal.aborted).toBe(false);
      expect(nestedTwo.signal.aborted).toBe(false);
      expect(calls).toEqual([['one', 'outer'], ['two', 'outer'], ['two', 'nested']]);

      outer.removeAttribute('data-he-import');
      await tick();
      expect(cleaned).toEqual([['one', 'outer', true], ['two', 'outer', true]]);
      expect(nestedTwo.signal.aborted).toBe(false);

      instance.heliumTeardown();
      expect(cleaned).toEqual([
        ['one', 'outer', true],
        ['two', 'outer', true],
        ['two', 'nested', true],
      ]);
    });

    it('should hand import-map pinned bare names to import() unchanged', async () => {
      const setup = vi.fn();
      vi.doMock('pinned-menu', () => ({ default: setup, pinnedValue: 'pinned' }));
      vi.doMock('widgets/tabs', () => ({ default: undefined, tabsValue: 'tabs' }));
      const map = document.createElement('script');
      map.type = 'importmap';
      map.textContent = JSON.stringify({ imports: { 'pinned-menu': '/assets/menu-abc123.js', 'widgets/': '/assets/widgets/' } });
      document.head.appendChild(map);

      try {
        container.innerHTML = '<section id="menu" @import="pinned-menu, widgets/tabs"></section>';
        const instance = createHelium({ root: container });
        const state = await instance.helium({});

        expect(state.pinnedValue).toBe('pinned');
        expect(state.tabsValue).toBe('tabs');
        expect(setup).toHaveBeenCalledTimes(1);
        expect(setup.mock.calls[0][0].element).toBe(container.querySelector('#menu'));
        instance.heliumTeardown();
      } finally {
        map.remove();
        vi.doUnmock('pinned-menu');
        vi.doUnmock('widgets/tabs');
      }
    });

    it('should keep resolving unpinned bare names relative to the page', async () => {
      const handleError = vi.fn();
      const map = document.createElement('script');
      map.type = 'importmap';
      map.textContent = JSON.stringify({ imports: { 'pinned-menu': '/assets/menu.js' } });
      document.head.appendChild(map);

      try {
        container.innerHTML = '<section @import="unpinned-helper"></section>';
        const instance = createHelium({ root: container, handleError });
        await instance.helium({});

        expect(handleError).toHaveBeenCalledTimes(1);
        expect(handleError.mock.calls[0][1]).toMatchObject({
          phase: 'import',
          path: new URL('./unpinned-helper.js', location.href).href,
        });
        instance.heliumTeardown();
      } finally {
        map.remove();
      }
    });

    it('should safely finish asynchronous imported setup after its behavior is removed', async () => {
      let resolveSetup;
      let signal;
      const cleanup = vi.fn();
      const errors = [];
      globalThis.__heliumImportBehavior = (_name, context) => {
        signal = context.signal;
        return new Promise(resolve => { resolveSetup = resolve; });
      };
      const element = document.createElement('div');
      element.setAttribute('data-he-import', one);
      container.append(element);
      const instance = createHelium({
        root: container,
        handleError: (error, context) => errors.push({ error, context }),
      });
      await instance.helium({});

      element.removeAttribute('data-he-import');
      await tick();
      expect(signal.aborted).toBe(true);

      resolveSetup(cleanup);
      await tick();
      expect(cleanup).toHaveBeenCalledOnce();
      expect(errors).toEqual([]);
      instance.heliumTeardown();
    });

    it('should watch reactive selections with previous values and lifecycle cleanup', async () => {
      const changes = [];
      const names = [];
      const immediate = [];
      const stoppedChanges = [];
      const errors = [];
      let context;
      globalThis.__heliumImportBehavior = (_name, value) => {
        context = value;
        value.watch(
          data => data.useAlternate ? data.alternate : data.count,
          (current, previous) => changes.push([current, previous]),
        );
        value.watch(
          () => value.data.user.name,
          (current, previous) => names.push([current, previous]),
        );
        value.watch(
          data => data.alternate,
          (current, previous) => immediate.push([current, previous]),
          { immediate: true },
        );
        const stop = value.watch(
          data => data.count,
          (current, previous) => stoppedChanges.push([current, previous]),
        );
        stop();
        stop();
        value.watch(
          data => data.fail,
          async fail => { if (fail) throw new Error('watched callback failed'); },
        );
      };
      const element = document.createElement('div');
      element.setAttribute('data-he-data', "{ count: 0, alternate: 10, useAlternate: false, user: { name: 'Ada' }, fail: false }");
      element.setAttribute('data-he-import', one);
      container.append(element);
      const instance = createHelium({
        root: container,
        handleError: (error, details) => errors.push({ error, details }),
      });
      await instance.helium({});

      expect(changes).toEqual([]);
      expect(names).toEqual([]);
      expect(immediate).toEqual([[10, undefined]]);
      expect(stoppedChanges).toEqual([]);

      context.data.count = 1;
      await tick();
      expect(changes).toEqual([[1, 0]]);

      context.data.count = 2;
      context.data.count = 3;
      await tick();
      expect(changes).toEqual([[1, 0], [3, 1]]);
      expect(stoppedChanges).toEqual([]);

      context.data.useAlternate = true;
      await tick();
      expect(changes.at(-1)).toEqual([10, 3]);
      context.data.count = 4;
      await tick();
      expect(changes.at(-1)).toEqual([10, 3]);
      context.data.alternate = 11;
      await tick();
      expect(changes.at(-1)).toEqual([11, 10]);

      context.data.user.name = 'Grace';
      await tick();
      expect(names).toEqual([['Grace', 'Ada']]);

      element.setAttribute('data-he-data', "{ count: 100, alternate: 20, useAlternate: true, user: { name: 'Lin' }, fail: false }");
      await tick();
      expect(changes.at(-1)).toEqual([20, 11]);
      expect(names.at(-1)).toEqual(['Lin', 'Grace']);

      context.data.fail = true;
      await tick();
      await tick();
      expect(errors).toHaveLength(1);
      expect(errors[0].error.message).toBe('watched callback failed');
      expect(errors[0].details).toMatchObject({
        phase: 'watch', element, behavior: one,
      });

      element.removeAttribute('data-he-import');
      await tick();
      context.data.alternate = 12;
      context.data.user.name = 'Katherine';
      await tick();
      expect(changes.at(-1)).toEqual([20, 11]);
      expect(names).toEqual([['Grace', 'Ada'], ['Lin', 'Grace']]);
      instance.heliumTeardown();
    });

    it('should watch behavior-local refs as they connect, reorder, and cross behavior boundaries', async () => {
      const changes = new Map();
      const initiallyEmpty = [];
      globalThis.__heliumImportBehavior = (name, context) => {
        const key = `${name}:${context.element.id}`;
        changes.set(key, []);
        context.watch(
          () => context.refs.item,
          (current, previous) => changes.get(key).push({
            current: current.map(element => element.id),
            previous: previous.map(element => element.id),
          }),
        );
        if (name === 'one') {
          context.watch(
            () => context.refs.late,
            (current, previous) => initiallyEmpty.push([current.map(el => el.id), previous.map(el => el.id)]),
          );
        }
      };
      container.innerHTML = `
        <section id="outer">
          <button id="outer-a" data-he-ref="item"></button>
          <aside id="nested">
            <button id="nested-a" data-he-ref="item"></button>
          </aside>
        </section>
      `;
      const outer = container.querySelector('#outer');
      const nested = container.querySelector('#nested');
      outer.setAttribute('data-he-import', one);
      nested.setAttribute('data-he-import', two);
      const instance = createHelium({ root: container });
      await instance.helium({});

      expect(changes.get('one:outer')).toEqual([]);
      expect(changes.get('two:nested')).toEqual([]);
      expect(initiallyEmpty).toEqual([]);

      const late = document.createElement('button');
      late.id = 'late';
      late.setAttribute('data-he-ref', 'late');
      outer.insertBefore(late, nested);
      await tick();
      expect(initiallyEmpty).toEqual([[['late'], []]]);

      outer.insertAdjacentHTML('afterbegin', '<span id="unrelated"></span>');
      await tick();
      expect(changes.get('one:outer')).toEqual([]);

      const outerB = document.createElement('button');
      outerB.id = 'outer-b';
      outerB.setAttribute('data-he-ref', 'item');
      outer.insertBefore(outerB, nested);
      await tick();
      expect(changes.get('one:outer')).toEqual([{
        current: ['outer-a', 'outer-b'], previous: ['outer-a'],
      }]);
      expect(changes.get('two:nested')).toEqual([]);

      outer.insertBefore(outerB, container.querySelector('#outer-a'));
      await tick();
      expect(changes.get('one:outer').at(-1)).toEqual({
        current: ['outer-b', 'outer-a'], previous: ['outer-a', 'outer-b'],
      });

      const nestedB = document.createElement('button');
      nestedB.id = 'nested-b';
      nestedB.setAttribute('data-he-ref', 'item');
      nested.append(nestedB);
      await tick();
      expect(changes.get('one:outer')).toHaveLength(2);
      expect(changes.get('two:nested')).toEqual([{
        current: ['nested-a', 'nested-b'], previous: ['nested-a'],
      }]);

      nested.removeAttribute('data-he-import');
      await tick();
      expect(changes.get('one:outer').at(-1)).toEqual({
        current: ['outer-b', 'outer-a', 'nested-a', 'nested-b'],
        previous: ['outer-b', 'outer-a'],
      });
      expect(changes.get('two:nested')).toHaveLength(1);

      outer.removeAttribute('data-he-import');
      await tick();
      const outerC = document.createElement('button');
      outerC.id = 'outer-c';
      outerC.setAttribute('data-he-ref', 'item');
      outer.append(outerC);
      await tick();
      expect(changes.get('one:outer')).toHaveLength(3);
      instance.heliumTeardown();
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

    it('should expose root, local scope, and scoped query helpers', async () => {
      const capture = vi.fn();
      container.innerHTML = `
        <div class="item root-item"></div>
        <section id="scope" @data="{ ready: true }">
          <div class="item scope-item"></div>
          <button @click="capture($root, $scope, $el, $.all('.item'), $.root.all('.item'), $.scope('.item'), $.scope.all('.item'))"></button>
        </section>
      `;
      await helium({ capture });

      const button = container.querySelector('button');
      button.click();

      expect(capture).toHaveBeenCalledWith(
        container,
        container.querySelector('#scope'),
        button,
        [...document.querySelectorAll('.item')],
        [...container.querySelectorAll('.item')],
        container.querySelector('.scope-item'),
        [container.querySelector('.scope-item')]
      );
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

    it('should add, replace, and remove event directives on retained elements', async () => {
      container.innerHTML = '<button>Run</button>';
      const state = await helium({ first: 0, second: 0 });
      const button = container.querySelector('button');

      button.setAttribute('data-he-click', 'first++');
      await tick();
      button.click();
      expect(state.first).toBe(1);

      button.setAttribute('data-he-click', 'second++');
      await tick();
      button.click();
      expect(state.first).toBe(1);
      expect(state.second).toBe(1);

      button.removeAttribute('data-he-click');
      await tick();
      button.click();
      expect(state.second).toBe(1);
    });

    it('should reconcile reactive bindings without leaving old dependencies active', async () => {
      container.innerHTML = '<span></span>';
      const state = await helium({ first: 'A', second: 'B' });
      const span = container.querySelector('span');

      span.setAttribute('data-he-text', 'first');
      await tick();
      expect(span.textContent).toBe('A');

      span.setAttribute('data-he-text', 'second');
      await tick();
      expect(span.textContent).toBe('B');
      state.first = 'stale';
      await tick();
      expect(span.textContent).toBe('B');

      span.removeAttribute('data-he-text');
      await tick();
      state.second = 'also stale';
      await tick();
      expect(span.textContent).toBe('B');
    });

    it('should reconcile bind, ref, and init lifecycle directives independently', async () => {
      const started = vi.fn();
      const cleaned = vi.fn();
      container.innerHTML = '<input><button @click="seen = $refs.field.length"></button>';
      const state = await helium({ name: 'Ada', seen: -1, setup: () => (started(), () => cleaned()) });
      const input = container.querySelector('input');
      const button = container.querySelector('button');

      input.setAttribute('data-he-bind', 'name');
      input.setAttribute('data-he-ref', 'field');
      input.setAttribute('data-he-init', 'setup()');
      await tick();
      expect(input.value).toBe('Ada');
      expect(started).toHaveBeenCalledTimes(1);
      button.click();
      expect(state.seen).toBe(1);

      input.value = 'Grace';
      input.dispatchEvent(new Event('input'));
      expect(state.name).toBe('Grace');

      input.removeAttribute('data-he-bind');
      input.removeAttribute('data-he-ref');
      input.removeAttribute('data-he-init');
      await tick();
      expect(cleaned).toHaveBeenCalledTimes(1);
      input.value = 'Ignored';
      input.dispatchEvent(new Event('input'));
      expect(state.name).toBe('Grace');
      button.click();
      expect(state.seen).toBe(0);
    });

    it('should replace local @data and re-track descendant bindings', async () => {
      container.innerHTML = '<section data-he-data="{ label: \'one\' }"><span @text="label"></span></section>';
      await helium({ label: 'root' });
      const section = container.querySelector('section');
      const span = container.querySelector('span');
      expect(span.textContent).toBe('one');

      section.setAttribute('data-he-data', "{ label: 'two' }");
      await tick();
      expect(span.textContent).toBe('two');

      section.removeAttribute('data-he-data');
      await tick();
      expect(span.textContent).toBe('root');
    });

    it('should restore initial root state when dynamic root data is removed', async () => {
      container.setAttribute('data-he-data', '{ count: 1, temporary: true }');
      container.innerHTML = '<span @text="count"></span>';
      const state = await helium({ count: 9 });
      expect(state.count).toBe(1);
      expect(state.temporary).toBe(true);

      container.setAttribute('data-he-data', '{ count: 2 }');
      await tick();
      expect(state.count).toBe(2);
      expect(state.temporary).toBeUndefined();
      expect(container.querySelector('span').textContent).toBe('2');

      container.removeAttribute('data-he-data');
      await tick();
      expect(state.count).toBe(9);
      expect(container.querySelector('span').textContent).toBe('9');
    });

    it('should tear down and replace structural directives when their expressions change', async () => {
      const cleaned = vi.fn();
      container.innerHTML = '<template data-he-if="first"><i @init="setup()" @text="message"></i></template>';
      const state = await helium({ first: true, second: false, message: 'shown', setup: () => () => cleaned() });
      await tick();
      const template = container.querySelector('template');
      expect(container.querySelector('i').textContent).toBe('shown');

      template.setAttribute('data-he-if', 'second');
      await tick();
      expect(container.querySelector('i')).toBeNull();
      expect(cleaned).toHaveBeenCalledTimes(1);

      state.second = true;
      await tick();
      expect(container.querySelector('i').textContent).toBe('shown');
      template.removeAttribute('data-he-if');
      await tick();
      expect(container.querySelector('i')).toBeNull();
      expect(cleaned).toHaveBeenCalledTimes(2);
    });

    it('should replace keyed list sources without retaining old rows', async () => {
      container.innerHTML = `
        <template data-he-for="item in first" :key="item.id">
          <b :data-id="item.id" @text="item.name"></b>
        </template>
      `;
      await helium({
        first: [{ id: 'a', name: 'Alpha' }],
        second: [{ id: 'b', name: 'Beta' }]
      });
      await tick();
      const template = container.querySelector('template');
      expect(container.querySelector('b').textContent).toBe('Alpha');

      template.setAttribute('data-he-for', 'item in second');
      await tick();
      expect([...container.querySelectorAll('b')].map(el => el.textContent)).toEqual(['Beta']);
      expect(container.querySelector('[data-id="a"]')).toBeNull();
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

    it('should tear down a mounted root when its DOM owner disconnects it', async () => {
      const firstHost = document.createElement('div');
      const secondHost = document.createElement('div');
      const root = document.createElement('section');
      root.setAttribute('data-he-init:root', 'setup($signal)');
      firstHost.append(root);
      document.body.append(firstHost, secondHost);
      let signal;
      const cleanup = vi.fn(() => expect(signal.aborted).toBe(true));
      const app = await helium.mount(root, {
        setup: value => (signal = value, cleanup),
      });

      // A synchronous move is not a disconnection lifecycle.
      secondHost.append(root);
      await tick();
      expect(signal.aborted).toBe(false);
      expect(cleanup).not.toHaveBeenCalled();

      secondHost.remove();
      await tick();
      expect(signal.aborted).toBe(true);
      expect(cleanup).toHaveBeenCalledOnce();

      app.unmount();
      expect(cleanup).toHaveBeenCalledOnce();
      firstHost.remove();
    });

    it('should detect root removal from inside a shadow tree', async () => {
      const host = document.createElement('div');
      const shadow = host.attachShadow({ mode: 'open' });
      const root = document.createElement('section');
      root.setAttribute('data-he-init', 'setup($signal)');
      shadow.append(root);
      document.body.append(host);
      let signal;
      const cleanup = vi.fn();
      await helium.mount(root, { setup: value => (signal = value, cleanup) });

      root.remove();
      await tick();
      expect(signal.aborted).toBe(true);
      expect(cleanup).toHaveBeenCalledOnce();
      host.remove();
    });

    it('should preserve a data-turbo-permanent root across Turbo parking', async () => {
      const root = document.createElement('section');
      root.setAttribute('data-turbo-permanent', '');
      root.innerHTML = '<button @click="count++"></button><span @text="count"></span>';
      document.body.append(root);
      const app = await helium.mount(root, { count: 0 });

      root.remove();
      await Promise.resolve();
      document.body.append(root);
      await tick();
      root.querySelector('button').click();
      await tick();
      expect(root.querySelector('span').textContent).toBe('1');

      root.remove();
      await tick();
      await tick();
      app.state.count = 2;
      await tick();
      expect(root.querySelector('span').textContent).toBe('1');
      app.unmount();
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

  it('should remove structural output before re-initializing the same DOM', async () => {
    container.innerHTML = `
      <main @data="{ items: [{ id: 1 }, { id: 2 }], show: true }">
        <template @for="item in items" :key="item.id"><span class="row" @text="item.id"></span></template>
        <template @if="show"><b class="conditional">shown</b></template>
      </main>
    `;
    await helium({});
    await tick();
    expect(container.querySelectorAll('.row')).toHaveLength(2);
    expect(container.querySelectorAll('.conditional')).toHaveLength(1);

    await helium({});
    await tick();

    expect(container.querySelectorAll('.row')).toHaveLength(2);
    expect(container.querySelectorAll('.conditional')).toHaveLength(1);
  });

  it('should not duplicate structural output from a restored Turbo snapshot', async () => {
    container.innerHTML = `
      <main @data="{ items: [{ id: 1 }, { id: 2 }], show: true }">
        <template @for="item in items" :key="item.id"><span class="row" @text="item.id"></span></template>
        <template @if="show"><b class="conditional">shown</b></template>
      </main>
    `;
    await helium({});
    await tick();

    // Caching leaves the live page (and so the snapshot) fully rendered.
    document.dispatchEvent(new Event('turbo:before-cache'));
    expect(container.querySelectorAll('.row')).toHaveLength(2);
    expect(container.querySelectorAll('.conditional')).toHaveLength(1);

    // Turbo restores a clone of the page; its stale rows must not duplicate.
    const snapshot = container.cloneNode(true);
    container.replaceWith(snapshot);
    container = snapshot;
    document.dispatchEvent(new Event('turbo:render'));
    await tick();
    expect(container.querySelectorAll('.row')).toHaveLength(2);
    expect(container.querySelectorAll('.conditional')).toHaveLength(1);
  });

  it('should reapply initial state after Turbo renders until torn down', async () => {
    container.innerHTML = '<span @text="greet()"></span>';
    await helium({ greet: () => 'hello' });
    const next = container.cloneNode(false);
    next.innerHTML = '<b @text="typeof greet"></b>';
    container.replaceWith(next);
    container = next;
    document.dispatchEvent(new Event('turbo:render'));
    await tick();
    expect(container.querySelector('b').textContent).toBe('function');

    window.heliumTeardown();
    const state = await helium();
    expect(state.greet).toBeUndefined();
  });

  it('should not initialize a Turbo preview', async () => {
    container.innerHTML = '<span @text="count"></span>';
    await helium({ count: 1 });
    const preview = container.cloneNode(true);
    preview.querySelector('span').textContent = 'preview';
    container.replaceWith(preview);
    container = preview;
    document.documentElement.setAttribute('data-turbo-preview', '');
    try {
      document.dispatchEvent(new Event('turbo:render'));
      await tick();
      expect(container.querySelector('span').textContent).toBe('preview');
    } finally {
      document.documentElement.removeAttribute('data-turbo-preview');
    }
  });

  it('should not start a default Turbo instance over an explicit factory instance', async () => {
    const hit = vi.fn();
    container.innerHTML = '<button @click="hit()">Hit</button>';
    const instance = createHelium({ root: container });
    await instance.helium({ hit });

    document.dispatchEvent(new Event('turbo:before-render'));
    document.dispatchEvent(new Event('turbo:render'));
    await tick();
    container.querySelector('button').click();

    expect(hit).toHaveBeenCalledTimes(1);
    instance.heliumTeardown();
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

  describe('name-derived params', () => {
    const jsonOk = () => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) });
    const sentBody = call => JSON.parse(global.fetch.mock.calls[call][1].body);
    const post = async (input, value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 10));
    };

    it('sends the input value as data, never evaluating it', async () => {
      global.fetch.mockImplementation(async () => jsonOk());
      window.__pwned = false;
      container.innerHTML = '<input name="user[name]" @post="/save">';
      await helium({});
      const input = container.querySelector('input');
      await post(input, "x' + (window.__pwned = true) + '");
      await post(input, "O'Brien");
      expect(window.__pwned).toBe(false);
      expect(sentBody(0)).toEqual({ user: { name: "x' + (window.__pwned = true) + '" } });
      expect(sentBody(1)).toEqual({ user: { name: "O'Brien" } });
      delete window.__pwned;
    });

    it('reads the element value for a single-key name', async () => {
      global.fetch.mockImplementation(async () => jsonOk());
      container.innerHTML = '<input name="username" @post="/save">';
      await helium({ value: 'state value must not leak' });
      await post(container.querySelector('input'), 'daz');
      expect(sentBody(0)).toEqual({ username: 'daz' });
    });

    it('supports explicit shorthand at any depth and checkbox state', async () => {
      global.fetch.mockImplementation(async () => jsonOk());
      container.innerHTML = `
        <button id="deep" @post="/save" @params="a:b:c:value" value="v">Save</button>
        <input id="agree" type="checkbox" name="agreed" @post="/consent">`;
      await helium({});
      container.querySelector('#deep').click();
      container.querySelector('#agree').click();
      await new Promise(r => setTimeout(r, 10));
      expect(sentBody(0)).toEqual({ a: { b: { c: 'v' } } });
      expect(sentBody(1)).toEqual({ agreed: true });
    });
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
    expect(spy).toHaveBeenCalledWith('Helium request error:', expect.stringContaining('HTTP 500'));
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

  it('should abort an attribute request when its owning element disconnects', async () => {
    const errors = [];
    let requestSignal;
    global.fetch.mockImplementation((_, options) => {
      requestSignal = options.signal;
      return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)));
    });
    container.innerHTML = '<button @get="/slow">Load</button>';
    const instance = createHelium({ root: container, handleError: error => errors.push(error) });
    await instance.helium({});

    container.querySelector('button').click();
    await tick();
    container.querySelector('button').remove();
    await tick();

    expect(requestSignal.aborted).toBe(true);
    expect(errors).toEqual([]);
    instance.heliumTeardown();
  });

  it('should let the latest attribute request win without rendering a stale response', async () => {
    const pending = [];
    global.fetch.mockImplementation((_, options) => new Promise(resolve => pending.push({ resolve, signal: options.signal })));
    container.innerHTML = '<button @get="/search" @target="#out">Search</button><div id="out"></div>';
    await helium({});
    const button = container.querySelector('button');

    button.click();
    button.click();
    expect(pending[0].signal.aborted).toBe(true);
    pending[1].resolve({ ok: true, headers: { get: () => 'text/html' }, text: async () => 'new' });
    await tick();
    pending[0].resolve({ ok: true, headers: { get: () => 'text/html' }, text: async () => 'old' });
    await tick();

    expect(container.querySelector('#out').textContent).toBe('new');
  });

  it('should restore loading content after HTTP failure and cancellation', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let rejectSlow;
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 500, headers: { get: () => 'text/plain' } })
      .mockImplementationOnce((_, options) => new Promise((_, reject) => {
        rejectSlow = () => reject(options.signal.reason);
        options.signal.addEventListener('abort', rejectSlow);
      }));
    container.innerHTML = `
      <button id="fail" @get="/fail" @target="#out" @loading="'Loading…'">Fail</button>
      <button id="slow" @get="/slow" @target="#out" @loading="'Loading…'">Slow</button>
      <div id="out"><strong>Ready</strong></div>
    `;
    await helium({});

    container.querySelector('#fail').click();
    expect(container.querySelector('#out').textContent).toBe('Loading…');
    await tick();
    expect(container.querySelector('#out').innerHTML).toBe('<strong>Ready</strong>');

    const slow = container.querySelector('#slow');
    slow.click();
    expect(container.querySelector('#out').textContent).toBe('Loading…');
    slow.remove();
    await tick();
    expect(container.querySelector('#out').innerHTML).toBe('<strong>Ready</strong>');
    expect(rejectSlow).toBeTypeOf('function');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should expose parsed data, errors, and request context to HTTP hooks', async () => {
    const success = vi.fn();
    const failure = vi.fn();
    global.fetch
      .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ id: 7 }) })
      .mockResolvedValueOnce({ ok: false, status: 422, statusText: 'Unprocessable Content', headers: { get: () => 'application/json' } });
    container.innerHTML = `
      <button id="save" @post="/items" @success="success($response.id, $request.method, $request.response.status)"></button>
      <button id="fail" @post="/items" @error="failure($error.status, $request.method, $request.response.status)"></button>
    `;
    await helium({ success, failure });

    container.querySelector('#save').click();
    await tick();
    container.querySelector('#fail').click();
    await tick();

    expect(success).toHaveBeenCalledWith(7, 'POST', 200);
    expect(failure).toHaveBeenCalledWith(422, 'POST', 422);
  });

  it('should support programmatic success/error hooks and external cancellation', async () => {
    const controller = new AbortController();
    const errors = [];
    let optionsSeen;
    global.fetch.mockImplementation((_, options) => {
      optionsSeen = options;
      return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)));
    });
    container.innerHTML = `<button @click="$get('/slow', { signal: controller.signal, cache: 'no-store', error: failed })">Go</button>`;
    const instance = createHelium({ root: container, handleError: error => errors.push(error) });
    await instance.helium({ controller, failed: vi.fn() });

    container.querySelector('button').click();
    controller.abort();
    await tick();

    expect(optionsSeen.signal.aborted).toBe(true);
    expect(optionsSeen.cache).toBe('no-store');
    expect(errors).toEqual([]);
    instance.heliumTeardown();
  });

  it('should run programmatic success and error callbacks with request context', async () => {
    const succeeded = vi.fn();
    const failed = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch
      .mockResolvedValueOnce({ ok: true, status: 201, headers: { get: () => 'application/json' }, json: async () => ({ id: 3 }) })
      .mockResolvedValueOnce({ ok: false, status: 409, headers: { get: () => 'application/json' } });
    container.innerHTML = `
      <button id="ok" @click="$get('/ok', { target: '#out', success: succeeded })"></button>
      <button id="bad" @click="$get('/bad', { error: failed })"></button>
      <div id="out"></div>
    `;
    await helium({ succeeded, failed });

    container.querySelector('#ok').click();
    await tick();
    container.querySelector('#bad').click();
    await tick();

    expect(succeeded).toHaveBeenCalledWith({ id: 3 }, expect.objectContaining({ method: 'GET', url: '/ok' }));
    expect(container.querySelector('#out').textContent).toBe('[object Object]');
    expect(failed).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }), expect.objectContaining({ method: 'GET', url: '/bad' }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should reject required same-origin mutations without a CSRF token', async () => {
    document.querySelector('meta[name="csrf-token"]')?.remove();
    const errors = [];
    const failure = vi.fn();
    container.innerHTML = '<button @post="/items" @error="failure($error.code)">Save</button>';
    const instance = createHelium({ root: container, requireCsrf: true, handleError: error => errors.push(error) });
    await instance.helium({ failure });

    container.querySelector('button').click();
    await tick();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledWith('HELIUM_CSRF_TOKEN_MISSING');
    expect(errors[0].code).toBe('HELIUM_CSRF_TOKEN_MISSING');
    instance.heliumTeardown();
  });

  it('should include an available CSRF token and forward @options to fetch', async () => {
    const meta = document.createElement('meta');
    meta.name = 'csrf-token';
    meta.content = 'secure-token';
    document.head.appendChild(meta);
    global.fetch.mockResolvedValueOnce({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) });
    container.innerHTML = `<button @post="/items" @options="{ requireCsrf: true, cache: 'no-store', headers: { 'X-Trace': 'yes' } }">Save</button>`;
    await helium({});

    container.querySelector('button').click();
    await tick();

    expect(global.fetch).toHaveBeenCalledWith('/items', expect.objectContaining({
      cache: 'no-store',
      headers: expect.objectContaining({ 'X-CSRF-Token': 'secure-token', 'X-Trace': 'yes' }),
    }));
    meta.remove();
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

  it('should route an unretried SSE stream failure through the request error lifecycle', async () => {
    const streamError = new Error('stream disconnected');
    const failure = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'text/event-stream' },
      body: { getReader: () => ({ read: async () => { throw streamError; } }) },
    });
    container.innerHTML = '<button @get="/events" @error="failure($error, $request.method)"></button>';
    await helium({ failure });

    container.querySelector('button').click();
    await tick();

    expect(failure).toHaveBeenCalledWith(streamError, 'GET');
    expect(spy).toHaveBeenCalledWith('Helium request error:', 'stream disconnected');
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

describe('Structural output ownership', () => {
  afterEach(() => {
    window.heliumTeardown?.();
    document.body.innerHTML = '';
  });

  it('discards rendered rows restored from a cached copy of the page', async () => {
    document.body.innerHTML = `<main id="page">
      <template @for="item in items" :key="item"><b class="row" @text="item"></b></template>
      <template @if="show"><i class="shown">shown</i></template>
    </main>`;
    const first = await helium.mount('#page', { items: [1, 2], show: true });
    await tick();
    expect(document.querySelectorAll('.row').length).toBe(2);
    expect(document.querySelector('.row').hasAttribute('data-helium-generated')).toBe(true);

    // Simulate Turbo restoring a snapshot: a clone of the rendered page.
    const snapshot = document.querySelector('#page').cloneNode(true);
    first.unmount();
    document.querySelector('#page').replaceWith(snapshot);
    expect(document.querySelectorAll('.row').length).toBe(2);

    const second = await helium.mount('#page', { items: [1, 2, 3], show: true });
    await tick();
    expect([...document.querySelectorAll('.row')].map(row => row.textContent)).toEqual(['1', '2', '3']);
    expect(document.querySelectorAll('.shown').length).toBe(1);
    second.unmount();
  });

  it('removes rows for lists that read no state when torn down', async () => {
    document.body.innerHTML = `<main id="page">
      <template @for="item in [1, 2]" :key="item"><b class="row" @text="item"></b></template>
    </main>`;
    const app = createHelium({ root: '#page' });
    await app.helium({});
    await tick();
    expect(document.querySelectorAll('.row').length).toBe(2);
    app.heliumTeardown();
    expect(document.querySelectorAll('.row').length).toBe(0);
  });

  it('leaves a nested live root to its own instance', async () => {
    document.body.innerHTML = `<main id="outer" @data="{ label: 'outer' }">
      <span id="outer-label" @text="label"></span>
      <aside id="inner"><span id="inner-label" @text="label"></span><button @click="label = 'clicked'">x</button></aside>
    </main>`;
    const inner = createHelium({ root: '#inner' });
    await inner.helium({ label: 'inner' });
    const outer = createHelium({ root: '#outer' });
    const outerState = await outer.helium({});
    await tick();
    expect(document.querySelector('#outer-label').textContent).toBe('outer');
    expect(document.querySelector('#inner-label').textContent).toBe('inner');
    document.querySelector('#inner button').click();
    await tick();
    expect(document.querySelector('#inner-label').textContent).toBe('clicked');
    expect(outerState.label).toBe('outer');
    outer.heliumTeardown();
    inner.heliumTeardown();
  });
});

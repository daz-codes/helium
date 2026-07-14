import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { helium, heliumTeardown } from './helium-lite.js';

// State changes are batched and applied on a microtask.
const tick = () => new Promise(r => setTimeout(r, 0));

describe('Helium Lite', () => {
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

  describe('Default State Values', () => {
    it('should initialize state from @text element content', async () => {
      container.innerHTML = '<span @text="name">John</span>';
      const state = await helium();
      expect(state.name).toBe('John');
    });

    it('should initialize state from @bind input value', async () => {
      container.innerHTML = '<input @bind="email" value="test@example.com" />';
      const state = await helium();
      expect(state.email).toBe('test@example.com');
    });

    it('should initialize numeric state from @text', async () => {
      container.innerHTML = '<span @text="count">42</span>';
      const state = await helium();
      expect(state.count).toBe(42);
    });

    it('should not override initial state with defaults', async () => {
      container.innerHTML = '<span @text="name">Default</span>';
      const state = await helium({ name: 'Custom' });
      expect(state.name).toBe('Custom');
    });

    it('should initialize checkbox state from checked attribute', async () => {
      container.innerHTML = '<input type="checkbox" @bind="agreed" checked />';
      const state = await helium();
      expect(state.agreed).toBe(true);
    });
  });

  describe('Basic Reactivity', () => {
    it('should update text on state change', async () => {
      container.innerHTML = '<div @text="message"></div>';
      const state = await helium({ message: 'Hello' });
      expect(container.querySelector('div').textContent).toBe('Hello');

      state.message = 'World';
      await new Promise(r => setTimeout(r, 0));
      expect(container.querySelector('div').textContent).toBe('World');
    });

    it('should reconcile data-he-* directives on retained elements', async () => {
      container.innerHTML = '<button></button><span></span>';
      const state = await helium({ count: 0, other: 10 });
      const button = container.querySelector('button');
      const span = container.querySelector('span');

      button.setAttribute('data-he-click', 'count++');
      span.setAttribute('data-he-text', 'count');
      await tick();
      button.click();
      await tick();
      expect(span.textContent).toBe('1');

      button.setAttribute('data-he-click', 'other++');
      span.setAttribute('data-he-text', 'other');
      await tick();
      button.click();
      await tick();
      expect(state.count).toBe(1);
      expect(span.textContent).toBe('11');

      button.removeAttribute('data-he-click');
      span.removeAttribute('data-he-text');
      await tick();
      button.click();
      state.other = 12;
      await tick();
      expect(span.textContent).toBe('11');
    });

    it('should ignore stale state mutations after re-initialization', async () => {
      container.innerHTML = '<div @text="count"></div>';
      const first = await helium({ count: 1 });
      const second = await helium({ count: 10 });

      first.count = 99;

      expect(second.count).toBe(10);
      expect(container.querySelector('div').textContent).toBe('10');
    });

    it('should not proxy Date instances', async () => {
      container.innerHTML = '<div @text="when.getUTCFullYear()"></div>';
      const when = new Date('2020-01-01T00:00:00Z');
      const state = await helium({ when });

      expect(state.when).toBe(when);
      expect(container.querySelector('div').textContent).toBe('2020');
    });

    it('should propagate deeply nested mutations through the shared core', async () => {
      container.innerHTML = '<div @text="user.address.city"></div>';
      const state = await helium({ user: { address: { city: 'London' } } });

      state.user.address.city = 'Bristol';
      await tick();
      expect(container.querySelector('div').textContent).toBe('Bristol');
    });

    it('should update bindings through shared object references', async () => {
      container.innerHTML = '<span @text="a.name"></span><span @text="b.name"></span>';
      const shared = { name: 'Before' };
      const state = await helium({ a: shared, b: shared });

      state.a.name = 'After';
      await tick();
      expect([...container.querySelectorAll('span')].map(el => el.textContent)).toEqual(['After', 'After']);
    });

    it('should support independent explicit mounts', async () => {
      container.innerHTML = '<section id="a"><span @text="count"></span></section><section id="b"><span @text="count"></span></section>';
      const a = await helium.mount('#a', { count: 1 });
      const b = await helium.mount('#b', { count: 2 });

      a.state.count = 3;
      await tick();
      expect(container.querySelector('#a span').textContent).toBe('3');
      expect(container.querySelector('#b span').textContent).toBe('2');

      a.unmount();
      a.unmount();
      b.unmount();
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

    it('should handle @bind two-way binding', async () => {
      container.innerHTML = '<input @bind="name" /><span @text="name"></span>';
      const state = await helium({ name: 'John' });

      const input = container.querySelector('input');
      expect(input.value).toBe('John');

      input.value = 'Jane';
      input.dispatchEvent(new Event('input'));
      await new Promise(r => setTimeout(r, 0));

      expect(state.name).toBe('Jane');
      expect(container.querySelector('span').textContent).toBe('Jane');
    });

    it('should support combined @bind.lazy.trim.number modifiers', async () => {
      container.innerHTML = '<input @bind.lazy.trim.number="amount" />';
      const state = await helium({ amount: 0 });
      const input = container.querySelector('input');

      input.value = ' 42 ';
      input.dispatchEvent(new Event('input'));
      expect(state.amount).toBe(0);
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

    it('should keep plain malformed strings quiet but warn for expression-like compile failures', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      container.innerHTML = `
        <span id="literal" @text="Loading..."></span>
        <span id="broken" @text="user.name."></span>
      `;
      await helium({});

      expect(container.querySelector('#literal').textContent).toBe('Loading...');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('lite');
      expect(warnSpy.mock.calls[0][0]).toContain('@text');
      expect(warnSpy.mock.calls[0][1]).toBe('user.name.');
      warnSpy.mockRestore();
    });

    it('should keep one global state namespace for nested @data markup', async () => {
      container.innerHTML = `
        <div @data="{ count: 1 }"><button @click="count++"></button><span @text="count"></span></div>
        <div @data="{ count: 8 }"><span @text="count"></span></div>
      `;
      const state = await helium({ count: 20 });

      container.querySelector('button').click();
      await tick();

      expect([...container.querySelectorAll('span')].map(el => el.textContent)).toEqual(['9', '9']);
      expect(state.count).toBe(9);
    });

    it('should ignore @if and @for templates without registering listeners', async () => {
      container.innerHTML = `
        <template @if="show"><p>conditional</p></template>
        <template @for="item in items"><li></li></template>
        <span @text="count"></span>
      `;
      const state = await helium({ show: true, items: [{ id: 1 }], count: 5 });
      await new Promise(r => setTimeout(r, 0));

      expect(container.querySelector('p')).toBeNull();
      expect(container.querySelector('li')).toBeNull();
      expect(container.querySelector('span').textContent).toBe('5');
      state.show = false; // toggling must not throw on stale structural bindings
    });
  });

  describe('Events', () => {
    it('should handle click events', async () => {
      container.innerHTML = '<button @click="count++">Click</button><span @text="count"></span>';
      const state = await helium({ count: 0 });

      container.querySelector('button').click();
      await new Promise(r => setTimeout(r, 0));
      expect(state.count).toBe(1);
    });

    it('@keydown.enter.prevent should fire only on Enter (key mod before a flag mod)', async () => {
      container.innerHTML = '<input @keydown.enter.prevent="count++">';
      const state = await helium({ count: 0 });
      const input = container.querySelector('input');

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      await new Promise(r => setTimeout(r, 0));
      expect(state.count).toBe(0);

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise(r => setTimeout(r, 0));
      expect(state.count).toBe(1);
    });

    it('should match the key modifier regardless of order (.prevent.enter)', async () => {
      container.innerHTML = '<input @keydown.prevent.enter="count++">';
      const state = await helium({ count: 0 });
      const input = container.querySelector('input');

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
      await new Promise(r => setTimeout(r, 0));
      expect(state.count).toBe(0);

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise(r => setTimeout(r, 0));
      expect(state.count).toBe(1);
    });

    it('outside.once should only be consumed by an outside event', async () => {
      container.innerHTML = '<div id="inside" @click.outside.once="count++"></div><button id="outside"></button>';
      const state = await helium({ count: 0 });

      container.querySelector('#inside').click();
      container.querySelector('#outside').click();
      container.querySelector('#outside').click();

      expect(state.count).toBe(1);
    });

    it('should support dispatch, window, self, and throttle event behavior', async () => {
      container.innerHTML = `
        <div @notice="received = $event.detail.value">
          <button id="dispatch" @click="$dispatch('notice', { value: 4 })"></button>
        </div>
        <div @resize.window="windowCount++"></div>
        <div id="self" @mousedown.self="selfCount++"><i></i></div>
        <button id="throttle" @click.throttle:40="throttled++"></button>
      `;
      const state = await helium({ received: 0, windowCount: 0, selfCount: 0, throttled: 0 });

      container.querySelector('#dispatch').click();
      window.dispatchEvent(new Event('resize'));
      container.querySelector('#self i').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      const throttled = container.querySelector('#throttle');
      throttled.click();
      throttled.click();

      expect(state.received).toBe(4);
      expect(state.windowCount).toBe(1);
      expect(state.selfCount).toBe(0);
      expect(state.throttled).toBe(1);
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(state.throttled).toBe(2);
    });
  });

  describe('@calculate', () => {
    it('should create computed properties', async () => {
      container.innerHTML = '<div @calculate:double="count * 2"></div><span @text="double"></span>';
      const state = await helium({ count: 5 });
      expect(container.querySelector('span').textContent).toBe('10');
    });
  });

  describe('@ref', () => {
    it('should create element references', async () => {
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

    it('should expose plural refs and root-scoped query helpers', async () => {
      const capture = vi.fn();
      container.innerHTML = `
        <span id="first" class="item" @ref="hello"></span>
        <span id="second" class="item" @ref="hello"></span>
        <button @click="capture($root, $scope, $hello, $refs.hello, $.scope.all('.item'))"></button>
      `;
      await helium({ capture });

      container.querySelector('button').click();

      expect(capture).toHaveBeenCalledWith(container, container, container.querySelector('#first'), [
        container.querySelector('#first'), container.querySelector('#second')
      ], [...container.querySelectorAll('.item')]);
    });
  });

  describe('@init', () => {
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

    it('should run cleanup when Helium is torn down', async () => {
      const cleanup = vi.fn();
      container.innerHTML = '<div @init="start()"></div>';
      await helium({ start: () => cleanup });

      heliumTeardown();

      expect(cleanup).toHaveBeenCalledOnce();
    });

    it('should stop updating bindings after their element is removed', async () => {
      container.innerHTML = '<div @text="message"></div>';
      const state = await helium({ message: 'attached' });
      const element = container.firstElementChild;

      element.remove();
      await new Promise(r => setTimeout(r, 0));
      state.message = 'detached';

      expect(element.textContent).toBe('attached');
    });
  });

  describe('data-he-data alias', () => {
    it('should initialize state from data-he-data', async () => {
      container.innerHTML = '<div data-he-data="{ count: 3 }"><span @text="count"></span></div>';
      const state = await helium();
      expect(state.count).toBe(3);
      expect(container.querySelector('span').textContent).toBe('3');
    });
  });

  describe('Dynamic Attributes', () => {
    it('should bind :class', async () => {
      container.innerHTML = '<div :class="className"></div>';
      await helium({ className: 'active' });
      expect(container.querySelector('div').getAttribute('class')).toBe('active');
    });

    it('should not execute a bound string value when coercing attributes', async () => {
      // Regression: a bound value that happens to look like code must be set as a
      // literal string, never evaluated (the old Function()-based coercion ran it).
      window.__heLitePwned = false;
      container.innerHTML = '<div :title="payload"></div>';
      await helium({ payload: 'window.__heLitePwned = true' });
      expect(container.querySelector('div').getAttribute('title')).toBe('window.__heLitePwned = true');
      expect(window.__heLitePwned).toBe(false);
      delete window.__heLitePwned;
    });

    it('should keep an arithmetic-looking string literal intact', async () => {
      container.innerHTML = '<div :title="expr"></div>';
      await helium({ expr: '1 + 1' });
      expect(container.querySelector('div').getAttribute('title')).toBe('1 + 1');
    });

    it('should handle :class with object syntax', async () => {
      container.innerHTML = '<div :class="{ active: isActive }"></div>';
      await helium({ isActive: true });
      expect(container.querySelector('div').classList.contains('active')).toBe(true);
    });

    it('should remove stale object-form classes and keep static classes', async () => {
      container.innerHTML = '<div class="base" :class="classes"></div>';
      const state = await helium({ classes: { active: true, stale: true } });
      const element = container.querySelector('div');

      state.classes = { current: true };
      await tick();

      expect(element.classList.contains('base')).toBe(true);
      expect(element.classList.contains('active')).toBe(false);
      expect(element.classList.contains('stale')).toBe(false);
      expect(element.classList.contains('current')).toBe(true);
    });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { helium, heliumTeardown } from './helium-lite.js';

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

    it('should support independent explicit mounts', async () => {
      container.innerHTML = '<section id="a"><span @text="count"></span></section><section id="b"><span @text="count"></span></section>';
      const a = await helium.mount('#a', { count: 1 });
      const b = await helium.mount('#b', { count: 2 });

      a.state.count = 3;
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
      expect(container.querySelector('div').textContent).toBe('updated B');

      state.show = true;
      state.a = 'updated A';
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

      expect(element.classList.contains('base')).toBe(true);
      expect(element.classList.contains('active')).toBe(false);
      expect(element.classList.contains('stale')).toBe(false);
      expect(element.classList.contains('current')).toBe(true);
    });
  });
});

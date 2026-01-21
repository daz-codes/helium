import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hydrogen, hydrogenTeardown, evaluate, preprocess } from './hydrogen.js';

describe('Hydrogen - CSP-Safe Reactive Library', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    container.setAttribute('data-helium', '');
    document.body.appendChild(container);
  });

  afterEach(() => {
    hydrogenTeardown();
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
  });

  describe('DOM Integration', () => {
    it('should bind text content with @text', async () => {
      container.innerHTML = '<div @text="message"></div>';
      await hydrogen({ message: 'Hello World' });
      expect(container.querySelector('div').textContent).toBe('Hello World');
    });

    it('should initialize state with @data', async () => {
      container.innerHTML = '<div @data="{ count: 42 }"><span @text="count"></span></div>';
      await hydrogen({});
      expect(container.querySelector('span').textContent).toBe('42');
    });

    it('should handle @hidden directive', async () => {
      container.innerHTML = '<div @hidden="isHidden">Hidden content</div>';
      await hydrogen({ isHidden: true });
      expect(container.querySelector('div').hidden).toBe(true);
    });

    it('should handle @visible directive', async () => {
      container.innerHTML = '<div @visible="isVisible">Visible content</div>';
      await hydrogen({ isVisible: false });
      expect(container.querySelector('div').hidden).toBe(true);
    });

    it('should handle two-way binding with @bind', async () => {
      container.innerHTML = '<input @bind="name"><span @text="name"></span>';
      const state = await hydrogen({ name: 'Alice' });
      const input = container.querySelector('input');

      expect(input.value).toBe('Alice');

      // Simulate user input
      input.value = 'Bob';
      input.dispatchEvent(new Event('input'));

      expect(state.name).toBe('Bob');
    });

    it('should handle click events', async () => {
      container.innerHTML = '<button @click="count++">Click</button><span @text="count"></span>';
      const state = await hydrogen({ count: 0 });

      container.querySelector('button').click();

      // Need to wait for reactive update
      await new Promise(r => setTimeout(r, 0));
      expect(state.count).toBe(1);
    });

    it('should handle dynamic attributes with :attr', async () => {
      container.innerHTML = '<div :class="isActive ? \'active\' : \'inactive\'"></div>';
      await hydrogen({ isActive: true });
      expect(container.querySelector('div').getAttribute('class')).toBe('active');
    });

    it('should handle @ref directive', async () => {
      container.innerHTML = '<input @ref="myInput"><button @click="$myInput.value = \'test\'">Set</button>';
      await hydrogen({});

      container.querySelector('button').click();
      expect(container.querySelector('input').value).toBe('test');
    });

    it('should handle @init directive', async () => {
      container.innerHTML = '<div @init="initialized = true"></div>';
      const state = await hydrogen({ initialized: false });
      expect(state.initialized).toBe(true);
    });

    it('should handle keyboard events with modifiers', async () => {
      container.innerHTML = '<input @keydown.enter="pressed = true">';
      const state = await hydrogen({ pressed: false });

      const input = container.querySelector('input');
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      input.dispatchEvent(event);

      expect(state.pressed).toBe(true);
    });

    it('should handle expressions in @text', async () => {
      container.innerHTML = '<span @text="count * 2"></span>';
      await hydrogen({ count: 5 });
      expect(container.querySelector('span').textContent).toBe('10');
    });

    it('should handle ternary in @text', async () => {
      container.innerHTML = '<span @text="count > 5 ? \'big\' : \'small\'"></span>';
      await hydrogen({ count: 3 });
      expect(container.querySelector('span').textContent).toBe('small');
    });
  });

  describe('Reactivity', () => {
    it('should update DOM when state changes', async () => {
      container.innerHTML = '<span @text="count"></span>';
      const state = await hydrogen({ count: 0 });

      state.count = 10;
      await new Promise(r => setTimeout(r, 0));

      expect(container.querySelector('span').textContent).toBe('10');
    });

    it('should update DOM on nested property change', async () => {
      container.innerHTML = '<span @text="user.name"></span>';
      const state = await hydrogen({ user: { name: 'Alice' } });

      state.user.name = 'Bob';
      await new Promise(r => setTimeout(r, 0));

      expect(container.querySelector('span').textContent).toBe('Bob');
    });
  });
});

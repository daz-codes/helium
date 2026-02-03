import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  });

  describe('Events', () => {
    it('should handle click events', async () => {
      container.innerHTML = '<button @click="count++">Click</button><span @text="count"></span>';
      const state = await helium({ count: 0 });

      container.querySelector('button').click();
      await new Promise(r => setTimeout(r, 0));
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
  });

  describe('Dynamic Attributes', () => {
    it('should bind :class', async () => {
      container.innerHTML = '<div :class="className"></div>';
      await helium({ className: 'active' });
      expect(container.querySelector('div').getAttribute('class')).toBe('active');
    });

    it('should handle :class with object syntax', async () => {
      container.innerHTML = '<div :class="{ active: isActive }"></div>';
      await helium({ isActive: true });
      expect(container.querySelector('div').classList.contains('active')).toBe(true);
    });
  });
});

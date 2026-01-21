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
    document.body.innerHTML = '';
  });

  describe('State Reactivity', () => {
    it('should initialize with default data', async () => {
      container.innerHTML = '<div @text="count"></div>';
      await helium({ count: 5 });
      expect(container.querySelector('div').textContent).toBe('5');
    });

    it('should react to direct property assignment', (done) => {
      container.innerHTML = '<div @text="count"></div>';
      const state = helium({ count: 0 });
      
      setTimeout(() => {
        state.count = 10;
        setTimeout(() => {
          expect(container.querySelector('div').textContent).toBe('10');
          done();
        }, 0);
      }, 0);
    });

    it('should react to nested object mutations', (done) => {
      container.innerHTML = '<div @text="user.name"></div>';
      const state = helium({ user: { name: 'Alice' } });
      
      setTimeout(() => {
        state.user.name = 'Bob';
        setTimeout(() => {
          expect(container.querySelector('div').textContent).toBe('Bob');
          done();
        }, 0);
      }, 0);
    });

    it('should react to array push', (done) => {
      container.innerHTML = '<div @text="items.length"></div>';
      const state = helium({ items: [1, 2, 3] });
      
      setTimeout(() => {
        state.items.push(4);
        setTimeout(() => {
          expect(container.querySelector('div').textContent).toBe('4');
          done();
        }, 0);
      }, 0);
    });

    it('should react to array index assignment', (done) => {
      container.innerHTML = '<div @text="items[0]"></div>';
      const state = helium({ items: ['a', 'b', 'c'] });
      
      setTimeout(() => {
        state.items[0] = 'z';
        setTimeout(() => {
          expect(container.querySelector('div').textContent).toBe('z');
          done();
        }, 0);
      }, 0);
    });

    it('should react to complete array replacement', (done) => {
      container.innerHTML = '<div @text="items.length"></div>';
      const state = helium({ items: [1, 2, 3] });
      
      setTimeout(() => {
        state.items = [...state.items, 4, 5];
        setTimeout(() => {
          expect(container.querySelector('div').textContent).toBe('5');
          done();
        }, 0);
      }, 0);
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
    it('should create two-way binding with input', () => {
      container.innerHTML = '<input @bind="name" />';
      const state = helium({ name: 'John' });
      const input = container.querySelector('input');
      
      expect(input.value).toBe('John');
    });

    it('should update state when input changes', (done) => {
      container.innerHTML = '<input @bind="name" /><span @text="name"></span>';
      const state = helium({ name: 'John' });
      const input = container.querySelector('input');
      
      input.value = 'Jane';
      input.dispatchEvent(new Event('input'));
      
      setTimeout(() => {
        expect(container.querySelector('span').textContent).toBe('Jane');
        done();
      }, 0);
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

    it('should update attribute on state change', (done) => {
      container.innerHTML = '<div :title="tooltip"></div>';
      const state = helium({ tooltip: 'Initial' });
      
      setTimeout(() => {
        state.tooltip = 'Updated';
        setTimeout(() => {
          expect(container.querySelector('div').getAttribute('title')).toBe('Updated');
          done();
        }, 0);
      }, 0);
    });
  });

  describe('Event Handlers', () => {
    it('should handle click events', () => {
      container.innerHTML = '<button @click="count++">Click</button><span @text="count"></span>';
      helium({ count: 0 });
      
      container.querySelector('button').click();
      setTimeout(() => {
        expect(container.querySelector('span').textContent).toBe('1');
      }, 0);
    });

    it('should handle event with prevent modifier', () => {
      container.innerHTML = '<form @submit.prevent="submitted = true"></form>';
      const state = helium({ submitted: false });
      const form = container.querySelector('form');
      const event = new Event('submit', { cancelable: true });
      
      form.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it('should handle keyboard events with key modifiers', () => {
      container.innerHTML = '<input @keydown.enter="pressed = true" />';
      const state = helium({ pressed: false });
      const input = container.querySelector('input');
      
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      input.dispatchEvent(event);
      
      setTimeout(() => {
        expect(state.pressed).toBe(true);
      }, 0);
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

    it('should handle once modifier', () => {
      container.innerHTML = '<button @click.once="count++">Click</button>';
      const state = helium({ count: 0 });
      const button = container.querySelector('button');
      
      button.click();
      button.click();
      button.click();
      
      setTimeout(() => {
        expect(state.count).toBe(1);
      }, 0);
    });
  });

  describe('@ref Directive', () => {
    it('should create reference to element', () => {
      container.innerHTML = '<div @ref="myDiv"></div><button @click="$myDiv.textContent = \'Changed\'">Change</button>';
      helium({});
      
      container.querySelector('button').click();
      setTimeout(() => {
        expect(container.querySelector('div').textContent).toBe('Changed');
      }, 0);
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
    it('should provide $ selector helper', () => {
      container.innerHTML = '<div id="target"></div><button @click="$(\'#target\').textContent = \'Found\'">Click</button>';
      helium({});
      
      container.querySelector('button').click();
      setTimeout(() => {
        expect(container.querySelector('#target').textContent).toBe('Found');
      }, 0);
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
      helium({ result: null });
      
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
      helium({ response: null });
      
      container.querySelector('button').click();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(global.fetch).toHaveBeenCalledWith('/api/save', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'test' })
      }));
    });
  });

  describe('Dynamic DOM Updates', () => {
    it('should process dynamically added elements', (done) => {
      container.innerHTML = '<div id="container"></div>';
      const state = helium({ message: 'Dynamic' });
      
      setTimeout(() => {
        const newEl = document.createElement('span');
        newEl.setAttribute('@text', 'message');
        container.querySelector('#container').appendChild(newEl);
        
        setTimeout(() => {
          expect(newEl.textContent).toBe('Dynamic');
          done();
        }, 100);
      }, 0);
    });

    it('should handle innerHTML updates with new bindings', (done) => {
      container.innerHTML = '<div @html="content"></div>';
      const state = helium({ content: '', name: 'Test' });
      
      setTimeout(() => {
        state.content = '<span @text="name"></span>';
        setTimeout(() => {
          expect(container.querySelector('span').textContent).toBe('Test');
          done();
        }, 100);
      }, 0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined state values', async () => {
      container.innerHTML = '<div @text="undefined"></div>';
      await helium({});
      expect(container.querySelector('div').textContent).toBe('undefined');
    });

    it('should handle null state values', async () => {
      container.innerHTML = '<div @text="value"></div>';
      await helium({ value: null });
      expect(container.querySelector('div').textContent).toBe('null');
    });

    it('should handle circular references in state', () => {
      const obj = { name: 'test' };
      obj.self = obj;
      
      container.innerHTML = '<div @text="obj.name"></div>';
      expect(() => helium({ obj })).not.toThrow();
    });

    it('should not process already processed elements', () => {
      container.innerHTML = '<div @text="count"></div>';
      const state = helium({ count: 0 });
      
      // Manually mark as processed
      container.querySelector('div').setAttribute('data-helium-processed', '');
      
      state.count = 5;
      // Should still work because binding was already created
      setTimeout(() => {
        expect(container.querySelector('div').textContent).toBe('5');
      }, 0);
    });
  });

  describe('Performance', () => {
    it('should handle many bindings efficiently', () => {
      const html = Array.from({ length: 100 }, (_, i) => 
        `<div @text="items[${i}]"></div>`
      ).join('');
      
      container.innerHTML = html;
      const items = Array.from({ length: 100 }, (_, i) => i);
      
      const start = performance.now();
      helium({ items });
      const end = performance.now();
      
      expect(end - start).toBeLessThan(100); // Should initialize in < 100ms
    });

    it('should not cause infinite loops with DOM mutations', (done) => {
      container.innerHTML = '<div @html="content"></div>';
      const state = helium({ content: '<span>Test</span>', updateCount: 0 });
      
      let mutationCount = 0;
      const observer = new MutationObserver(() => {
        mutationCount++;
      });
      observer.observe(container, { childList: true, subtree: true });
      
      setTimeout(() => {
        state.content = '<span>Updated</span>';
        setTimeout(() => {
          expect(mutationCount).toBeLessThan(10); // Should not cause excessive mutations
          observer.disconnect();
          done();
        }, 100);
      }, 0);
    });
  });
});

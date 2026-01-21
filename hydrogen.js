/**
 * Hydrogen - CSP-safe reactive library
 * A variant of Helium that works without unsafe-eval
 */

import { parse, EvalAstFactory } from 'jexpr';

const astFactory = new EvalAstFactory();

// Pre-process expressions to handle ++ and -- operators
// Transforms: count++ -> (count = count + 1) - 1  (returns old value)
// Transforms: ++count -> (count = count + 1)      (returns new value)
// Transforms: count-- -> (count = count - 1) + 1  (returns old value)
// Transforms: --count -> (count = count - 1)      (returns new value)
const preprocess = (expr) => {
  return expr
    // Postfix: identifier++ or identifier.property++ or identifier[index]++
    .replace(/(\$?\w+(?:\.\w+|\[\w+\])*)(\+\+)/g, '($1 = $1 + 1) - 1')
    .replace(/(\$?\w+(?:\.\w+|\[\w+\])*)(\-\-)/g, '($1 = $1 - 1) + 1')
    // Prefix: ++identifier or ++identifier.property
    .replace(/\+\+(\$?\w+(?:\.\w+|\[\w+\])*)/g, '($1 = $1 + 1)')
    .replace(/\-\-(\$?\w+(?:\.\w+|\[\w+\])*)/g, '($1 = $1 - 1)');
};

// Compile an expression to an AST (cached)
const cache = new Map();
const compile = (expr) => {
  const processed = preprocess(expr.trim());
  if (cache.has(processed)) return cache.get(processed);
  try {
    const ast = parse(processed, astFactory);
    cache.set(processed, ast);
    return ast;
  } catch (e) {
    console.error(`Failed to parse: "${expr}"`, e.message);
    return null;
  }
};

// Evaluate an expression with a scope
const evaluate = (expr, scope) => {
  const ast = compile(expr);
  if (!ast) return undefined;
  try {
    return ast.evaluate(scope);
  } catch (e) {
    console.error(`Failed to evaluate: "${expr}"`, e.message);
    return undefined;
  }
};

// Simple test
const testExpressions = () => {
  console.log('Testing Hydrogen expression parser...\n');

  // Create a reactive scope
  const scope = {
    count: 0,
    name: 'World',
    user: { firstName: 'John', lastName: 'Doe' },
    items: [1, 2, 3],
    isActive: true,
    greet: (name) => `Hello, ${name}!`,
    add: (a, b) => a + b,
  };

  const tests = [
    // Property access
    ['count', 0],
    ['name', 'World'],
    ['user.firstName', 'John'],
    ['items[0]', 1],
    ['items[1]', 2],

    // Arithmetic
    ['count + 1', 1],
    ['2 * 3', 6],
    ['10 / 2', 5],
    ['10 % 3', 1],

    // Comparisons
    ['count === 0', true],
    ['count > 5', false],
    ['count < 5', true],

    // Boolean
    ['!isActive', false],
    ['isActive && true', true],
    ['false || true', true],

    // Ternary
    ['count > 5 ? "big" : "small"', 'small'],
    ['isActive ? "yes" : "no"', 'yes'],

    // Function calls
    ['greet(name)', 'Hello, World!'],
    ['add(2, 3)', 5],
    ['items.length', 3],

    // Assignment
    ['count = 5', 5],
    ['count', 5],  // verify it changed

    // Increment (our patched support!)
    ['count++', 5],  // returns old value
    ['count', 6],    // verify it incremented
    ['++count', 7],  // returns new value
    ['count', 7],    // verify it incremented

    // Decrement
    ['count--', 7],  // returns old value
    ['count', 6],    // verify it decremented
    ['--count', 5],  // returns new value
    ['count', 5],    // verify it decremented

    // Null safety
    ['user.address', undefined],
    ['user.address?.city', undefined],

    // Literals
    ['42', 42],
    ['"hello"', 'hello'],
    ['true', true],
    ['null', null],
    ['[1, 2, 3]', [1, 2, 3]],
    ['{ a: 1, b: 2 }', { a: 1, b: 2 }],
  ];

  let passed = 0;
  let failed = 0;

  for (const [expr, expected] of tests) {
    const result = evaluate(expr, scope);
    const isEqual = JSON.stringify(result) === JSON.stringify(expected);

    if (isEqual) {
      console.log(`✓ ${expr} = ${JSON.stringify(result)}`);
      passed++;
    } else {
      console.log(`✗ ${expr}`);
      console.log(`  Expected: ${JSON.stringify(expected)}`);
      console.log(`  Got:      ${JSON.stringify(result)}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0;
};

// ============================================
// Hydrogen DOM Integration (Helium-compatible)
// ============================================

let HYDROGEN = null;

async function hydrogen(initialState = {}) {
  const root = document.querySelector("[\\@helium]") || document.querySelector("[data-helium]") || document.body;

  if (!HYDROGEN) {
    HYDROGEN = {
      observer: null,
      bindings: new Map(),
      refs: new Map(),
      listeners: new WeakMap(),
      processed: new WeakSet(),
    };
  }

  // Create reactive state with Proxy
  const proxyCache = new WeakMap();
  const parentKeys = new WeakMap();

  const handler = {
    get(t, p, r) {
      const v = Reflect.get(t, p, r);
      if (v && typeof v === "object") {
        if (proxyCache.has(v)) return proxyCache.get(v);
        const proxy = new Proxy(v, handler);
        proxyCache.set(v, proxy);
        parentKeys.set(v, p);
        return proxy;
      }
      return v;
    },
    set(t, p, v) {
      const res = Reflect.set(t, p, v);
      // Trigger bindings for this property
      HYDROGEN.bindings.get(p)?.forEach(applyBinding);
      // Also trigger parent object's bindings (for nested updates like user.name)
      const parentKey = parentKeys.get(t);
      if (parentKey) {
        HYDROGEN.bindings.get(parentKey)?.forEach(applyBinding);
      }
      return res;
    }
  };

  const state = new Proxy({}, handler);
  Object.assign(state, initialState);

  // Create scope with magic variables
  const createScope = (el, event = {}) => {
    const scope = Object.create(state);
    scope.$el = el;
    scope.$event = event;
    scope.$data = state;
    scope.$ = s => document.querySelector(s);
    scope.$html = s => Object.assign(document.createElement("template"), { innerHTML: s.trim() }).content.firstChild;
    // Add refs
    for (const [name, element] of HYDROGEN.refs) {
      scope[name] = element;
    }
    return scope;
  };

  function applyBinding(b) {
    const { el, prop, expr, isHiddenAttr } = b;
    const scope = createScope(el);
    let result = evaluate(expr, scope);

    if (prop === "textContent") {
      el.textContent = result == null ? String(result) : result;
    } else if (prop === "innerHTML") {
      el.innerHTML = Array.isArray(result) ? result.join('') : result;
    } else if (prop === "hidden") {
      // @hidden="x" -> hide when x is truthy
      // @visible="x" -> hide when x is falsy (invert)
      el.hidden = isHiddenAttr ? !!result : !result;
    } else if (prop in el) {
      el[prop] = result;
    } else {
      el.setAttribute(prop, result);
    }
  }

  // Check if attribute is a Helium/Hydrogen attribute
  const isHeAttr = (name) => name.startsWith('@') || name.startsWith(':') || name.startsWith('data-he');
  const heMatch = (name, ...attrs) => {
    const prefix = name.split(/[.:]/)[0];
    return attrs.some(a => prefix === `@${a}` || prefix === `data-he-${a}`);
  };

  function processElements(root) {
    const elements = [root, ...root.querySelectorAll("*")].filter(el => {
      if (HYDROGEN.processed.has(el)) return false;
      return [...el.attributes].some(a => isHeAttr(a.name));
    });

    elements.forEach(el => {
      HYDROGEN.processed.add(el);

      for (const { name, value } of el.attributes) {
        if (!isHeAttr(name)) continue;

        // @data - initialize state
        if (name === "@data" || name === "data-he") {
          const data = evaluate(value, {});
          Object.assign(state, data);
        }
        // @ref - element reference
        else if (heMatch(name, "ref")) {
          HYDROGEN.refs.set("$" + value, el);
        }
        // @text - text binding
        else if (heMatch(name, "text")) {
          const b = { el, prop: "textContent", expr: value };
          trackAndBind(b, value);
        }
        // @html - html binding
        else if (heMatch(name, "html")) {
          const b = { el, prop: "innerHTML", expr: value };
          trackAndBind(b, value);
        }
        // @hidden / @visible
        else if (heMatch(name, "hidden", "visible")) {
          const isHidden = heMatch(name, "hidden");
          // Just evaluate the value, apply logic in applyBinding
          const b = { el, prop: "hidden", expr: value, isHiddenAttr: isHidden };
          trackAndBind(b, value);
        }
        // @bind - two-way binding
        else if (heMatch(name, "bind")) {
          const isCheckbox = el.type === "checkbox";
          const prop = isCheckbox ? "checked" : "value";
          const event = isCheckbox ? "change" : "input";

          // Set initial value
          if (!(value in state)) {
            state[value] = isCheckbox ? el.checked : el.value;
          } else {
            el[prop] = state[value];
          }

          // Listen for changes
          const handler = (e) => {
            state[value] = isCheckbox ? e.target.checked : e.target.value;
          };
          el.addEventListener(event, handler);
          addListener(el, el, event, handler);

          // Bind display
          const b = { el, prop, expr: value };
          addBinding(value, b);
        }
        // :attr - dynamic attributes
        else if (name.startsWith(":") || name.startsWith("data-he-attr:")) {
          const attr = name.startsWith(":") ? name.slice(1) : name.slice(13);
          const b = { el, prop: attr, expr: value };
          trackAndBind(b, value);
        }
        // @init - run once
        else if (heMatch(name, "init")) {
          const scope = createScope(el);
          evaluate(value, scope);
        }
        // Event handlers (@click, @input, etc.)
        else if (name.startsWith("@") || name.startsWith("data-he-on")) {
          const fullName = name.startsWith("@") ? name.slice(1) : name.slice(10);
          const [eventName, ...mods] = fullName.split(".");

          const handler = (e) => {
            if (mods.includes("prevent")) e.preventDefault();
            if (mods.includes("stop")) e.stopPropagation();

            // Key modifiers
            if (["keydown", "keyup", "keypress"].includes(eventName)) {
              const keyMod = mods.find(m => !["prevent", "stop", "once"].includes(m));
              if (keyMod && e.key.toLowerCase() !== keyMod.toLowerCase()) return;
            }

            const scope = createScope(el, e);
            evaluate(value, scope);
          };

          const target = mods.includes("document") ? document : el;
          const options = mods.includes("once") ? { once: true } : undefined;
          target.addEventListener(eventName, handler, options);
          addListener(el, target, eventName, handler);
        }
      }
    });
  }

  function trackAndBind(binding, expr) {
    // Get referenced identifiers from the expression
    const ast = compile(expr);
    if (!ast) return;
    const ids = ast.getIds([]);
    ids.forEach(id => addBinding(id, binding));
    applyBinding(binding);
  }

  function addBinding(key, binding) {
    if (!HYDROGEN.bindings.has(key)) {
      HYDROGEN.bindings.set(key, []);
    }
    HYDROGEN.bindings.get(key).push(binding);
  }

  function addListener(el, target, event, handler) {
    if (!HYDROGEN.listeners.has(el)) {
      HYDROGEN.listeners.set(el, []);
    }
    HYDROGEN.listeners.get(el).push({ target, event, handler });
  }

  // Process initial elements
  processElements(root);

  // Watch for new elements
  HYDROGEN.observer?.disconnect();
  HYDROGEN.observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1 && !HYDROGEN.processed.has(node)) {
          processElements(node);
        }
      }
    }
  });
  HYDROGEN.observer.observe(root, { childList: true, subtree: true });

  return state;
}

// Cleanup function
function hydrogenTeardown() {
  HYDROGEN?.observer?.disconnect();
  HYDROGEN = null;
}

// Auto-initialize
if (typeof document !== 'undefined') {
  document.addEventListener("DOMContentLoaded", () => hydrogen());
}

// Export for use
export { compile, evaluate, preprocess, testExpressions, hydrogen, hydrogenTeardown };
export default hydrogen;

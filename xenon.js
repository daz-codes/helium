/**
 * Xenon - CSP-safe reactive library
 * A variant of Helium that works without unsafe-eval
 */

import { parse, EvalAstFactory } from './jexpr.js';

const astFactory = new EvalAstFactory();
const parseEx = v => {
  if (typeof v !== 'string') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (v === 'undefined') return undefined;
  const n = +v;
  return !isNaN(n) && v.trim() !== '' ? n : v;
};
const debounce = (f, d) => { let t; return (...a) => (clearTimeout(t), t = setTimeout(f, d, ...a)); };
const isValidIdentifier = v => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(v);
const RESERVED = new Set(['undefined', 'null', 'true', 'false', 'NaN', 'Infinity', 'this', 'arguments']);
const INPUT_EVENTS = { form: "submit", input: "input", textarea: "input", select: "change" };
const getEvent = el => INPUT_EVENTS[el.tagName.toLowerCase()] || "click";

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

// ============================================
// Xenon DOM Integration (Helium-compatible)
// ============================================

let XENON = null;
const ALL = Symbol("all");

async function xenon(initialState = {}) {
  const root = document.querySelector("[\\@helium]") || document.querySelector("[data-helium]") || document.body;

  if (!XENON) {
    XENON = {
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
      XENON.bindings.get(p)?.forEach(applyBinding);
      // Also trigger parent object's bindings (for nested updates like user.name)
      const parentKey = parentKeys.get(t);
      if (parentKey) {
        XENON.bindings.get(parentKey)?.forEach(applyBinding);
      }
      // Trigger wildcard effects (@effect:*)
      XENON.bindings.get(ALL)?.forEach(applyBinding);
      return res;
    }
  };

  const state = new Proxy({}, handler);
  Object.assign(state, initialState);

  // DOM helpers
  const $ = s => document.querySelector(s);
  const html = s => Object.assign(document.createElement("template"), { innerHTML: s.trim() }).content.firstChild;

  // Update helper for AJAX responses
  const update = (data, targets, actions, template) => {
    const newTargets = [];
    targets.forEach((target, i) => {
      const element = target instanceof Node ? target : (XENON.refs.get(target.trim()) || $(target.trim()));
      if (element) {
        const content = template ? template(data) : data;
        const htmlContent = html(content);
        actions[i] ? element[actions[i] == "replace" ? "replaceWith" : actions[i]](htmlContent) : element.innerHTML = content;
        newTargets.push(actions[i] ? htmlContent : element);
      } else state[target] = data;
    });
    return newTargets;
  };

  // AJAX function
  const ajax = (url, method, options = {}, params = {}) => {
    if (options.loading) options.target = update(options.loading, options.target, options.action) || options.target;
    const fd = params instanceof FormData, token = document.querySelector('meta[name="csrf-token"]')?.content;
    const path = new URL(url, window.location.href);
    const sameOrigin = path.origin === window.location.origin;
    fetch(url, {
      method,
      headers: {
        Accept: "text/vnd.turbo-stream.html,application/json,text/html",
        ...(!fd && method !== "GET" && { "Content-Type": "application/json" }),
        ...(sameOrigin && token ? { "X-CSRF-Token": token } : {})
      },
      body: method === "GET" ? null : (fd ? params : JSON.stringify(params)),
      credentials: sameOrigin ? "same-origin" : "omit"
    })
      .then(res => {
        const type = res.headers.get("content-type") || "";
        return (type.includes("turbo-stream") ? res.text().then(data => ({ turbo: true, data })) :
          type.includes("json") ? res.json() :
            res.text());
      }).then(data =>
        (data.turbo && window.Turbo)
          ? Turbo.renderStreamMessage(data.data)
          : update(data, options.target, options.loading ? (options.action || []).map(a => a && "replace") : options.action, options.template)
      ).catch(e => console.error("AJAX:", e.message));
  };

  // HTTP method helpers
  const get = (url, options = {}) => ajax(url, "GET", typeof options === "string" ? { target: [options], action: [null] } : options);
  const post = (url, params, options = {}) => ajax(url, "POST", typeof options === "string" ? { target: [options], action: [null] } : options, params);
  const put = (url, params, options = {}) => ajax(url, "PUT", typeof options === "string" ? { target: [options], action: [null] } : options, params);
  const patch = (url, params, options = {}) => ajax(url, "PATCH", typeof options === "string" ? { target: [options], action: [null] } : options, params);
  const del = (url, params, options = {}) => ajax(url, "DELETE", typeof options === "string" ? { target: [options], action: [null] } : options, params);

  // Create scope with magic variables
  // Uses a Proxy so assignments like `lastKey = x` go through to the reactive state
  const createScope = (el, event = {}) => {
    const locals = {
      $el: el,
      $event: event,
      $data: state,
      $: s => document.querySelector(s),
      $html: s => Object.assign(document.createElement("template"), { innerHTML: s.trim() }).content.firstChild,
      $get: get,
      $post: post,
      $put: put,
      $patch: patch,
      $delete: del,
    };
    // Add refs
    for (const [name, element] of XENON.refs) {
      locals[name] = element;
    }
    return new Proxy(locals, {
      get(t, p) {
        return p in t ? t[p] : state[p];
      },
      set(t, p, v) {
        if (p in t) t[p] = v;
        else state[p] = v;  // Forward to reactive state
        return true;
      }
    });
  };

  function applyBinding(b) {
    const { el, prop, expr, isHiddenAttr, calc } = b;
    const scope = createScope(el);
    let result = evaluate(expr, scope);

    // @calculate - store result in state
    if (calc) {
      state[calc] = result;
      return;
    }

    if (prop === "textContent") {
      el.textContent = result == null ? String(result) : result;
    } else if (prop === "innerHTML") {
      const content = Array.isArray(result) ? result.join('') : result;
      typeof Idiomorph === "object"
        ? Idiomorph.morph(el, content, { morphStyle: 'innerHTML' })
        : el.innerHTML = content;
    } else if (prop === "hidden") {
      // @hidden="x" -> hide when x is truthy
      // @visible="x" -> hide when x is falsy (invert)
      el.hidden = isHiddenAttr ? !!result : !result;
    } else if (prop === "class" && result && typeof result === "object") {
      // :class="{active: isActive, 'text-bold': isBold}"
      Object.entries(result).forEach(([k, v]) =>
        k.split(/\s+/).forEach(c => el.classList.toggle(c, !!v)));
    } else if (prop === "style" && result && typeof result === "object") {
      // :style="{color: textColor, 'font-size': fontSize + 'px'}"
      el.style.cssText = Object.entries(result)
        .filter(([_, v]) => v != null && v !== false)
        .map(([k, v]) => `${k}:${v}`)
        .join("; ");
    } else if (prop === null) {
      // @effect - just evaluate, no DOM update
      return;
    } else if (prop in el) {
      // Radio buttons: sync checked state based on value match
      if (b.isRadio && prop !== "checked") {
        el.checked = el.value == result;
      } else {
        el[prop] = parseEx(result);
      }
    } else {
      el.setAttribute(prop, parseEx(result));
    }
  }

  // Check if attribute is a Helium/Xenon attribute
  const isXeAttr = (name) => name.startsWith('@') || name.startsWith(':') || name.startsWith('data-xe');
  const xeMatch = (name, ...attrs) => {
    const prefix = name.split(/[.:]/)[0];
    return attrs.some(a => prefix === `@${a}` || prefix === `data-xe-${a}`);
  };

  // Deferred init (runs after all bindings are set up)
  let initFn, initEl;

  async function processElements(root) {
    const elements = [root, ...root.querySelectorAll("*")].filter(el => {
      if (XENON.processed.has(el)) return false;
      return [...el.attributes].some(a => isXeAttr(a.name));
    });

    // Handle @import directives first
    const importPromises = [];
    elements.forEach(el => {
      const importAttr = el.getAttribute("@import") || el.getAttribute("data-xe-import");
      if (importAttr) {
        importAttr.split(",").map(m => m.trim()).forEach(moduleName => {
          const path = "xenon_modules/" + moduleName;
          importPromises.push(
            import(path)
              .then(module => {
                Object.keys(module).forEach(key => (state[key] = module[key]));
              })
              .catch(error => {
                console.error(`Failed to import module: ${moduleName}`, error.message);
              })
          );
        });
      }
    });
    if (importPromises.length > 0) await Promise.all(importPromises);

    elements.forEach(el => {
      XENON.processed.add(el);

      for (const { name, value } of el.attributes) {
        if (!isXeAttr(name)) continue;

        // @data - initialize state
        if (name === "@data" || name === "data-xe") {
          const data = evaluate(value, {});
          Object.assign(state, data);
        }
        // @ref - element reference
        else if (xeMatch(name, "ref")) {
          XENON.refs.set("$" + value, el);
          state["$" + value] = el;  // Also add to state so expressions can access it
        }
        // @text - text binding
        else if (xeMatch(name, "text")) {
          // Initialize from DOM content if valid identifier and not reserved
          if (isValidIdentifier(value) && !RESERVED.has(value) && !(value in state)) {
            state[value] = parseEx(el.textContent);
          }
          const b = { el, prop: "textContent", expr: value };
          trackAndBind(b, value);
        }
        // @html - html binding
        else if (xeMatch(name, "html")) {
          // Initialize from DOM content if valid identifier and not reserved
          if (isValidIdentifier(value) && !RESERVED.has(value) && !(value in state)) {
            state[value] = el.innerHTML;
          }
          const b = { el, prop: "innerHTML", expr: value };
          trackAndBind(b, value);
        }
        // @hidden / @visible
        else if (xeMatch(name, "hidden", "visible")) {
          const isHidden = xeMatch(name, "hidden");
          // Just evaluate the value, apply logic in applyBinding
          const b = { el, prop: "hidden", expr: value, isHiddenAttr: isHidden };
          trackAndBind(b, value);
        }
        // @bind - two-way binding
        else if (xeMatch(name, "bind")) {
          const inputType = el.type?.toLowerCase();
          const isCheckbox = inputType === "checkbox";
          const isRadio = inputType === "radio";
          const isSelect = el.tagName === "SELECT";
          const prop = isCheckbox ? "checked" : "value";
          const event = (isCheckbox || isRadio || isSelect) ? "change" : "input";

          // Set initial value if valid identifier and not reserved
          if (isValidIdentifier(value) && !RESERVED.has(value) && !(value in state)) {
            state[value] = isCheckbox ? el.checked : parseEx(el.value);
          } else if (value in state) {
            if (isCheckbox) el.checked = !!state[value];
            else if (isRadio) el.checked = el.value == state[value];
            else el.value = state[value] ?? "";
          }

          // Listen for changes
          const handler = (e) => {
            state[value] = isCheckbox ? e.target.checked : e.target.value;
          };
          el.addEventListener(event, handler);
          addListener(el, el, event, handler);

          // Bind display
          const b = { el, prop, expr: value, isRadio };
          addBinding(value, b);
        }
        // :attr - dynamic attributes
        else if (name.startsWith(":") || name.startsWith("data-xe-attr:")) {
          const attr = name.startsWith(":") ? name.slice(1) : name.slice(13);
          const b = { el, prop: attr, expr: value };
          trackAndBind(b, value);
        }
        // @init - deferred to run after all bindings are set up
        else if (xeMatch(name, "init")) {
          initFn = value;
          initEl = el;
        }
        // @calculate - computed properties
        else if (xeMatch(name, "calculate")) {
          const calcName = name.split(":")[1];
          const b = { el, calc: calcName, prop: null, expr: value };
          trackAndBind(b, value);
        }
        // @effect - side effects
        else if (xeMatch(name, "effect")) {
          const keys = name.split(":").slice(1);
          const b = { el, prop: null, expr: value, effectKeys: keys };
          if (keys.includes("*")) {
            // Wildcard: trigger on any state change
            addBinding(ALL, b);
            applyBinding(b);
          } else {
            trackAndBind(b, value);
          }
        }
        // Event handlers (@click, @input, etc.) and HTTP methods (@get, @post, etc.)
        else if (name.startsWith("@") || name.startsWith("data-xe-on")) {
          const fullName = name.startsWith("@") ? name.slice(1) : name.slice(10);
          const [eventName, ...mods] = fullName.split(".");
          const isHttpMethod = ["get", "post", "put", "patch", "delete"].includes(eventName);
          const event = isHttpMethod ? getEvent(el) : eventName;

          // Parse debounce modifier: .debounce or .debounce:300
          const debounceMod = mods.find(m => m.startsWith("debounce"));
          const debounceDelay = debounceMod
            ? (t => t && !isNaN(t) ? Number(t) : 300)(debounceMod.split(":")[1])
            : 0;

          const _handler = (e) => {
            if (mods.includes("prevent")) e.preventDefault();
            if (mods.includes("stop")) e.stopPropagation();

            // Outside modifier: only fire if click is outside the element
            if (mods.includes("outside") && el.contains(e.target)) return;

            // Modifier keys (shift, ctrl, alt, meta)
            const keyMods = { shift: "shiftKey", ctrl: "ctrlKey", alt: "altKey", meta: "metaKey" };
            for (const [mod, prop] of Object.entries(keyMods)) {
              if (mods.includes(mod) && !e[prop]) return;
            }

            // Key modifiers for keyboard events
            if (["keydown", "keyup", "keypress"].includes(event)) {
              const keyMod = mods.find(m => !["prevent", "stop", "once", "outside", "document", "debounce", "shift", "ctrl", "alt", "meta"].includes(m) && !m.startsWith("debounce"));
              if (keyMod) {
                // Normalize key names: " " -> Space, Escape -> Esc
                const keyName = e.key === " " ? "Space" : e.key === "Escape" ? "Esc" : e.key;
                if (keyName.toLowerCase() !== keyMod.toLowerCase()) return;
              }
            }

            if (isHttpMethod) {
              // Handle AJAX request
              const scope = createScope(el, e);
              const getAttr = n => el.getAttribute(`data-xe-${n}`) || el.getAttribute(`@${n}`);
              const pairs = (getAttr('target') || "").split(",").map(p => p.split(":").map(s => s.trim()));
              const target = pairs.map(([t]) => t);
              const action = pairs.map(([, a]) => a);
              const options = {
                ...(getAttr("options") && evaluate(getAttr("options"), scope)),
                ...(target.length && { target }),
                ...(action.length && { action }),
                ...(getAttr("template") && { template: evaluate(getAttr("template"), scope) }),
                ...(getAttr("loading") && { loading: evaluate(getAttr("loading"), scope) }),
              };
              let paramsAttr = getAttr("params");
              const isCheckbox = el.type?.toLowerCase() === "checkbox";
              if (!paramsAttr && el.hasAttribute("name")) {
                const keys = el.getAttribute("name").match(/\w+/g).map(key => `${key}:`).join``;
                paramsAttr = keys + (isCheckbox ? "checked" : "value");
              } else paramsAttr ||= "{}";
              if (!paramsAttr.trim().startsWith("{") && paramsAttr.includes(":")) {
                const props = paramsAttr.split(":").map(s => s.trim());
                paramsAttr = props.reduceRight((acc, key, i) => `{ ${key}: ${i == 1 ? `'${el[acc]}'` : acc} }`);
              }
              const params = evaluate(paramsAttr, scope);
              ajax(value, eventName.toUpperCase(), options, params);
            } else {
              const scope = createScope(el, e);
              evaluate(value, scope);
            }
          };

          const handler = debounceDelay > 0 ? debounce(_handler, debounceDelay) : _handler;
          const target = mods.includes("outside") || mods.includes("document") ? document : el;
          const options = mods.includes("once") ? { once: true } : undefined;
          target.addEventListener(event, handler, options);
          addListener(el, target, event, handler);
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
    if (!XENON.bindings.has(key)) {
      XENON.bindings.set(key, []);
    }
    // Calculated bindings go first so they update before dependent bindings
    if (binding.calc) {
      XENON.bindings.get(key).unshift(binding);
    } else {
      XENON.bindings.get(key).push(binding);
    }
  }

  function addListener(el, target, event, handler) {
    if (!XENON.listeners.has(el)) {
      XENON.listeners.set(el, []);
    }
    XENON.listeners.get(el).push({ target, event, handler });
  }

  // Cleanup event listeners when elements are removed
  function cleanup(el) {
    [el, ...el.querySelectorAll('*')].forEach(e => {
      XENON.listeners.get(e)?.forEach(({ target, event, handler }) => target.removeEventListener(event, handler));
      XENON.listeners.delete(e);
    });
  }

  // Process initial elements
  await processElements(root);
  // Run @init after all bindings are set up
  if (initFn) {
    const scope = createScope(initEl);
    evaluate(initFn, scope);
  }

  // Watch for new elements and cleanup removed ones
  XENON.observer?.disconnect();
  XENON.observer = new MutationObserver(async (mutations) => {
    for (const m of mutations) {
      // Cleanup listeners on removed elements
      m.removedNodes.forEach(n => n.nodeType === 1 && cleanup(n));
      // Process new elements
      for (const node of m.addedNodes) {
        if (node.nodeType === 1 && !XENON.processed.has(node)) {
          await processElements(node);
        }
      }
    }
  });
  XENON.observer.observe(root, { childList: true, subtree: true });

  return state;
}

// Cleanup function
function xenonTeardown() {
  XENON?.observer?.disconnect();
  XENON = null;
}

// Expose globally
if (typeof window !== 'undefined') {
  window.xenon = xenon;
  window.xenonTeardown = xenonTeardown;
}

// Auto-initialize
if (typeof document !== 'undefined') {
  document.addEventListener("DOMContentLoaded", () => xenon());
  // Turbo integration
  document.addEventListener("turbo:before-render", () => xenonTeardown());
  document.addEventListener("turbo:render", () => xenon());
}

// Export for use
export { compile, evaluate, preprocess, xenon, xenonTeardown };
export default xenon;

// Generated from helium.js by scripts/generate-lite.mjs. Do not edit directly.
// Coerce attribute/property values without eval: JSON handles numbers/booleans/null/JSON,
// anything else (bare strings) is returned untouched. CSP-safe (no new Function).
const parseEx=v=>{if(typeof v!=="string")return v;try{return JSON.parse(v)}catch{return v}}
const tryNum=v=>{const t=String(v).trim(),n=+t;return t&&!isNaN(n)?n:v}
const isValidIdentifier = v => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(v);
const RESERVED = new Set(['undefined', 'null', 'true', 'false', 'NaN', 'Infinity', 'this', 'arguments']);
const INPUT_EVENTS = { form: "submit", input: "input", textarea:"input", select:"change" };
const KEY_MODS = { shift: "shiftKey", ctrl: "ctrlKey", alt: "altKey", meta: "metaKey" };
// Modifiers that are flags rather than key names; used to find the key mod regardless of order
const FLAG_MODS = new Set(["prevent", "once", "outside", "document", "stop"]);
const isKeyMod = m => !FLAG_MODS.has(m) && !m.startsWith("debounce") && !KEY_MODS[m];
const STATE_FIRST_GLOBALS = new Set(["name", "length", "status", "top", "origin", "event", "closed", "parent"]);
const getEvent = el => INPUT_EVENTS[el.tagName.toLowerCase()] || "click";
const debounce=(f,d)=>{let t;return(...a)=>(clearTimeout(t),t=setTimeout(f,d,...a))}
const isReactiveObject = v => {
  if (!v || typeof v !== "object") return false;
  if (Array.isArray(v)) return true;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

// Default expression engine using new Function()
const defaultEngine = {
  compile(expr, withReturn = true) {
    try {
      const fn = new Function(
        "$scope",
        withReturn
          ? `with($scope){with($scope.$data){return(${expr.trim()})}}`
          : `with($scope){with($scope.$data){${expr.trim()}}}`
      );
      return {
        execute: (scope) => fn(scope),
        getIds: null  // Will use trackDependencies instead
      };
    } catch {
      return {
        execute: () => expr,
        getIds: null
      };
    }
  },

  createScope(ctx) {
    return {
      $: ctx.$,
      $data: ctx.state,
      $event: ctx.event,
      $el: ctx.el,
      $html: ctx.html,
      ...ctx.refs
    };
  }
};

// Factory function to create helium with custom engine
function createHelium(configuredRoot) {
  const engine = defaultEngine;

  // Engine-aware expression parser (CSP-safe when using jexpr engine)
  const evalExpr = v => {
    try {
      const compiled = engine.compile(v, true);
      const scope = engine.createScope ? engine.createScope({ state: {}, el: null, event: {}, refs: {}, $: null, html: null, get: null, post: null, put: null, patch: null, del: null }) : {};
      return compiled.execute(scope);
    } catch { return v; }
  };

  const match = (name, ...attrs) => {
    const p = name.split(/[.:]/)[0];
    if (p === ":" || p === "") return false;
    return attrs.some(a => p === `@${a}` || p === 'data-he-' + a);
  };

  // Single global object to hold all settings (scoped to this instance)
  let HELIUM = null;
  let generation = 0;

  async function helium(initialState = {}) {
    const currentGeneration = ++generation;
    const isCurrent = () => currentGeneration === generation;
    const ALL = Symbol("all");
    const root = configuredRoot
      || document.querySelector('[\\@helium]') || document.querySelector('[data-helium]') || document.body;
    if (!root) throw Error("No root");
    const storageKey = root.getAttribute('@local-storage') || root.getAttribute('data-he-local-storage');

    // On re-init (manual re-call or Turbo navigation) tear down the previous
    // instance first, then start from fresh collections. Reusing the old
    // bindings Map would fire the proxy set-trap during the Object.assign below
    // — before this call's executeBinding const is initialized — throwing a TDZ
    // error, and would leak stale bindings that keep running on detached nodes.
    if (HELIUM) {
      HELIUM.observer?.disconnect();
      HELIUM.cleanup?.(HELIUM.root);
    }
    HELIUM = {
      observer: null,
      bindings: new Map(),
      refs: new Map(),
      listeners: new WeakMap(),
      cleanups: new WeakMap(),
      processed: new WeakSet(),
      parentKeys: new WeakMap(),
      fnCache: new Map(),
      proxyCache: new WeakMap()
    };
    HELIUM.root = root;

    const $ = s => document.querySelector(s);
    const html = s => Object.assign(document.createElement("template"),{innerHTML:String(s).trim()}).content.firstChild


    // Track bindings currently being applied to prevent infinite recursion
    const applyingBindings = new Set();

    const safeApplyBinding = (b) => {
      if ((b.el !== root && !root.contains(b.el)) || applyingBindings.has(b)) return;
      applyingBindings.add(b);
      try {
        applyBinding(b);
      } finally {
        applyingBindings.delete(b);
      }
    };

  const handler = {
      // 'has' trap needed for 'with' statement - it uses 'in' operator to check property existence
      // Return false for $-prefixed names so they fall through to outer scope
      // (where $el, $event, $html, and refs like $form are defined without proxy wrapping)
      has(t, p) {
        if (typeof p === 'string' && p.startsWith('$')) return false;
        if (Reflect.has(t, p)) return true;
        // These common window properties are much more likely to be state names.
        // Browser globals remain available explicitly as window.name, window.top, etc.
        if (STATE_FIRST_GLOBALS.has(p)) return true;
        if (typeof globalThis[p] !== 'undefined') return false;  // Allow globals like Date, Math, Array, console
        return true;
      },
      get(t,p,r) {
      const v = Reflect.get(t,p,r);
      if (!isCurrent() || !isReactiveObject(v)) return v;
      // Record this (key,parent) edge. An object can be reachable through more
      // than one property (e.g. state.a === state.b), so keep every edge rather
      // than overwriting a single parent — otherwise mutations via one path
      // leave the other path's bindings stale.
      let edges = HELIUM.parentKeys.get(v);
      if (!edges) HELIUM.parentKeys.set(v, edges = []);
      if (!edges.some(e => e.key === p && e.parent === t)) edges.push({key: p, parent: t});
      if (HELIUM.proxyCache.has(v)) return HELIUM.proxyCache.get(v);
      const proxy = new Proxy(v, handler);
      HELIUM.proxyCache.set(v, proxy);
      return proxy;
    },
      set: (t,p,v) => {
        const res = Reflect.set(t,p,v);
        if (!isCurrent()) return res;
        // Collect this property plus every ancestor key reachable through the
        // parent graph, so deeply-nested mutations (user.address.city) re-trigger
        // ancestor bindings. BFS with a visited set handles shared refs and cycles;
        // the key set de-dups so each binding runs at most once per mutation.
        const keys = new Set([p]);
        const seen = new Set();
        let frontier = HELIUM.parentKeys.get(t) || [];
        while (frontier.length) {
          const next = [];
          for (const { key, parent } of frontier) {
            keys.add(key);
            if (parent && !seen.has(parent)) {
              seen.add(parent);
              const pe = HELIUM.parentKeys.get(parent);
              if (pe) next.push(...pe);
            }
          }
          frontier = next;
        }
        keys.forEach(k => HELIUM.bindings.get(k)?.forEach(safeApplyBinding));
        HELIUM.bindings.get(ALL)?.forEach(safeApplyBinding);
        saveState?.();
        return res
      }
  };

    // Initialize state if it doesn't exist
    const state = new Proxy({}, handler);

    // Persist to localStorage, but debounced so a burst of sync mutations writes once
    const saveState = storageKey
      ? debounce(() => isCurrent() && localStorage.setItem(storageKey, JSON.stringify(state)), 0)
      : null;

    // Merge initial state
    Object.assign(state, initialState);

    const setStateValue = (el, prop, value) => {
      // Dotted paths ("user.name") walk to the parent object through the
      // reactive proxies, so the leaf assignment triggers bindings as usual.
      const path = prop.split(".").map(s => s.trim());
      const last = path.pop();
      let target = state;
      for (const key of path) target = target?.[key];
      if (!target || typeof target !== "object") {
        console.error(`Helium: cannot set "${prop}" — "${path.join(".")}" is not an object`);
        return false;
      }
      return Reflect.set(target, last, value);
    };

    // Standard overlays the nearest element scope on the mounted root; the
    // generated Lite build leaves this as the root-only state view.
    const createScope = (el, event = {}, scopeState = state, extraScope, accessed) => {
      let scopedState = scopeState;
      return engine.createScope({
        $,
        state: scopedState,
        event,
        el,
        html,
        refs: Object.fromEntries(HELIUM.refs)
      });
    };

    // Compile expression with caching
    const compile = (expr, withReturn = true) => {
      const key = `${withReturn}:${expr}`;
      if (HELIUM.fnCache.has(key)) return HELIUM.fnCache.get(key);
      const compiled = engine.compile(expr, withReturn);
      HELIUM.fnCache.set(key, compiled);
      return compiled;
    };

  const updateBindingDependencies = (b, keys) => {
    const next = new Set(keys);
    b.dependencies?.forEach(key => {
      if (next.has(key)) return;
      const kept = HELIUM.bindings.get(key)?.filter(binding => binding !== b) || [];
      kept.length ? HELIUM.bindings.set(key, kept) : HELIUM.bindings.delete(key);
    });
    next.forEach(key => {
      if (b.dependencies?.has(key)) return;
      const bindings = HELIUM.bindings.get(key) || [];
      HELIUM.bindings.set(key, b.calc || b.loop ? [b, ...bindings] : [...bindings, b]);
    });
    b.dependencies = next;
  };

  const executeBinding = (b, event = {}, elCtx = b.el) => {
    const accessed = new Map();
    const wrap = (target, rootKey = null) => new Proxy(target, {
      has(target, prop) {
        return rootKey === null ? handler.has(target, prop) : Reflect.has(target, prop);
      },
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (rootKey === null && typeof prop === "string" && !accessed.has(prop)) accessed.set(prop, value);
        return isReactiveObject(value) ? wrap(value, rootKey ?? prop) : value;
      }
    });

    try {
      const result = b.compiled.execute(createScope(elCtx, event, wrap(state), null, accessed));
      const tracked = [...accessed].filter(([key, value]) => {
        return state[key] === value;
      }).map(([key]) => key);
      let explicitKeys = b.keys || [];
      const keys = b.keys?.includes("*") ? [ALL] : tracked.concat(explicitKeys);
      updateBindingDependencies(b, keys);
      return { ok: true, result };
    } catch (err) {
      console.error("Helium expression error:", err.message);
      return { ok: false };
    }
  };


  function applyBinding(b,e={},elCtx=b.el){
    const {el,prop,calc,isHiddenAttr}=b;
    const execution = b.initialExecution || executeBinding(b, e, elCtx);
    delete b.initialExecution;
    if (!execution.ok) return;
    const r = execution.result;
    if (calc) setStateValue(el, calc, r)

    if (prop==="innerHTML") {
      const content = Array.isArray(r)?r.join``:r;
      return typeof Idiomorph === "object"
        ? Idiomorph.morph(el, content,{morphStyle:'innerHTML'})
        : el.innerHTML = content;
    }
    if (prop==="class" && r && typeof r==="object") {
      const nextTokens = new Set();
      Object.entries(r).forEach(([k,v]) =>
        k.split(/\s+/).filter(Boolean).forEach(c => {
          nextTokens.add(c);
          el.classList.toggle(c, !!v);
        }));
      b.classTokens?.forEach(c => {
        if (!nextTokens.has(c)) el.classList.remove(c);
      });
      b.classTokens = nextTokens;
      return;
    }

    if (prop==="style" && r && typeof r==="object")
    return el.style.cssText = Object.entries(r)
      .filter(([_, v]) => v != null && v !== false)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${v}`)
      .join("; ");

    if (prop === "hidden") {
      // @hidden="x" -> hide when x is truthy
      // @visible="x" -> hide when x is falsy (invert via isHiddenAttr)
      el.hidden = isHiddenAttr ? !!r : !r;
      return;
    }

    if (prop in el) {
      if (el.type === "radio" && prop !== "checked") el.checked = el.value===r;
      else el[prop] = prop==="textContent" ? (r ?? '') : parseEx(r);
      return;
    }

    el.setAttribute(prop, parseEx(r));
  }

  const cleanup = el => {
      const removed = new Set([el, ...el.querySelectorAll('*')]);
      removed.forEach(e => {
        const initCleanups = HELIUM.cleanups.get(e);
        HELIUM.cleanups.delete(e);
        initCleanups?.forEach(initCleanup => {
          try { initCleanup(); }
          catch (error) { console.error("Helium cleanup:", error); }
        });
        HELIUM.listeners.get(e)?.forEach(({receiver,event,handler}) => receiver.removeEventListener(event,handler));
        HELIUM.listeners.delete(e);
        HELIUM.processed.delete(e);  // allow reprocessing if the same node is re-inserted
      });
      for (const [name, ref] of HELIUM.refs) {
        if (removed.has(ref)) HELIUM.refs.delete(name);
      }
      // Prune bindings that reference removed elements, otherwise they leak and keep
      // running on detached nodes every time state changes.
      HELIUM.bindings.forEach((arr, key) => {
        const kept = arr.filter(b => !removed.has(b.el));
        kept.length ? HELIUM.bindings.set(key, kept) : HELIUM.bindings.delete(key);
      });
    };

  const runInits = inits => inits.forEach(({ compiled, el }) => {
    let result;
    try { result = compiled.execute(createScope(el)); }
    catch (err) { return void console.error("Helium @init error:", err.message); }
    if (typeof result === "function") {
      HELIUM.cleanups.set(el, [...(HELIUM.cleanups.get(el) || []), result]);
    }
  });

  HELIUM.cleanup = cleanup;

  async function processElements(element) {
      const newBindings = [];
      const deferredBindings = [];
      const newInits = [];

     const heElements = [element, ...element.querySelectorAll("*")].filter(e => {
        if (HELIUM.processed.has(e)) return false;
        for (let i = 0; i < e.attributes.length; i++) {
          const n = e.attributes[i].name;
          if (n[0] === '@' || n[0] === ':' || n.startsWith('data-he')) return true;
        }
        return false;
      });

      if (!isCurrent()) return { bindings: [], inits: [] };

      heElements.forEach(el => {
        HELIUM.processed.add(el);

        const attrs = el.attributes;
        const inputType = el.type?.toLowerCase();
        const isCheckbox = inputType == "checkbox", isRadio = inputType == "radio", isSelect = el.tagName == "SELECT";

        // Single loop through attributes with early skipping
        for (let i = 0; i < attrs.length; i++) {
          const {name, value} = attrs[i];

          // Skip non-helium attributes early
          if (name[0] !== '@' && name[0] !== ':' && !name.startsWith('data-he')) continue;

          // Initialize state first if needed (skip reserved words, only if not already set)
          let hasLocalValue = false;
          if (match(name, "text", "html", "bind") && isValidIdentifier(value) && !RESERVED.has(value) && !hasLocalValue && state[value] == null) {
            state[value] = match(name, "bind") ? (el.type == "checkbox" ? el.checked : tryNum(el.value)) : tryNum(el.textContent);
          }

          // Process the attribute
          // @data alias is data-he-data (matching every other directive); the
          // bare data-he form is kept for backwards compatibility.
          if (match(name, "data") || name === 'data-he') {
            Object.assign(state, evalExpr(value));
          }
          else if (match(name, "scope")) continue;
          else if (name.startsWith(":") || name.startsWith('data-he-attr:')) {
            const propName = name.startsWith(":") ? name.slice(1) : name.slice(13);
            deferredBindings.push({el, prop: propName, compiled: compile(value, true)});
          }
          else if (match(name, "ref")) {
            HELIUM.refs.set("$" + value, el);
          }
          else if (match(name, "text", "html")) {
            deferredBindings.push({el, prop: match(name, "text") ? "textContent" : "innerHTML", compiled: compile(value, true)});
          }
          else if (match(name, "bind")) {
            const event = (isCheckbox || isRadio || isSelect || name.includes(".lazy")) ? "change" : "input";
            const prop = isCheckbox ? "checked" : "value";
            const toBound = v => (v = name.includes(".trim") ? v.trim() : v,
              name.includes(".number") && v !== "" && !isNaN(+v) ? +v : v);
            const inputHandler = e => setStateValue(el, value, isCheckbox ? e.target.checked : toBound(e.target.value));
            el.addEventListener(event, inputHandler);
            if (!HELIUM.listeners.has(el)) HELIUM.listeners.set(el, []);
            HELIUM.listeners.get(el).push({receiver: el, event, handler: inputHandler});
            deferredBindings.push({el, prop, compiled: compile(value, true)});
            if (isCheckbox) el.checked = !!state[value];
            else if (isRadio) el.checked = el.value == state[value];
            else el.value = state[value] ?? "";
          }
          else if (match(name, "hidden", "visible")) {
            const isHidden = match(name, "hidden");
            deferredBindings.push({el, prop: "hidden", compiled: compile(value, true), isHiddenAttr: isHidden});
          }
          else if (match(name, "calculate")) {
            const calcName = name.split(":")[1];
            let calcOwner = null;
            if (!calcOwner && !(calcName in state)) state[calcName] = undefined;  // Initialize so other bindings can reference it
            deferredBindings.push({el, calc: calcName, prop: null, compiled: compile(value, true)});
          }
          else if (match(name, "effect")) {
            deferredBindings.push({el, prop: null, compiled: compile(value, true), keys: name.split(":").slice(1)});
          }
          else if (match(name, "init")) {
            newInits.push({ compiled: compile(value, true), el });
          }
          else if (name.startsWith("@") || name.startsWith('data-he')) {
            const fullName = name.startsWith("@") ? name.slice(1) : name.slice(8);
            const [eventName, ...mods] = fullName.split(".");
            let event = eventName;
            const receiver = mods.includes("outside") || mods.includes("document") ? document : el;
            const debounceMod = mods.find(m => m.startsWith("debounce"));
            const debounceDelay = debounceMod ? (t => t && !isNaN(t) ? Number(t) : 300)(debounceMod.split(":")[1]) : 0;
            const _handler = e => {
              if (!isCurrent()) return;
              if (mods.includes("prevent")) e.preventDefault();
              if (mods.includes("stop")) e.stopPropagation();
              for (const [mod, prop] of Object.entries(KEY_MODS)) if (mods.includes(mod) && !e[prop]) return;
              if (["keydown", "keyup", "keypress"].includes(event)) {
                // Match the key name among the modifiers regardless of order (.ctrl.enter or .enter.ctrl)
                const keyMod = mods.find(isKeyMod);
                if (keyMod) {
                  const keyName = e.key == " " ? "Space" : e.key == "Escape" ? "Esc" : e.key;
                  if (keyName.toLowerCase() !== keyMod.toLowerCase()) return;
                }
              }
              if (mods.includes("outside") && el.contains(e.target)) return;
              {
                const scope = createScope(el, e);
                const compiled = compile(value, true);
                // Inline expressions may return a promise (e.g. $get/$post);
                // swallow rejections so fire-and-forget calls don't warn.
                const result = compiled.execute(scope);
                if (result && typeof result.then === "function")
                  result.catch(err => console.error("AJAX:", err.message));
              }
              // Remove after the action actually runs, so .once combined with a
              // key/outside filter fires once *when matched* (not on the first
              // raw event). This is why we don't use the { once: true } option.
              if (mods.includes("once")) receiver.removeEventListener(event, handler);
            };
            const handler = debounceDelay > 0 ? debounce(_handler, debounceDelay) : _handler;
            receiver.addEventListener(event, handler);
            if (!HELIUM.listeners.has(el)) HELIUM.listeners.set(el, []);
            HELIUM.listeners.get(el).push({receiver, event, handler});
          }
        }
      });
      deferredBindings.forEach(b => {
        b.initialExecution = executeBinding(b);
        b.calc || b.loop ? newBindings.unshift(b) : newBindings.push(b);
      })
      return { bindings: newBindings, inits: newInits };
    }

    // Disconnect old observer if exists, then create new one
    HELIUM.observer?.disconnect();
    HELIUM.observer = new MutationObserver(async (ms) => {
      if (!isCurrent()) return;
      for (const m of ms) {
        m.removedNodes.forEach((n) => n.nodeType === 1 && !root.contains(n) && cleanup(n));

        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && root.contains(n) && !HELIUM.processed.has(n)) {
            const { bindings, inits } = await processElements(n);
            if (!root.contains(n)) continue;
            bindings.forEach(binding => applyBinding(binding));
            runInits(inits);
          }
        }
      }
    });
    HELIUM.observer.observe(root, { childList: true, subtree: true });

    // Read localStorage before processElements (which sets @data defaults and triggers saves via proxy)
    const savedState = storageKey ? (() => { try { return JSON.parse(localStorage.getItem(storageKey)); } catch { return null; } })() : null;
    const { bindings: initialBindings, inits } = await processElements(root);
    if (!isCurrent()) return state;
    // Merge saved values after @data defaults, so localStorage takes priority
    if (savedState) Object.assign(state, savedState);
    initialBindings.forEach(binding => applyBinding(binding));
    runInits(inits);

    return state;
  }

  // Teardown function
  function heliumTeardown() {
    generation++;
    if (HELIUM?.observer) {
      HELIUM.observer.disconnect();
      HELIUM.cleanup?.(HELIUM.root);
    }
    HELIUM = null;
  }

  async function mount(root, initialState) {
    const target = typeof root === "string" ? document.querySelector(root) : root;
    if (!target) throw Error("No root");
    const instance = createHelium(target);
    return { state: await instance.helium(initialState), unmount: instance.heliumTeardown };
  }

  return { helium, heliumTeardown, mount };
}

// Create default instance for backwards compatibility
const { helium: runDefaultHelium, heliumTeardown: _defaultTeardown, mount: runDefaultMount } = createHelium();

// Flag to disable default auto-init (used by helium-csp.js and other variants)
let defaultInitialized = false;
let defaultAutoTimer = null;

function suppressDefaultAutoInit() {
  defaultInitialized = true;
  if (defaultAutoTimer !== null) {
    clearTimeout(defaultAutoTimer);
    defaultAutoTimer = null;
  }
}

function defaultHelium(initialState) {
  suppressDefaultAutoInit();
  return runDefaultHelium(initialState);
}

function mount(root, initialState) {
  suppressDefaultAutoInit();
  return runDefaultMount(root, initialState);
}

defaultHelium.mount = mount;

// Public teardown leaves the module usable for an explicit future mount, while
// suppressing any still-pending one-shot auto initialization.
function defaultTeardown() {
  suppressDefaultAutoInit();
  _defaultTeardown();
}

// Variants such as the CSP build replace the default instance entirely.

// Setup browser globals and auto-initialization
if (typeof window !== 'undefined') {
  window.helium = defaultHelium;
  window.heliumTeardown = defaultTeardown;
}

// Initialize on load
if (typeof document !== 'undefined') {
  const autoInit = () => {
    defaultAutoTimer = null;
    if (!defaultInitialized) defaultHelium();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit, { once: true });
  } else {
    // Loaded after DOMContentLoaded (e.g. dynamic import): init now. This mirrors
    // the during-load path, which always inits and falls back to document.body —
    // we no longer require an explicit [data-helium] root here.
    // Deferred to the next task so an importing module can provide initial state
    // before automatic initialization runs.
    defaultAutoTimer = setTimeout(autoInit, 0);
  }
}

export { defaultHelium as helium, defaultTeardown as heliumTeardown };
export default defaultHelium;

/**
 * Helium Lite - Lightweight reactive library
 * Core features only: @data, @text, @html, @bind, :attr, @ref, @calculate, @effect, @init, events
 * No @for, AJAX, @import, SSE, or Turbo
 */

// Safely coerce a bound attribute/property value: JSON handles
// numbers/booleans/null/objects; bare strings are returned untouched. This must
// NOT execute the value — a bound string like "alert(1)" must stay a string.
const parseEx = (v) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};
// Evaluate a developer-authored @data expression (a JS object literal such as
// `{ count: 0 }`, which isn't valid JSON). Uses Function() — Lite is eval-based
// by design — but only ever on trusted markup, never on reactive values.
const parseData = (v) => {
  try {
    return Function(`return(${v})`)();
  } catch {
    return {};
  }
};
const tryNum = (v) => {
  const t = String(v).trim(),
    n = +t;
  return t && !isNaN(n) ? n : v;
};
const isValidIdentifier = (v) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(v);
const RESERVED = new Set([
  "undefined",
  "null",
  "true",
  "false",
  "NaN",
  "Infinity",
  "this",
  "arguments",
]);
const KEY_MODS = {
  shift: "shiftKey",
  ctrl: "ctrlKey",
  alt: "altKey",
  meta: "metaKey",
};
// Modifiers that are flags rather than key names; used to find the key mod
// regardless of order (.enter.prevent and .prevent.enter must behave the same).
const FLAG_MODS = new Set(["prevent", "once", "outside", "document", "stop"]);
const isKeyMod = (m) =>
  !FLAG_MODS.has(m) && !m.startsWith("debounce") && !KEY_MODS[m];
const debounce = (f, d) => {
  let t;
  return (...a) => (clearTimeout(t), (t = setTimeout(f, d, ...a)));
};

const ATTR_REGEX = /^(@|:|data-he)/;
const STATE_FIRST_GLOBALS = new Set([
  "name", "length", "status", "top", "origin", "event", "closed", "parent",
]);
const isReactiveObject = (v) => {
  if (!v || typeof v !== "object") return false;
  if (Array.isArray(v)) return true;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

const match = (name, ...attrs) => {
  const p = name.split(/[.:]/)[0];
  return p == ":" || p == ""
    ? false
    : attrs.some((a) => p === `@${a}` || p === `data-he-${a}`);
};

const createLite = (configuredRoot) => {
let HELIUM = null;
let generation = 0;

async function runHelium(initialState = {}) {
  const currentGeneration = ++generation;
  const isCurrent = () => currentGeneration === generation;
  const ALL = Symbol("all");
  const root =
    configuredRoot ||
    document.querySelector("[\\@helium]") ||
    document.querySelector("[data-helium]") ||
    document.body;
  const storageKey =
    root.getAttribute("@local-storage") ||
    root.getAttribute("data-he-local-storage");

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
    proxyCache: new WeakMap(),
  };
  HELIUM.root = root;

  const $ = (s) => document.querySelector(s);
  const html = (s) =>
    Object.assign(document.createElement("template"), { innerHTML: s.trim() })
      .content.firstChild;

  const applyingBindings = new Set();

  const safeApplyBinding = (b) => {
    if (applyingBindings.has(b)) return;
    applyingBindings.add(b);
    try {
      applyBinding(b);
    } finally {
      applyingBindings.delete(b);
    }
  };

  const handler = {
    has(t, p) {
      if (typeof p === "string" && p.startsWith("$")) return false;
      if (Reflect.has(t, p)) return true;
      if (STATE_FIRST_GLOBALS.has(p)) return true;
      if (typeof globalThis[p] !== "undefined") return false;
      return true;
    },
    get(t, p, r) {
      const v = Reflect.get(t, p, r);
      if (!isCurrent() || !isReactiveObject(v)) return v;
      if (HELIUM.proxyCache.has(v)) return HELIUM.proxyCache.get(v);
      const proxy = new Proxy(v, handler);
      HELIUM.proxyCache.set(v, proxy);
      HELIUM.parentKeys.set(v, p);
      return proxy;
    },
    set: (t, p, v) => {
      const res = Reflect.set(t, p, v);
      if (!isCurrent()) return res;
      HELIUM.bindings.get(p)?.forEach(safeApplyBinding);
      const parentKey = HELIUM.parentKeys.get(t);
      if (parentKey) HELIUM.bindings.get(parentKey)?.forEach(safeApplyBinding);
      HELIUM.bindings.get(ALL)?.forEach(safeApplyBinding);
      saveState?.();
      return res;
    },
  };

  const state = new Proxy({}, handler);
  // Persist to localStorage, debounced so a burst of sync mutations writes once.
  const saveState = storageKey
    ? debounce(() => isCurrent() && localStorage.setItem(storageKey, JSON.stringify(state)), 0)
    : null;
  Object.assign(state, initialState);

  const createScope = (el, event = {}, scopeState = state) => {
    return {
      $,
      $data: scopeState,
      $event: event,
      $el: el,
      $html: html,
      ...Object.fromEntries(HELIUM.refs),
    };
  };

  const compile = (expr) => {
    const key = expr;
    if (HELIUM.fnCache.has(key)) return HELIUM.fnCache.get(key);
    try {
      const fn = new Function(
        "$scope",
        `with($scope){with($scope.$data){return(${expr.trim()})}}`,
      );
      const compiled = { execute: (scope) => fn(scope) };
      HELIUM.fnCache.set(key, compiled);
      return compiled;
    } catch {
      const compiled = { execute: () => expr };
      HELIUM.fnCache.set(key, compiled);
      return compiled;
    }
  };

  const updateBindingDependencies = (b, keys) => {
    const next = new Set(keys);
    b.dependencies?.forEach((key) => {
      if (next.has(key)) return;
      const kept =
        HELIUM.bindings.get(key)?.filter((binding) => binding !== b) || [];
      kept.length
        ? HELIUM.bindings.set(key, kept)
        : HELIUM.bindings.delete(key);
    });
    next.forEach((key) => {
      if (b.dependencies?.has(key)) return;
      const bindings = HELIUM.bindings.get(key) || [];
      HELIUM.bindings.set(
        key,
        b.calc ? [b, ...bindings] : [...bindings, b],
      );
    });
    b.dependencies = next;
  };

  const executeBinding = (b, event = {}, elCtx = b.el) => {
    const accessed = new Map();
    const wrap = (target, rootKey = null) =>
      new Proxy(target, {
        has(target, prop) {
          return rootKey === null
            ? handler.has(target, prop)
            : Reflect.has(target, prop);
        },
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (
            rootKey === null &&
            typeof prop === "string" &&
            !accessed.has(prop)
          )
            accessed.set(prop, value);
          return isReactiveObject(value)
            ? wrap(value, rootKey ?? prop)
            : value;
        },
      });

    try {
      const result = b.compiled.execute(createScope(elCtx, event, wrap(state)));
      const tracked = [...accessed]
        .filter(([key, value]) => state[key] === value)
        .map(([key]) => key);
      const keys = b.keys?.includes("*")
        ? [ALL]
        : tracked.concat(b.keys || []);
      updateBindingDependencies(b, keys);
      return { ok: true, result };
    } catch (error) {
      console.error("Helium expression error:", error.message);
      return { ok: false };
    }
  };

  function applyBinding(b, e = {}, elCtx = b.el) {
    const { el, prop, calc, isHiddenAttr } = b;
    const execution = b.initialExecution || executeBinding(b, e, elCtx);
    delete b.initialExecution;
    if (!execution.ok) return;
    const r = execution.result;
    if (calc) state[calc] = r;

    if (prop === "innerHTML") {
      const content = Array.isArray(r) ? r.join`` : r;
      return typeof Idiomorph === "object"
        ? Idiomorph.morph(el, content, { morphStyle: "innerHTML" })
        : (el.innerHTML = content);
    }
    if (prop === "class" && r && typeof r === "object") {
      const nextTokens = new Set();
      Object.entries(r).forEach(([k, v]) =>
        k.split(/\s+/).filter(Boolean).forEach((c) => {
          nextTokens.add(c);
          el.classList.toggle(c, !!v);
        }),
      );
      b.classTokens?.forEach((c) => {
        if (!nextTokens.has(c)) el.classList.remove(c);
      });
      b.classTokens = nextTokens;
      return;
    }

    if (prop === "style" && r && typeof r === "object")
      return (el.style.cssText = Object.entries(r)
        .filter(([_, v]) => v != null && v !== false)
        .map(
          ([k, v]) =>
            `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${v}`,
        )
        .join("; "));

    if (prop === "hidden") {
      el.hidden = isHiddenAttr ? !!r : !r;
      return;
    }

    if (prop in el) {
      if (el.type === "radio" && prop !== "checked") el.checked = el.value === r;
      else el[prop] = prop === "textContent" ? (r ?? "") : parseEx(r);
      return;
    }

    el.setAttribute(prop, parseEx(r));
  }

  const cleanup = (el) => {
    const removed = new Set([el, ...el.querySelectorAll("*")]);
    removed.forEach((e) => {
      const initCleanups = HELIUM.cleanups.get(e);
      HELIUM.cleanups.delete(e);
      initCleanups?.forEach((initCleanup) => {
        try {
          initCleanup();
        } catch (error) {
          console.error("Helium cleanup:", error);
        }
      });
      HELIUM.listeners
        .get(e)
        ?.forEach(({ receiver, event, handler }) =>
          receiver.removeEventListener(event, handler),
        );
      HELIUM.listeners.delete(e);
      HELIUM.processed.delete(e);
    });
    for (const [name, ref] of HELIUM.refs) {
      if (removed.has(ref)) HELIUM.refs.delete(name);
    }
    HELIUM.bindings.forEach((bindings, key) => {
      const kept = bindings.filter((binding) => !removed.has(binding.el));
      kept.length
        ? HELIUM.bindings.set(key, kept)
        : HELIUM.bindings.delete(key);
    });
  };

  const runInits = (inits) =>
    inits.forEach(({ compiled, el }) => {
      const result = compiled.execute(createScope(el));
      if (typeof result === "function") {
        HELIUM.cleanups.set(el, [
          ...(HELIUM.cleanups.get(el) || []),
          result,
        ]);
      }
    });

  HELIUM.cleanup = cleanup;

  async function processElements(element) {
    const newBindings = [];
    const deferredBindings = [];
    const newInits = [];

    const heElements = [element, ...element.querySelectorAll("*")].filter(
      (e) => {
        if (HELIUM.processed.has(e)) return false;
        for (let i = 0; i < e.attributes.length; i++) {
          if (ATTR_REGEX.test(e.attributes[i].name)) return true;
        }
        return false;
      },
    );

    heElements.forEach((el) => {
      HELIUM.processed.add(el);

      const attrs = el.attributes;
      const inputType = el.type?.toLowerCase();
      const isCheckbox = inputType == "checkbox",
        isRadio = inputType == "radio",
        isSelect = el.tagName == "SELECT";

      for (let i = 0; i < attrs.length; i++) {
        const { name, value } = attrs[i];

        if (
          !name.startsWith("@") &&
          !name.startsWith(":") &&
          !name.startsWith("data-he")
        )
          continue;

        // Initialize state first if needed (skip reserved words, only if not already set)
        if (
          match(name, "text", "html", "bind") &&
          isValidIdentifier(value) &&
          !RESERVED.has(value) &&
          state[value] == null
        ) {
          state[value] = match(name, "bind")
            ? el.type == "checkbox"
              ? el.checked
              : tryNum(el.value)
            : tryNum(el.textContent);
        }

        // Process the attribute
        // @data alias is data-he-data (matching every other directive); the
        // bare data-he form is kept for backwards compatibility.
        if (match(name, "data") || name === "data-he") {
          Object.assign(state, parseData(value));
        } else if (name.startsWith(":") || name.startsWith("data-he-attr:")) {
          const propName = name.startsWith(":")
            ? name.slice(1)
            : name.slice(13);
          deferredBindings.push({
            el,
            prop: propName,
            compiled: compile(value),
          });
        } else if (match(name, "ref")) {
          HELIUM.refs.set("$" + value, el);
        } else if (match(name, "text", "html")) {
          deferredBindings.push({
            el,
            prop: match(name, "text") ? "textContent" : "innerHTML",
            compiled: compile(value),
          });
        } else if (match(name, "bind")) {
          const event = isCheckbox || isRadio || isSelect || name.includes(".lazy") ? "change" : "input";
          const prop = isCheckbox ? "checked" : "value";
          const toBound = (v) => (v = name.includes(".trim") ? v.trim() : v,
            name.includes(".number") && v !== "" && !isNaN(+v) ? +v : v);
          const inputHandler = (e) =>
            (state[value] = isCheckbox ? e.target.checked : toBound(e.target.value));
          el.addEventListener(event, inputHandler);
          if (!HELIUM.listeners.has(el)) HELIUM.listeners.set(el, []);
          HELIUM.listeners
            .get(el)
            .push({ receiver: el, event, handler: inputHandler });
          deferredBindings.push({
            el,
            prop,
            compiled: compile(value),
          });
          if (isCheckbox) el.checked = !!state[value];
          else if (isRadio) el.checked = el.value == state[value];
          else el.value = state[value] ?? "";
        } else if (match(name, "hidden", "visible")) {
          const isHidden = match(name, "hidden");
          deferredBindings.push({
            el,
            prop: "hidden",
            compiled: compile(value),
            isHiddenAttr: isHidden,
          });
        } else if (match(name, "calculate")) {
          const calcName = name.split(":")[1];
          if (!(calcName in state)) state[calcName] = undefined;
          deferredBindings.push({
            el,
            calc: calcName,
            prop: null,
            compiled: compile(value),
          });
        } else if (match(name, "effect")) {
          deferredBindings.push({
            el,
            prop: null,
            compiled: compile(value),
            keys: name.split(":").slice(1),
          });
        } else if (match(name, "init")) {
          newInits.push({ compiled: compile(value), el });
        } else if (name.startsWith("@") || name.startsWith("data-he")) {
          const fullName = name.startsWith("@") ? name.slice(1) : name.slice(8);
          const [event, ...mods] = fullName.split(".");
          const receiver =
            mods.includes("outside") || mods.includes("document")
              ? document
              : el;
          const debounceMod = mods.find((m) => m.startsWith("debounce"));
          const debounceDelay = debounceMod
            ? ((t) => (t && !isNaN(t) ? Number(t) : 300))(
                debounceMod.split(":")[1],
              )
            : 0;
          const _handler = (e) => {
            if (!isCurrent()) return;
            if (mods.includes("prevent")) e.preventDefault();
            if (mods.includes("stop")) e.stopPropagation();
            for (const [mod, prop] of Object.entries(KEY_MODS))
              if (mods.includes(mod) && !e[prop]) return;
            if (["keydown", "keyup", "keypress"].includes(event)) {
              // Find the key name among the modifiers regardless of order, so
              // @keydown.enter.prevent filters by Enter (not by the last mod).
              const keyMod = mods.find(isKeyMod);
              if (keyMod) {
                const keyName =
                  e.key == " " ? "Space" : e.key == "Escape" ? "Esc" : e.key;
                if (keyName.toLowerCase() !== keyMod.toLowerCase()) return;
              }
            }
            if (mods.includes("outside") && el.contains(e.target)) return;
            const scope = createScope(el, e);
            const compiled = compile(value);
            compiled.execute(scope);
            // Remove after the action actually runs, so .once combined with a
            // key/outside filter fires once *when matched* (not on the first raw
            // event). This is why we don't use the { once: true } option.
            if (mods.includes("once"))
              receiver.removeEventListener(event, handler);
          };
          const handler =
            debounceDelay > 0 ? debounce(_handler, debounceDelay) : _handler;
          receiver.addEventListener(event, handler);
          if (!HELIUM.listeners.has(el)) HELIUM.listeners.set(el, []);
          HELIUM.listeners.get(el).push({ receiver, event, handler });
        }
      }
    });

    deferredBindings.forEach((b) => {
      b.initialExecution = executeBinding(b);
      b.calc ? newBindings.unshift(b) : newBindings.push(b);
    });

    return { bindings: newBindings, inits: newInits };
  }

  HELIUM.observer?.disconnect();
  HELIUM.observer = new MutationObserver(async (ms) => {
    if (!isCurrent()) return;
    for (const m of ms) {
      m.removedNodes.forEach(
        (n) => n.nodeType === 1 && !root.contains(n) && cleanup(n),
      );

      for (const n of m.addedNodes) {
        if (n.nodeType === 1 && !HELIUM.processed.has(n)) {
          const { bindings, inits } = await processElements(n);
          bindings.forEach(applyBinding);
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
  initialBindings.forEach(applyBinding);
  runInits(inits);

  return state;
}

function runHeliumTeardown() {
  generation++;
  if (HELIUM?.observer) {
    HELIUM.observer.disconnect();
    HELIUM.cleanup?.(HELIUM.root);
  }
  HELIUM = null;
}

return [runHelium, runHeliumTeardown];
};

const [runHelium, runHeliumTeardown] = createLite();
let initialized = false;
let autoTimer = null;

const suppressAutoInit = () => {
  initialized = true;
  if (autoTimer !== null) clearTimeout(autoTimer);
  autoTimer = null;
};

function helium(initialState) {
  suppressAutoInit();
  return runHelium(initialState);
}

async function mount(root, initialState) {
  suppressAutoInit();
  const target = typeof root === "string" ? document.querySelector(root) : root;
  if (!target) throw Error("root");
  const [run, unmount] = createLite(target);
  return { state: await run(initialState), unmount };
}

helium.mount = mount;

function heliumTeardown() {
  suppressAutoInit();
  runHeliumTeardown();
}

// Browser globals
if (typeof window !== "undefined") {
  window.helium = helium;
  window.heliumTeardown = heliumTeardown;
}

// Auto-initialize
if (typeof document !== "undefined") {
  const autoInit = () => {
    autoTimer = null;
    if (!initialized) helium();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit, { once: true });
  } else {
    // Imported after DOMContentLoaded already fired: init now.
    autoTimer = setTimeout(autoInit, 0);
  }
}

export { helium, heliumTeardown };
export default helium;

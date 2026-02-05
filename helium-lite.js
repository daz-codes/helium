/**
 * Helium Lite - Lightweight reactive library
 * Core features only: @data, @text, @html, @bind, :attr, @ref, @calculate, @effect, @init, events
 * No AJAX, no @import, no SSE, no Turbo
 */

const parseEx = (v) => {
  try {
    return Function(`return(${v})`)();
  } catch {
    return v;
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
const debounce = (f, d) => {
  let t;
  return (...a) => (clearTimeout(t), (t = setTimeout(f, d, ...a)));
};

const ATTR_REGEX = /^(@|:|data-he)/;

const match = (name, ...attrs) => {
  const p = name.split(/[.:]/)[0];
  return p == ":" || p == ""
    ? false
    : attrs.some((a) => p === `@${a}` || p === `data-he-${a}`);
};

let HELIUM = null;

async function helium(initialState = {}) {
  const inits = [];
  const ALL = Symbol("all");
  const root =
    document.querySelector("[\\@helium]") ||
    document.querySelector("[data-helium]") ||
    document.body;
  const storageKey =
    root.getAttribute("@local-storage") ||
    root.getAttribute("data-he-local-storage");

  if (!HELIUM) {
    HELIUM = {
      observer: null,
      bindings: new Map(),
      refs: new Map(),
      listeners: new WeakMap(),
      processed: new WeakSet(),
      parentKeys: new WeakMap(),
      fnCache: new Map(),
      proxyCache: new WeakMap(),
    };
  }

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
      if (typeof globalThis[p] !== "undefined") return false;
      return true;
    },
    get(t, p, r) {
      const v = Reflect.get(t, p, r);
      if (v && typeof v === "object") {
        if (HELIUM.proxyCache.has(v)) return HELIUM.proxyCache.get(v);
        const proxy = new Proxy(v, handler);
        HELIUM.proxyCache.set(v, proxy);
        HELIUM.parentKeys.set(v, p);
        return proxy;
      }
      return v;
    },
    set: (t, p, v) => {
      const res = Reflect.set(t, p, v);
      HELIUM.bindings.get(p)?.forEach(safeApplyBinding);
      const parentKey = HELIUM.parentKeys.get(t);
      if (parentKey) HELIUM.bindings.get(parentKey)?.forEach(safeApplyBinding);
      HELIUM.bindings.get(ALL)?.forEach(safeApplyBinding);
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(state));
      return res;
    },
  };

  const state = new Proxy({}, handler);
  if (storageKey)
    try {
      Object.assign(state, JSON.parse(localStorage.getItem(storageKey)));
    } catch {}
  Object.assign(state, initialState);

  const createScope = (el, event = {}) => {
    return {
      $,
      $data: state,
      $event: event,
      $el: el,
      $html: html,
      ...Object.fromEntries(HELIUM.refs),
    };
  };

  const compile = (expr, withReturn = true) => {
    const key = `${withReturn}:${expr}`;
    if (HELIUM.fnCache.has(key)) return HELIUM.fnCache.get(key);
    try {
      const fn = new Function(
        "$scope",
        withReturn
          ? `with($scope){with($scope.$data){return(${expr.trim()})}}`
          : `with($scope){with($scope.$data){${expr.trim()}}}`,
      );
      const compiled = { execute: (scope) => fn(scope), getIds: null };
      HELIUM.fnCache.set(key, compiled);
      return compiled;
    } catch {
      const compiled = { execute: () => expr, getIds: null };
      HELIUM.fnCache.set(key, compiled);
      return compiled;
    }
  };

  function applyBinding(b, e = {}, elCtx = b.el) {
    const { el, prop, compiled, calc, isHiddenAttr, isRadio } = b;
    const scope = createScope(elCtx, e);
    const r = compiled.execute(scope);
    if (calc) state[calc] = r;

    if (prop === "innerHTML") {
      const content = Array.isArray(r) ? r.join`` : r;
      return typeof Idiomorph === "object"
        ? Idiomorph.morph(el, content, { morphStyle: "innerHTML" })
        : (el.innerHTML = content);
    }
    if (prop === "class" && r && typeof r === "object")
      return Object.entries(r).forEach(([k, v]) =>
        k.split(/\s+/).forEach((c) => el.classList.toggle(c, v)),
      );

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
      if (isRadio && prop !== "checked") el.checked = el.value === r;
      else if (el.type === "radio" && prop !== "checked")
        el.checked = el.value === r;
      else el[prop] = prop === "textContent" ? (r ?? "") : parseEx(r);
      return;
    }

    el.setAttribute(prop, parseEx(r));
  }

  const trackDependenciesProxy = (compiled, el, excludeChanged = false) => {
    const accessed = excludeChanged ? new Map() : new Set();
    const trackProxy = new Proxy(state, {
      has(target, prop) {
        return true;
      },
      get(target, prop) {
        if (typeof prop == "string") {
          excludeChanged
            ? !accessed.has(prop) && accessed.set(prop, target[prop])
            : accessed.add(prop);
        }
        const val = target[prop];
        return typeof val == "object" && val != null
          ? new Proxy(val, this)
          : val;
      },
    });

    try {
      const scope = {
        $,
        $data: trackProxy,
        $event: {},
        $el: el,
        $html: html,
        ...Object.fromEntries(HELIUM.refs),
      };
      compiled.execute(scope);
    } catch {}

    return excludeChanged
      ? [...accessed.keys()].filter(
          (prop) => state[prop] === accessed.get(prop),
        )
      : [...accessed];
  };

  const getDependencies = (compiled, el, excludeChanged = false) => {
    return trackDependenciesProxy(compiled, el, excludeChanged);
  };

  const cleanup = (el) => {
    [el, ...el.querySelectorAll("*")].forEach((e) => {
      HELIUM.listeners
        .get(e)
        ?.forEach(({ receiver, event, handler }) =>
          receiver.removeEventListener(event, handler),
        );
      HELIUM.listeners.delete(e);
    });
  };

  async function processElements(element) {
    const newBindings = [];
    const deferredBindings = [];

    const heElements = [element, ...element.querySelectorAll("*")].filter(
      (e) => {
        if (HELIUM.processed.has(e)) return false;
        for (let i = 0; i < e.attributes.length; i++) {
          if (ATTR_REGEX.test(e.attributes[i].name)) return true;
        }
        return false;
      },
    );

    const addBinding = (val, b) => {
      HELIUM.bindings.set(
        val,
        b.calc
          ? [b, ...(HELIUM.bindings.get(val) || [])]
          : [...(HELIUM.bindings.get(val) || []), b],
      );
      b.calc ? newBindings.unshift(b) : newBindings.push(b);
    };

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
        if (name === "@data" || name === "data-he") {
          Object.assign(state, parseEx(value));
        } else if (name.startsWith(":") || name.startsWith("data-he-attr:")) {
          const propName = name.startsWith(":")
            ? name.slice(1)
            : name.slice(13);
          deferredBindings.push({
            el,
            prop: propName,
            compiled: compile(value, true),
          });
        } else if (match(name, "ref")) {
          HELIUM.refs.set("$" + value, el);
        } else if (match(name, "text", "html")) {
          deferredBindings.push({
            el,
            prop: match(name, "text") ? "textContent" : "innerHTML",
            compiled: compile(value, true),
          });
        } else if (match(name, "bind")) {
          const event = isCheckbox || isRadio || isSelect ? "change" : "input";
          const prop = isCheckbox ? "checked" : "value";
          const inputHandler = (e) =>
            (state[value] = isCheckbox ? e.target.checked : e.target.value);
          el.addEventListener(event, inputHandler);
          if (!HELIUM.listeners.has(el)) HELIUM.listeners.set(el, []);
          HELIUM.listeners
            .get(el)
            .push({ receiver: el, event, handler: inputHandler });
          deferredBindings.push({
            el,
            prop,
            compiled: compile(value, true),
            isRadio,
          });
          if (isCheckbox) el.checked = !!state[value];
          else if (isRadio) el.checked = el.value == state[value];
          else el.value = state[value] ?? "";
        } else if (match(name, "hidden", "visible")) {
          const isHidden = match(name, "hidden");
          deferredBindings.push({
            el,
            prop: "hidden",
            compiled: compile(value, true),
            isHiddenAttr: isHidden,
          });
        } else if (match(name, "calculate")) {
          const calcName = name.split(":")[1];
          if (!(calcName in state)) state[calcName] = undefined;
          deferredBindings.push({
            el,
            calc: calcName,
            prop: null,
            compiled: compile(value, true),
          });
        } else if (match(name, "effect")) {
          deferredBindings.push({
            el,
            prop: null,
            compiled: compile(value, true),
            keys: name.split(":").slice(1),
          });
        } else if (match(name, "init")) {
          inits.push({ compiled: compile(value, true), el });
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
            if (mods.includes("prevent")) e.preventDefault();
            if (mods.includes("stop")) e.stopPropagation();
            for (const [mod, prop] of Object.entries(KEY_MODS))
              if (mods.includes(mod) && !e[prop]) return;
            if (["keydown", "keyup", "keypress"].includes(event)) {
              const last = mods[mods.length - 1];
              if (
                last &&
                !["prevent", "once", "outside", "document", "stop"].includes(
                  last,
                ) &&
                !last.startsWith("debounce") &&
                !Object.keys(KEY_MODS).includes(last)
              ) {
                const keyName =
                  e.key == " " ? "Space" : e.key == "Escape" ? "Esc" : e.key;
                if (keyName.toLowerCase() !== last.toLowerCase()) return;
              }
            }
            if (!mods.includes("outside") || !el.contains(e.target)) {
              const scope = createScope(el, e);
              const compiled = compile(value, true);
              compiled.execute(scope);
            }
            if (mods.includes("once"))
              receiver.removeEventListener(event, handler);
          };
          const handler =
            debounceDelay > 0 ? debounce(_handler, debounceDelay) : _handler;
          const eventOptions = mods.includes("once")
            ? { once: true }
            : undefined;
          receiver.addEventListener(event, handler, eventOptions);
          if (!HELIUM.listeners.has(el)) HELIUM.listeners.set(el, []);
          HELIUM.listeners.get(el).push({ receiver, event, handler });
        }
      }
    });

    deferredBindings.forEach((b) => {
      const tracked = b.keys?.includes("*")
        ? [ALL]
        : getDependencies(b.compiled, b.el, true).concat(b.keys || []);
      tracked.forEach((key) => addBinding(key, b));
      if (tracked.length === 0) {
        newBindings.push(b);
      }
    });

    return newBindings;
  }

  HELIUM.observer?.disconnect();
  HELIUM.observer = new MutationObserver(async (ms) => {
    for (const m of ms) {
      m.removedNodes.forEach((n) => n.nodeType === 1 && cleanup(n));

      for (const n of m.addedNodes) {
        if (n.nodeType === 1 && !HELIUM.processed.has(n)) {
          const bindings = await processElements(n);
          bindings?.forEach(applyBinding);
        }
      }
    }
  });
  HELIUM.observer.observe(root, { childList: true, subtree: true });

  const initialBindings = await processElements(root);
  initialBindings.forEach(applyBinding);
  inits.forEach(({ compiled, el }) => {
    const scope = createScope(el);
    compiled.execute(scope);
  });

  return state;
}

function heliumTeardown() {
  if (HELIUM?.observer) HELIUM.observer.disconnect();
  HELIUM = null;
}

// Browser globals
if (typeof window !== "undefined") {
  window.helium = helium;
  window.heliumTeardown = heliumTeardown;
}

// Auto-initialize
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => helium());
}

export { helium, heliumTeardown };
export default helium;

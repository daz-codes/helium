// Helium Lite: the small, HTML-first runtime for common view interactions.

let active;
let autoTimer;
let autoHandled = false;

const blockedKeys = new Set(["__proto__", "prototype", "constructor"]);
const reserved = new Set([
  "helium", "data", "text", "html", "bind", "ref", "init", "if", "for",
  "effect", "calculate", "import", "get", "post", "put", "patch", "delete",
]);
const keyNames = new Set([
  "enter", "escape", "space", "tab", "up", "down", "left", "right",
]);
const keyValues = {
  enter: "Enter", escape: "Escape", space: " ", tab: "Tab",
  up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
};

const elements = root => [root, ...root.querySelectorAll("*")];
const number = value => typeof value === "string" && value !== "" && !Number.isNaN(Number(value)) ? Number(value) : value;
const plain = value => value && typeof value === "object" &&
  (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype);
const directive = name => name[0] === "@" ? name.slice(1) :
  name.startsWith("data-he-") ? name.slice(8) : null;

function findRoot() {
  return document.querySelector("[data-helium]") ||
    [...document.getElementsByTagName("*")].find(el => el.hasAttribute("@helium")) ||
    document.body;
}

function compile(source, statements = false) {
  try {
    return new Function("$scope", `with($scope){${statements ? source : `return (${source})`}}`);
  } catch (error) {
    if (!statements) return new Function("$scope", `with($scope){${source}}`);
    throw error;
  }
}

function start(root, initial) {
  let alive = true;
  let collecting;
  let queued = false;
  const pending = new Set();
  const byKey = new Map();
  const records = new WeakMap();
  const processed = new WeakSet();
  const refs = Object.create(null);
  const proxyCache = new WeakMap();
  const rawState = { ...initial };

  const queue = key => {
    if (!alive) return;
    byKey.get(key)?.forEach(binding => pending.add(binding));
    if (!queued) {
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const work = [...pending];
        pending.clear();
        work.forEach(run);
      });
    }
  };

  const reactive = (value, rootKey) => {
    if (!plain(value)) return value;
    let variants = proxyCache.get(value);
    if (!variants) proxyCache.set(value, variants = new Map());
    if (variants.has(rootKey)) return variants.get(rootKey);
    const proxy = new Proxy(value, {
      get(target, key, receiver) {
        return reactive(Reflect.get(target, key, receiver), rootKey);
      },
      set(target, key, next, receiver) {
        if (blockedKeys.has(key)) return false;
        const changed = target[key] !== next;
        const result = Reflect.set(target, key, next, receiver);
        if (changed) queue(rootKey);
        return result;
      },
      deleteProperty(target, key) {
        if (blockedKeys.has(key)) return false;
        const existed = key in target;
        const result = Reflect.deleteProperty(target, key);
        if (existed) queue(rootKey);
        return result;
      },
    });
    variants.set(rootKey, proxy);
    return proxy;
  };

  const state = new Proxy(rawState, {
    get(target, key) {
      if (collecting && typeof key === "string") collecting.next.add(key);
      return reactive(target[key], key);
    },
    set(target, key, value) {
      if (blockedKeys.has(key)) return false;
      const changed = target[key] !== value;
      target[key] = value;
      if (changed) queue(key);
      return true;
    },
    deleteProperty(target, key) {
      if (blockedKeys.has(key)) return false;
      const existed = key in target;
      delete target[key];
      if (existed) queue(key);
      return true;
    },
  });

  const scope = (el, event) => new Proxy({}, {
    has: () => true,
    get(_, key) {
      if (key === Symbol.unscopables) return undefined;
      if (key === "$data" || key === "state") return state;
      if (key === "$el") return el;
      if (key === "$event") return event;
      if (key === "$refs") return refs;
      if (key === "$") return document.querySelector.bind(document);
      if (typeof key === "string" && key.replace(/^\$/, "") in refs) return refs[key.replace(/^\$/, "")];
      if (typeof key === "string" && key in rawState) return state[key];
      return globalThis[key];
    },
    set(_, key, value) {
      if (typeof key === "string" && !blockedKeys.has(key)) state[key] = value;
      return true;
    },
  });

  const evaluate = (source, el, event, statements = false) =>
    compile(source, statements)(scope(el, event));

  const recordFor = el => {
    let record = records.get(el);
    if (!record) records.set(el, record = { listeners: [], cleanups: [], bindings: [] });
    return record;
  };

  function run(binding) {
    if (!alive || !binding.el.isConnected) return;
    binding.deps.forEach(key => byKey.get(key)?.delete(binding));
    binding.next = new Set();
    collecting = binding;
    try {
      binding.apply(evaluate(binding.source, binding.el));
    } finally {
      collecting = undefined;
    }
    binding.deps = binding.next;
    binding.deps.forEach(key => {
      let set = byKey.get(key);
      if (!set) byKey.set(key, set = new Set());
      set.add(binding);
    });
  }

  const bind = (el, source, apply) => {
    const binding = { el, source, apply, deps: new Set(), next: new Set() };
    recordFor(el).bindings.push(binding);
    run(binding);
  };

  const assign = (path, value) => {
    const keys = path.split(".");
    if (!keys.length || keys.some(key => !key || blockedKeys.has(key))) return;
    let target = state;
    keys.slice(0, -1).forEach(key => target = target[key] ||= {});
    target[keys.at(-1)] = value;
  };

  const inputValue = (el, modifiers) => {
    let value = el.type === "checkbox" ? el.checked :
      el.type === "radio" ? el.value :
      el.multiple ? [...el.selectedOptions].map(option => option.value) : el.value;
    if (typeof value === "string" && modifiers.includes("trim")) value = value.trim();
    if (modifiers.includes("number")) value = Array.isArray(value) ? value.map(number) : number(value);
    return value;
  };

  const seed = (el, path) => {
    if (!/^[$A-Z_a-z][$\w]*(?:\.[$A-Z_a-z][$\w]*)*$/.test(path)) return;
    const first = path.split(".")[0];
    if (first in rawState) return;
    if (el.type === "radio" && !el.checked) return;
    const value = el.matches("input,select,textarea") ? inputValue(el, []) : el.textContent;
    assign(path, number(value));
  };

  const addEvent = (el, name, source) => {
    const [event, ...modifiers] = name.split(".");
    if (!event || reserved.has(event)) return;
    const listener = e => {
      const key = modifiers.find(modifier => keyNames.has(modifier));
      if (key && e.key !== keyValues[key]) return;
      if (modifiers.includes("self") && e.target !== el) return;
      if (modifiers.includes("prevent")) e.preventDefault();
      if (modifiers.includes("stop")) e.stopPropagation();
      evaluate(source, el, e, true);
    };
    const options = {
      once: modifiers.includes("once"),
      capture: modifiers.includes("capture"),
      passive: modifiers.includes("passive"),
    };
    el.addEventListener(event, listener, options);
    recordFor(el).listeners.push([event, listener, options]);
  };

  const process = el => {
    if (processed.has(el)) return;
    processed.add(el);
    for (const attribute of [...el.attributes]) {
      const name = directive(attribute.name);
      if (name?.split(".")[0] === "data") {
        const value = evaluate(attribute.value, el);
        if (value && typeof value === "object") Object.assign(state, value);
      }
    }
    for (const attribute of [...el.attributes]) {
      const { name: rawName, value: source } = attribute;
      if (rawName[0] === ":") {
        const name = rawName.slice(1);
        let classTokens = new Set();
        bind(el, source, value => {
          if (name === "class" && value && typeof value === "object") {
            classTokens.forEach(token => { if (!(token in value)) el.classList.remove(token); });
            Object.entries(value).forEach(([token, on]) => el.classList.toggle(token, !!on));
            classTokens = new Set(Object.keys(value));
          } else if (name === "style" && value && typeof value === "object") {
            Object.assign(el.style, value);
          } else if (name === "hidden") el.hidden = !!value;
          else if (name === "visible") el.hidden = !value;
          else if (value === false || value == null) el.removeAttribute(name);
          else el.setAttribute(name, value === true ? "" : String(value));
        });
        continue;
      }
      const fullName = directive(rawName);
      if (!fullName) continue;
      const [name, ...modifiers] = fullName.split(".");
      if (name === "text" || name === "html") {
        seed(el, source);
        bind(el, source, value => el[name === "text" ? "textContent" : "innerHTML"] = value ?? "");
      } else if (name === "hidden" || name === "visible") {
        bind(el, source, value => { el.hidden = name === "hidden" ? !!value : !value; });
      } else if (name === "bind") {
        seed(el, source);
        bind(el, source, value => {
          if (el.type === "checkbox") el.checked = !!value;
          else if (el.type === "radio") el.checked = value == el.value;
          else if (el.multiple) [...el.options].forEach(option => option.selected = value?.includes(option.value));
          else if (el.value !== String(value ?? "")) el.value = value ?? "";
        });
        const event = modifiers.includes("lazy") || el.matches("select,[type=checkbox],[type=radio]") ? "change" : "input";
        const listener = () => { if (el.type !== "radio" || el.checked) assign(source, inputValue(el, modifiers)); };
        el.addEventListener(event, listener);
        recordFor(el).listeners.push([event, listener]);
      } else if (name === "ref") {
        const key = source.replace(/^\$/, "");
        refs[key] = el;
        recordFor(el).cleanups.push(() => { if (refs[key] === el) delete refs[key]; });
      } else if (name === "init") {
        const cleanup = evaluate(source, el);
        if (typeof cleanup === "function") recordFor(el).cleanups.push(cleanup);
      } else addEvent(el, fullName, source);
    }
  };

  const cleanup = el => {
    elements(el).reverse().forEach(node => {
      const record = records.get(node);
      if (!record) return;
      record.listeners.forEach(args => node.removeEventListener(...args));
      record.bindings.forEach(binding => binding.deps.forEach(key => byKey.get(key)?.delete(binding)));
      record.cleanups.reverse().forEach(fn => fn());
      records.delete(node);
    });
  };

  elements(root).forEach(process);
  const observer = new MutationObserver(mutations => mutations.forEach(mutation => {
    mutation.removedNodes.forEach(node => {
      if (node.nodeType === 1 && !root.contains(node)) cleanup(node);
    });
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === 1 && root.contains(node)) elements(node).forEach(process);
    });
  }));
  observer.observe(root, { childList: true, subtree: true });

  return {
    state,
    teardown() {
      if (!alive) return;
      alive = false;
      observer.disconnect();
      cleanup(root);
      pending.clear();
      byKey.clear();
    },
  };
}

export async function helium(initial = {}) {
  autoHandled = true;
  clearTimeout(autoTimer);
  active?.teardown();
  active = start(findRoot(), initial);
  return active.state;
}

export function heliumTeardown() {
  autoHandled = true;
  clearTimeout(autoTimer);
  active?.teardown();
  active = undefined;
}

export default helium;

const autoStart = () => { if (!autoHandled) helium(); };
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoStart, { once: true });
  else autoTimer = setTimeout(autoStart);
}

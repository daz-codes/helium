const parseEx=v=>{try{return Function(`return(${v})`)()}catch{return v}}
const tryNum=v=>{const t=String(v).trim(),n=+t;return t&&!isNaN(n)?n:v}
const isValidIdentifier = v => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(v);
const RESERVED = new Set(['undefined', 'null', 'true', 'false', 'NaN', 'Infinity', 'this', 'arguments']);
const INPUT_EVENTS = { form: "submit", input: "input", textarea:"input", select:"change" };
const KEY_MODS = { shift: "shiftKey", ctrl: "ctrlKey", alt: "altKey", meta: "metaKey" };
const getEvent = el => INPUT_EVENTS[el.tagName.toLowerCase()] || "click";
const debounce=(f,d)=>{let t;return(...a)=>(clearTimeout(t),t=setTimeout(f,d,...a))}

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
      $get: ctx.get,
      $post: ctx.post,
      $put: ctx.put,
      $patch: ctx.patch,
      $delete: ctx.del,
      ...ctx.refs
    };
  }
};

// Factory function to create helium with custom engine
export function createHelium(options = {}) {
  const engine = options.engine ?? defaultEngine;

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

  async function helium(initialState = {}) {
    const inits = [];
    const ALL = Symbol("all");
    const root = document.querySelector('[\\@helium]') || document.querySelector('[data-helium]') || document.body;
    const storageKey = root.getAttribute('@local-storage') || root.getAttribute('data-he-local-storage');

    // Initialize or reuse HELIUM object
    if (!HELIUM) {
      HELIUM = {
        observer: null,
        bindings: new Map(),
        refs: new Map(),
        listeners: new WeakMap(),
        processed: new WeakSet(),
        parentKeys: new WeakMap(),
        fnCache: new Map(),
        proxyCache: new WeakMap()
      };
    }

    const $ = s => document.querySelector(s);
    const html = s => Object.assign(document.createElement("template"),{innerHTML:s.trim()}).content.firstChild

    const update = (data,targets,actions,template) => {
      const newTargets = [];
      (targets || []).forEach((target,i) => {
      const element = target instanceof Node ? target : (HELIUM.refs.get(target.trim()) || $(target.trim()));
        if(element){
          const content = template ? template(data) : data;
          const htmlContent = html(content)
          actions?.[i] ? element[actions[i]=="replace"?"replaceWith":actions[i]](htmlContent) : element.innerHTML = content;
          newTargets.push(actions?.[i] ? htmlContent : element)
        } else state[target] = data
      })
      return newTargets
    }

  // SSE handling with retry support
    const handleSSE = async (res, options, reconnect) => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', lastId = null, retryDelay = options.retry || 3000;

      const processEvents = () => {
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (const block of parts) {
          if (!block.trim()) continue;
          let data = '', id = null;
          for (const line of block.split('\n')) {
            if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).trimStart();
            else if (line.startsWith('id:')) id = line.slice(3).trim();
            else if (line.startsWith('retry:')) retryDelay = parseInt(line.slice(6).trim()) || retryDelay;
          }
          if (id) lastId = id;
          if (data) {
            update(data, options.target, options.action, options.template);
          }
        }
      };

      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, {stream: true});
          processEvents();
        }
        // Process any remaining data
        if (buffer.trim()) { buffer += '\n\n'; processEvents(); }
        // Reconnect if configured
        if (options.retryMode === 'always') setTimeout(() => reconnect(lastId), retryDelay);
      } catch (e) {
        console.error("SSE:", e.message);
        if (options.retryMode === 'always' || options.retryMode === 'error') {
          setTimeout(() => reconnect(lastId), retryDelay);
        }
      }
    };

  const ajax = (url,method,options={},params={}) => {
      if(options.loading) {
        const loadingTargets = update(options.loading,options.target,options.action);
        if(loadingTargets.length) options.target = loadingTargets;
      }
      const fd = params instanceof FormData, token = document.querySelector('meta[name="csrf-token"]')?.content;
      const path = new URL(url, window.location.href);
      const sameOrigin = path.origin === window.location.origin;

      const doFetch = (lastEventId) => fetch(url, {
        method,
        headers: {
          Accept:"text/event-stream,text/vnd.turbo-stream.html,application/json,text/html",
          ...(!fd && method !== "GET" && {"Content-Type":"application/json"}),
          ...(sameOrigin && token ? {"X-CSRF-Token": token} : {}),
          ...(lastEventId ? {"Last-Event-ID": lastEventId} : {})
        },
        body: method === "GET" ? null : (fd ? params : JSON.stringify(params)),
        credentials: sameOrigin ? "same-origin" : "omit"
      })
        .then(res => {
          const type = res.headers.get("content-type") || "";
          if (type.includes("event-stream")) return handleSSE(res, options, doFetch);
          return (type.includes("turbo-stream") ? res.text().then(data => ({ turbo: true, data })) :
                  type.includes("json")         ? res.json() :
                                                  res.text());
        }).then(data => {
          if (data === undefined) return; // SSE handled separately
          return (data.turbo && window.Turbo)
            ? Turbo.renderStreamMessage(data.data)
            : update(data, options.target, options.loading ? (options.action || []).map(a => a && "replace") : options.action, options.template)
        }).catch(e => console.error("AJAX:", e.message));

      doFetch(null);
    }

    const opts = o => typeof o === "string" ? { target: [o], action: [null] } : o;
    const get = (url, options={}) => ajax(url, "GET", opts(options));
    const [post, put, patch, del] = ["POST","PUT","PATCH","DELETE"].map(method => (url, params, options={}) => ajax(url, method, opts(options), params));

    // Track bindings currently being applied to prevent infinite recursion
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
      // 'has' trap needed for 'with' statement - it uses 'in' operator to check property existence
      // Return false for $-prefixed names so they fall through to outer scope
      // (where $el, $event, $html, and refs like $form are defined without proxy wrapping)
      has(t, p) {
        if (typeof p === 'string' && p.startsWith('$')) return false;
        if (Reflect.has(t, p)) return true;
        if (typeof globalThis[p] !== 'undefined') return false;  // Allow globals like Date, Math, Array, console
        return true;
      },
      get(t,p,r) {
      const v = Reflect.get(t,p,r);
      if (v && typeof v === "object") {
        if (HELIUM.proxyCache.has(v)) return HELIUM.proxyCache.get(v);
        const proxy = new Proxy(v, handler);
        HELIUM.proxyCache.set(v, proxy);
        HELIUM.parentKeys.set(v, p);
        return proxy;
      }
      return v;
    },
      set: (t,p,v) => {
        const res = Reflect.set(t,p,v);
        // Trigger bindings for this property
        HELIUM.bindings.get(p)?.forEach(safeApplyBinding);
        // Also trigger parent object's bindings (for nested updates like user.name)
        const parentKey = HELIUM.parentKeys.get(t);
        if (parentKey) HELIUM.bindings.get(parentKey)?.forEach(safeApplyBinding);
        HELIUM.bindings.get(ALL)?.forEach(safeApplyBinding);
        if (storageKey) localStorage.setItem(storageKey, JSON.stringify(state));
        return res
      }
  };

    // Initialize state if it doesn't exist
    const state = new Proxy({}, handler);

    // Load from localStorage if key exists
    if (storageKey) try { Object.assign(state, JSON.parse(localStorage.getItem(storageKey))); } catch {}

    // Merge initial state
    Object.assign(state, initialState);

    // Create scope for expression execution
    const createScope = (el, event = {}) => {
      return engine.createScope({
        $,
        state,
        event,
        el,
        html,
        get,
        post,
        put,
        patch,
        del,
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

  function applyBinding(b,e={},elCtx=b.el){
    const {el,prop,compiled,calc,isHiddenAttr,isRadio}=b;
    const scope = createScope(elCtx, e);
    const r = compiled.execute(scope);
    if (calc) state[calc] = r

    if (prop==="innerHTML") {
      const content = Array.isArray(r)?r.join``:r;
      return typeof Idiomorph === "object"
        ? Idiomorph.morph(el, content,{morphStyle:'innerHTML'})
        : el.innerHTML = content;
    }
    if (prop==="class" && r && typeof r==="object")
      return Object.entries(r).forEach(([k,v]) =>
        k.split(/\s+/).forEach(c => el.classList.toggle(c,v)));

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
      if (isRadio && prop !== "checked") el.checked = el.value===r;
      else if (el.type === "radio" && prop !== "checked") el.checked = el.value===r;
      else el[prop] = prop==="textContent" ? (r ?? '') : parseEx(r);
      return;
    }

    el.setAttribute(prop, parseEx(r));
  }

  // Track dependencies using proxy (fallback when getIds is not available)
  const trackDependenciesProxy = (compiled, el, excludeChanged = false) => {
    const accessed = excludeChanged ? new Map() : new Set();
    const trackProxy = new Proxy(state, {
      // 'has' trap is needed for 'with' statement to work correctly
      // Without it, 'with' checks if property exists using 'in' operator,
      // and if not found, continues up scope chain causing ReferenceError
      has(target, prop) {
        return true;
      },
      get(target, prop) {
        if (typeof prop == 'string') {
          excludeChanged ? !accessed.has(prop) && accessed.set(prop, target[prop]) : accessed.add(prop);
        }
        const val = target[prop];
        return typeof val == "object" && val != null ? new Proxy(val, this) : val;
      }
    });

    try {
      const scope = engine.createScope({
        $,
        state: trackProxy,
        event: {},
        el,
        html,
        get,
        post,
        put,
        patch,
        del,
        refs: Object.fromEntries(HELIUM.refs)
      });
      compiled.execute(scope);
    } catch {}

    return excludeChanged ? [...accessed.keys()].filter(prop => state[prop] === accessed.get(prop)) : [...accessed];
  };

  // Get dependencies - use getIds() if available, otherwise fall back to proxy tracking
  // Note: When excludeChanged is true, we always use proxy tracking because getIds()
  // doesn't distinguish between read and write operations, which can cause infinite loops
  // when expressions both read and write state (e.g., @effect="lastSeen = count")
  const getDependencies = (compiled, el, excludeChanged = false) => {
    if (compiled.getIds && !excludeChanged) {
      return compiled.getIds([]);
    }
    return trackDependenciesProxy(compiled, el, excludeChanged);
  };

  const cleanup = el => {
      [el,...el.querySelectorAll('*')].forEach(e => {
        HELIUM.listeners.get(e)?.forEach(({receiver,event,handler}) => receiver.removeEventListener(event,handler));
        HELIUM.listeners.delete(e);
      });
    };

  async function processElements(element) {
      const newBindings = [];
      const deferredBindings = [];

     const heElements = [element, ...element.querySelectorAll("*")].filter(e => {
        if (HELIUM.processed.has(e)) return false;
        for (let i = 0; i < e.attributes.length; i++) {
          const n = e.attributes[i].name;
          if (n[0] === '@' || n[0] === ':' || n.startsWith('data-he')) return true;
        }
        return false;
      });

      const addBinding = (val, b) => {
        HELIUM.bindings.set(val, b.calc ? [b,...(HELIUM.bindings.get(val) || [])] : [...(HELIUM.bindings.get(val) || []), b]);
        b.calc ? newBindings.unshift(b) : newBindings.push(b);
      };

      const importPromises = [];

      heElements.forEach((el) => {
        const importAttr = el.getAttribute("@import") || el.getAttribute('data-he-import');
        if (importAttr) {
          importAttr.split(",").map((m) => m.trim()).forEach((moduleName) => {
              // Build path: use as-is for URLs, otherwise resolve relative to document location
              const isUrl = moduleName.startsWith("http://") || moduleName.startsWith("https://");
              const hasExtension = moduleName.endsWith(".js");
              const hasPathPrefix = moduleName.startsWith("/") || moduleName.startsWith("./") || moduleName.startsWith("../");
              const relativePath = (isUrl || hasPathPrefix ? "" : "./") + moduleName + (isUrl || hasExtension ? "" : ".js");
              const path = isUrl ? moduleName : new URL(relativePath, location.href).href;
              importPromises.push(
                import(path)
                  .then((module) => {
                    Object.keys(module).forEach(
                      (key) => (state[key] = module[key]),
                    );
                  })
                  .catch((error) => {
                    console.error(
                      `Failed to import module: ${path}`,
                      error.message,
                    );
                  }),
              );
            });
        }
      });

      if (importPromises.length > 0) await Promise.all(importPromises);

      heElements.forEach(el => {
        HELIUM.processed.add(el);

        const attrs = el.attributes;
        const execExpr = v => {
          const compiled = compile(v, true);
          const scope = createScope(el);
          return compiled.execute(scope);
        };
        const inputType = el.type?.toLowerCase();
        const isCheckbox = inputType == "checkbox", isRadio = inputType == "radio", isSelect = el.tagName == "SELECT";

        // Single loop through attributes with early skipping
        for (let i = 0; i < attrs.length; i++) {
          const {name, value} = attrs[i];

          // Skip non-helium attributes early
          if (name[0] !== '@' && name[0] !== ':' && !name.startsWith('data-he')) continue;

          // Initialize state first if needed (skip reserved words, only if not already set)
          if (match(name, "text", "html", "bind") && isValidIdentifier(value) && !RESERVED.has(value) && state[value] == null) {
            state[value] = match(name, "bind") ? (el.type == "checkbox" ? el.checked : tryNum(el.value)) : tryNum(el.textContent);
          }

          // Process the attribute
          if (name === "@data" || name === 'data-he') {
            Object.assign(state, evalExpr(value));
          }
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
            const event = (isCheckbox || isRadio || isSelect) ? "change" : "input";
            const prop = isCheckbox ? "checked" : "value";
            const inputHandler = e => state[value] = isCheckbox ? e.target.checked : e.target.value;
            el.addEventListener(event, inputHandler);
            if (!HELIUM.listeners.has(el)) HELIUM.listeners.set(el, []);
            HELIUM.listeners.get(el).push({receiver: el, event, handler: inputHandler});
            deferredBindings.push({el, prop, compiled: compile(value, true), isRadio});
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
            if (!(calcName in state)) state[calcName] = undefined;  // Initialize so other bindings can reference it
            deferredBindings.push({el, calc: calcName, prop: null, compiled: compile(value, true)});
          }
          else if (match(name, "effect")) {
            deferredBindings.push({el, prop: null, compiled: compile(value, true), keys: name.split(":").slice(1)});
          }
          else if (match(name, "init")) {
            inits.push({ compiled: compile(value, true), el });
          }
          else if (name.startsWith("@") || name.startsWith('data-he')) {
            const fullName = name.startsWith("@") ? name.slice(1) : name.slice(8);
            const [eventName, ...mods] = fullName.split(".");
            const isHttpMethod = ["get", "post", "put", "patch", "delete"].includes(eventName);
            const event = isHttpMethod ? getEvent(el) : eventName;
            const receiver = mods.includes("outside") || mods.includes("document") ? document : el;
            const debounceMod = mods.find(m => m.startsWith("debounce"));
            const debounceDelay = debounceMod ? (t => t && !isNaN(t) ? Number(t) : 300)(debounceMod.split(":")[1]) : 0;
            const _handler = e => {
              if (mods.includes("prevent")) e.preventDefault();
              if (mods.includes("stop")) e.stopPropagation();
              for (const [mod, prop] of Object.entries(KEY_MODS)) if (mods.includes(mod) && !e[prop]) return;
              if (["keydown", "keyup", "keypress"].includes(event)) {
                const last = mods[mods.length - 1];
                if (last && !["prevent", "once", "outside", "document", "stop"].includes(last) && !last.startsWith("debounce") && !Object.keys(KEY_MODS).includes(last)) {
                  const keyName = e.key == " " ? "Space" : e.key == "Escape" ? "Esc" : e.key;
                  if (keyName.toLowerCase() !== last.toLowerCase()) return;
                }
              }
              if (!mods.includes("outside") || !el.contains(e.target)) {
                if (isHttpMethod) {
                  const getAttr = a => el.getAttribute('data-he-' + a) || el.getAttribute('@' + a);
                  const pairs = (getAttr('target') || "").split(",").map(p => p.split(":").map(s => s.trim()));
                  const target = pairs.map(([target]) => target);
                  const action = pairs.map(([, action]) => action);
                  const options = {
                    ...(getAttr("options") && evalExpr(getAttr("options") || "{}")),
                    ...(target && { target }),
                    ...(action && { action }),
                    ...(getAttr("template") && { template: execExpr(getAttr("template")),}),
                    ...(getAttr("loading") && { loading: execExpr(getAttr("loading"))}),
                  };
                  let paramsAttr = getAttr("params");
                  if (!paramsAttr && el.hasAttribute("name")) {
                    const keys = el.getAttribute("name").match(/\w+/g).map(key => `${key}:`).join``;
                    paramsAttr = keys + (isCheckbox ? "checked" : "value");
                  } else paramsAttr ||= "{}";
                  if (!paramsAttr.trim().startsWith("{") && paramsAttr.includes(":")) {
                    const props = paramsAttr.split(":").map(s => s.trim());
                    paramsAttr = props.reduceRight((acc, key, i) => `{ ${key}: ${i == 1 ? `'${el[acc]}'` : acc} }`);
                  }
                  const scope = createScope(el, e);
                  const paramsCompiled = compile(paramsAttr, true);
                  const params = paramsCompiled.execute(scope);
                  ajax(value, eventName.toUpperCase(), options, params);
                } else {
                  const scope = createScope(el, e);
                  const compiled = compile(value, true);
                  compiled.execute(scope);
                }
              }
              if (mods.includes("once")) receiver.removeEventListener(event, handler);
            };
            const handler = debounceDelay > 0 ? debounce(_handler, debounceDelay) : _handler;
            const eventOptions = mods.includes("once") ? { once: true } : undefined;
            receiver.addEventListener(event, handler, eventOptions);
            if (!HELIUM.listeners.has(el)) HELIUM.listeners.set(el, []);
            HELIUM.listeners.get(el).push({receiver, event, handler});
          }
        }
      });
      deferredBindings.forEach(b => {
        const tracked = b.keys?.includes("*") ? [ALL] : getDependencies(b.compiled, b.el, true).concat(b.keys || []);
        tracked.forEach(key => addBinding(key, b));
        // If no dependencies were found, still apply the binding once (for literals like @text="true")
        if (tracked.length === 0) {
          newBindings.push(b);
        }
      })
      return newBindings;
    }

    // Disconnect old observer if exists, then create new one
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

  // Teardown function
  function heliumTeardown() {
    if (HELIUM?.observer) HELIUM.observer.disconnect();
    HELIUM = null;
  }

  return { helium, heliumTeardown };
}

// Create default instance for backwards compatibility
const { helium: defaultHelium, heliumTeardown: _defaultTeardown } = createHelium();

// Flag to disable default auto-init (used by helium-csp.js and other variants)
let defaultDisabled = false;

// Wrapped teardown that also prevents future auto-init
function defaultTeardown() {
  defaultDisabled = true;
  _defaultTeardown();
}

// Setup browser globals and auto-initialization
if (typeof window !== 'undefined') {
  window.helium = defaultHelium;
  window.heliumTeardown = defaultTeardown;
}

// Initialize on load
if (typeof document !== 'undefined') {
  document.addEventListener("DOMContentLoaded",_ => !defaultDisabled && defaultHelium());
  // Turbo integration
  document.addEventListener("turbo:before-render",_ => defaultTeardown());
  document.addEventListener("turbo:render",_ => !defaultDisabled && defaultHelium());
}

export { defaultTeardown };
export default defaultHelium;

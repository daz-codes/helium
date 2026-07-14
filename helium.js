// Coerce attribute/property values without eval: JSON handles numbers/booleans/null/JSON,
// anything else (bare strings) is returned untouched. CSP-safe (no new Function).
const parseEx=v=>{if(typeof v!=="string")return v;try{return JSON.parse(v)}catch{return v}}
const tryNum=v=>{const t=String(v).trim(),n=+t;return t&&!isNaN(n)?n:v}
const isValidIdentifier = v => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(v);
const RESERVED = new Set(['undefined', 'null', 'true', 'false', 'NaN', 'Infinity', 'this', 'arguments']);
const INPUT_EVENTS = { form: "submit", input: "input", textarea:"input", select:"change" };
const KEY_MODS = { shift: "shiftKey", ctrl: "ctrlKey", alt: "altKey", meta: "metaKey" };
// Modifiers that are flags rather than key names; used to find the key mod regardless of order
const FLAG_MODS = new Set(["prevent", "once", "outside", "document", "window", "self", "capture", "passive", "stop"]);
const HTTP_OPTION_ATTRS = new Set([
  "@target", "@params", "@template", "@loading", "@options",
  "data-he-target", "data-he-params", "data-he-template", "data-he-loading", "data-he-options"
]);
const HELIUM_CONFIG_ATTRS = new Set([
  "@helium", "data-helium", "@local-storage", "data-he-local-storage"
]);
const isKeyMod = m => !FLAG_MODS.has(m) && !m.startsWith("debounce") && !m.startsWith("throttle") && !KEY_MODS[m];
const STATE_FIRST_GLOBALS = new Set(["name", "length", "status", "top", "origin", "event", "closed", "parent"]);
const getEvent = el => INPUT_EVENTS[el.tagName.toLowerCase()] || "click";
const debounce=(f,d)=>{let t;const g=(...a)=>(clearTimeout(t),t=setTimeout(f,d,...a));g.cancel=()=>clearTimeout(t);return g}
// Leading + trailing throttle: run the first event immediately, then coalesce
// events during the interval into one final call carrying the latest event.
const throttle=(f,d)=>{let last,t,args;const later=()=>{t=0;last=Date.now();f(...args)};const g=(...a)=>{if(last==null){last=Date.now();return f(...a)}args=a;const wait=d-(Date.now()-last);if(wait<=0){clearTimeout(t);t=0;last=Date.now();return f(...a)}if(!t)t=setTimeout(later,wait)};g.cancel=()=>{clearTimeout(t);t=0};return g}
const looksLikeExpression = value => {
  const v = String(value).trim();
  return /=>|&&|\|\||\?\?/.test(v)
    || /[()[\]{}]/.test(v)
    || /(?:^|\s)[+\-*/%](?:\s|$)/.test(v)
    || /(?:^|\s)(?:={1,3}|!==?|<=?|>=?)(?:\s|$)/.test(v)
    || /\s\?\s/.test(v)
    || /^\s*[`'"]|[`'"]\s*$/.test(v)
    || /\b[$A-Za-z_][\w$]*\s*\.\s*(?:[$A-Za-z_][\w$]*|\s*$)/.test(v)
    || /^[+-]{2}|[+-]{2}$/.test(v);
};
const isReactiveObject = v => {
  if (!v || typeof v !== "object") return false;
  if (Array.isArray(v)) return true;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};
// Reading this symbol through any Helium proxy returns the underlying raw
// object, so row diffing can compare identities across proxy layers.
const RAW = Symbol("raw");
const rawOf = v => (v && typeof v === "object" && v[RAW]) || v;
// @standard-start
const parseFor = value => {
  const match = value.match(/^\s*([\w$]+)(?:\s*,\s*([\w$]+))?\s+in\s+(.+)$/);
  return match && isValidIdentifier(match[1]) && (!match[2] || isValidIdentifier(match[2]))
    ? [match[1], match[2], match[3]] : null;
};
// Indices of a longest increasing subsequence of positions (-1 entries — new
// rows — are never included). Rows on this subsequence keep their DOM order
// between renders, so reordering only moves the rows off it: a swap moves two
// rows instead of re-inserting everything after the first mismatch.
const stableRowIndices = positions => {
  const tails = [], prev = new Array(positions.length).fill(-1);
  positions.forEach((pos, i) => {
    if (pos === -1) return;
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      positions[tails[mid]] < pos ? lo = mid + 1 : hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  });
  const stable = new Set();
  for (let i = tails.length ? tails[tails.length - 1] : -1; i !== -1; i = prev[i]) stable.add(i);
  return stable;
};
let SSEHandler = null;
const registerSSE = handler => SSEHandler = handler;
// @standard-end

// Default expression engine using new Function()
const defaultEngine = {
  diagnosticName: "standard",

  compile(expr, withReturn = true) {
    try {
      const fn = new Function(
        "$ctx",
        withReturn
          ? `with($ctx){with($ctx.$data){return(${expr.trim()})}}`
          : `with($ctx){with($ctx.$data){${expr.trim()}}}`
      );
      return {
        execute: (scope) => fn(scope),
        getIds: null  // Will use trackDependencies instead
      };
    } catch (error) {
      return {
        execute: () => expr,
        getIds: null,
        error
      };
    }
  },

  createScope(ctx) {
    return {
      $: ctx.$,
      $data: ctx.state,
      $event: ctx.event,
      $el: ctx.el,
      $root: ctx.rootElement,
      $scope: ctx.scopeElement,
      $refs: ctx.pluralRefs,
      $dispatch: ctx.dispatch,
      $html: ctx.html,
      // @standard-start
      $get: ctx.get,
      $post: ctx.post,
      $put: ctx.put,
      $patch: ctx.patch,
      $delete: ctx.del,
      // @standard-end
      ...ctx.refs
    };
  }
};

// Factory function to create helium with custom engine
export function createHelium(options = {}) {
  const engine = options.engine ?? defaultEngine;
  const engineName = engine.diagnosticName || "helium";
  // @standard-start
  const configuredSSE = options.sse;
  // @standard-end
  const configuredRoot = options.root;

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
    const root = (typeof configuredRoot === "string" ? document.querySelector(configuredRoot) : configuredRoot)
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
      proxyCache: new WeakMap(),
      warnedCompiles: new Set()
      // @standard-start
      ,
      dataDirectives: new WeakMap(),
      dataBaselines: new WeakMap(),
      scopes: new WeakMap()
      // @standard-end
    };
    HELIUM.root = root;

    const html = s => Object.assign(document.createElement("template"),{innerHTML:String(s).trim()}).content.firstChild

    // @standard-start
    const update = (data,targets,actions,template,elCtx=root) => {
      if (!isCurrent()) return [];
      const newTargets = [];
      (targets || []).forEach((target,i) => {
      const element = target instanceof Node ? target : (resolveRefs(elCtx, target.trim())[0] || document.querySelector(target.trim()));
        if(element){
          const content = template ? template(data) : data;
          const action = actions?.[i];
          if (action) {
            const htmlContent = html(content);  // only build a node when an action needs one
            element[action=="replace"?"replaceWith":action](htmlContent);
            newTargets.push(htmlContent);
          } else {
            element.innerHTML = content;
            newTargets.push(element);
          }
        } else state[target] = data
      })
      return newTargets
    }

  const ajax = (url,method,options={},params={},elCtx=root) => {
      if(options.loading) {
        const loadingTargets = update(options.loading,options.target,options.action,undefined,elCtx);
        if(loadingTargets.length) options.target = loadingTargets;
      }
      const fd = params instanceof FormData, token = document.querySelector('meta[name="csrf-token"]')?.content;
      const path = new URL(url, window.location.href);
      const sameOrigin = path.origin === window.location.origin;

      // GET requests can't carry a body — encode non-FormData params into the
      // query string instead of silently discarding them.
      let requestUrl = url;
      if (method === "GET" && !fd && params && typeof params === "object") {
        const qs = new URLSearchParams(params).toString();
        if (qs) requestUrl += (url.includes("?") ? "&" : "?") + qs;
      }

      const doFetch = (lastEventId) => fetch(requestUrl, {
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
          // Surface HTTP error statuses instead of treating them as success.
          // (res.ok is always a boolean on a real Response; it's only undefined
          // under lightweight test mocks, which we treat as success.)
          if (res.ok === false) {
            const err = new Error(`HTTP ${res.status}${res.statusText ? " " + res.statusText : ""}`);
            err.status = res.status;
            err.response = res;
            throw err;
          }
          const type = res.headers.get("content-type") || "";
          if (type.includes("event-stream")) {
            const handler = configuredSSE || SSEHandler;
            if (!handler) throw new Error("SSE support requires @daz4126/helium/sse");
            return handler(res, options, doFetch, (...args) => update(...args, elCtx), isCurrent);
          }
          return (type.includes("turbo-stream") ? res.text().then(data => ({ turbo: true, data })) :
                  type.includes("json")         ? res.json() :
                                                  res.text());
        }).then(data => {
          if (data === undefined) return; // SSE handled separately
          return (data && typeof data === "object" && data.turbo && window.Turbo)
            ? Turbo.renderStreamMessage(data.data)
            : update(data, options.target, options.loading ? (options.action || []).map(a => a && "replace") : options.action, options.template, elCtx)
        });

      // Return the promise so callers can await, chain, and handle errors.
      // The terminal .catch lives at the call sites (fire-and-forget vs. awaited).
      return doFetch(null);
    }

    const opts = o => typeof o === "string" ? { target: [o], action: [null] } : o;
    const get = (url, options={}, elCtx=root) => ajax(url, "GET", opts(options), {}, elCtx);
    const [post, put, patch, del] = ["POST","PUT","PATCH","DELETE"].map(method =>
      (url, params, options={}, elCtx=root) => ajax(url, method, opts(options), params, elCtx));
    // @standard-end

    // Track bindings currently being applied to prevent infinite recursion
    const applyingBindings = new Set();

    // Ref snapshots are cached per explicit local scope and invalidated whenever
    // a ref is added or removed. Each name maps to a Set so repeated refs retain
    // element identity while plural access can return current DOM order.
    let refsRevision = 0;
    const refsSnapshots = new WeakMap();

    const safeApplyBinding = (b) => {
      if ((b.el !== root && !root.contains(b.el)) || applyingBindings.has(b)) return;
      applyingBindings.add(b);
      try {
        applyBinding(b);
      } finally {
        applyingBindings.delete(b);
      }
    };

    // Batch binding updates into one microtask flush: a burst of synchronous
    // mutations (state.a = 1; state.b = 2; item edits in a loop) runs each
    // affected binding once instead of re-rendering per assignment. Cascades —
    // a flushed binding writing more state, e.g. @calculate — are drained in
    // the same flush; the pass guard bails out of infinite update loops.
    let dirtyKeys = new Set();
    // Raw objects mutated during the current burst; lets renderFor re-run only
    // the rows whose item actually changed. Cleared when the flush drains.
    let dirtyObjects = new Set();
    let flushScheduled = false;
    const flushBindings = () => {
      let passes = 0;
      while (dirtyKeys.size && isCurrent()) {
        if (++passes > 100) {
          dirtyKeys.clear();
          console.error("Helium: infinite update loop — bindings kept writing state for 100 consecutive passes");
          break;
        }
        const keys = dirtyKeys;
        dirtyKeys = new Set();
        // Computed/structural bindings (calc, loop, cond) run before plain ones,
        // mirroring their front-of-list registration in updateBindingDependencies.
        const run = new Set();
        keys.forEach(k => HELIUM.bindings.get(k)?.forEach(b => { if (b.calc || b.loop || b.cond) run.add(b); }));
        keys.forEach(k => HELIUM.bindings.get(k)?.forEach(b => run.add(b)));
        run.forEach(safeApplyBinding);
      }
      dirtyObjects.clear();
      flushScheduled = false;
    };
    const enqueueBindings = keys => {
      keys.forEach(k => dirtyKeys.add(k));
      dirtyKeys.add(ALL);
      if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(flushBindings);
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
      if (p === RAW) return t;
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
        // Same-value writes don't re-trigger bindings. Besides skipping wasted
        // work, this lets self-writing cascades converge: a wildcard @effect
        // that assigns an unchanged value stops re-enqueueing itself.
        const changed = !Object.is(Reflect.get(t,p), v);
        const res = Reflect.set(t,p,v);
        if (!isCurrent() || !changed) return res;
        // Collect this property plus every ancestor key reachable through the
        // parent graph, so deeply-nested mutations (user.address.city) re-trigger
        // ancestor bindings. BFS with a visited set handles shared refs and cycles;
        // the key set de-dups so each binding runs at most once per mutation.
        const keys = new Set([p]);
        const seen = new Set();
        dirtyObjects.add(t);
        let frontier = HELIUM.parentKeys.get(t) || [];
        while (frontier.length) {
          const next = [];
          for (const { key, parent } of frontier) {
            keys.add(key);
            if (parent && !seen.has(parent)) {
              seen.add(parent);
              dirtyObjects.add(parent);
              const pe = HELIUM.parentKeys.get(parent);
              if (pe) next.push(...pe);
            }
          }
          frontier = next;
        }
        enqueueBindings(keys);
        saveState?.();
        return res
      },
      deleteProperty: (t, p) => {
        if (!Reflect.has(t, p)) return true;
        const res = Reflect.deleteProperty(t, p);
        if (res && isCurrent()) {
          enqueueBindings([p]);
          saveState?.();
        }
        return res;
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

    // @standard-start
    const scopesFor = (el, extraScope) => {
      const scopes = extraScope ? [extraScope] : [];
      for (; el; el = el.parentNode) {
        const elementScopes = HELIUM.scopes.get(el);
        if (elementScopes) scopes.push(...elementScopes.slice().reverse());
      }
      return scopes;
    };

    const own = (values, prop) => Object.prototype.hasOwnProperty.call(values, prop);
    const ownerFor = (scopes, prop) => scopes.find(scope => own(scope.values, prop));
    const scopeToken = (scope, prop) => {
      if (!scope.tokens.has(prop)) scope.tokens.set(prop, { scope, prop });
      return scope.tokens.get(prop);
    };
    const trigger = dependency => enqueueBindings([dependency]);
    const createLocalValues = (source, scope) => {
      const target = { ...source };
      const nested = new WeakMap();
      const roots = new WeakMap();
      const wrap = (value, rootKey) => {
        if (!isReactiveObject(value)) return value;
        let keys = roots.get(value);
        if (!keys) roots.set(value, keys = new Set());
        keys.add(rootKey);
        if (nested.has(value)) return nested.get(value);
        const proxy = new Proxy(value, {
          get(target, prop, receiver) {
            if (prop === RAW) return rawOf(target);
            let child = Reflect.get(target, prop, receiver);
            roots.get(target).forEach(key => child = wrap(child, key));
            return child;
          },
          set(target, prop, value, receiver) {
            const result = Reflect.set(target, prop, value, receiver);
            dirtyObjects.add(rawOf(target));
            roots.get(target).forEach(key => trigger(scopeToken(scope, key)));
            return result;
          }
        });
        nested.set(value, proxy);
        return proxy;
      };
      return new Proxy(target, {
        get(target, prop, receiver) {
          if (prop === RAW) return target;
          return wrap(Reflect.get(target, prop, receiver), prop);
        },
        set(target, prop, value, receiver) {
          const result = Reflect.set(target, prop, value, receiver);
          trigger(scopeToken(scope, prop));
          return result;
        }
      });
    };
    const createLocalScope = (source, owner = null) => {
      const scope = { values: null, tokens: new Map(), owner };
      scope.values = createLocalValues(source, scope);
      return scope;
    };
    const addScope = (el, scope) => HELIUM.scopes.set(el, [...(HELIUM.scopes.get(el) || []), scope]);
    // @standard-end
    const setStateValue = (el, prop, value) => {
      // Dotted paths ("user.name") walk to the parent object through the
      // reactive proxies, so the leaf assignment triggers bindings as usual.
      const path = prop.split(".").map(s => s.trim());
      const last = path.pop();
      let target = state;
      // @standard-start
      const owner = ownerFor(scopesFor(el), path[0] ?? last);
      if (owner) target = owner.values;
      // @standard-end
      for (const key of path) target = target?.[key];
      if (!target || typeof target !== "object") {
        console.error(`Helium: cannot set "${prop}" — "${path.join(".")}" is not an object`);
        return false;
      }
      return Reflect.set(target, last, value);
    };

    // Standard overlays the nearest element scope on the mounted root; the
    // generated Lite build leaves this as the root-only state view.
    const scopeElementFor = el => {
      // @standard-start
      for (let current = el; current && current !== root.parentNode; current = current.parentNode) {
        const elementScopes = HELIUM.scopes.get(current) || [];
        for (let i = elementScopes.length - 1; i >= 0; i--) {
          if (elementScopes[i].owner) return elementScopes[i].owner;
        }
        if (current === root) break;
      }
      // @standard-end
      return root;
    };
    const scopeChainFor = el => {
      const chain = [];
      let current = scopeElementFor(el);
      while (current) {
        chain.push(current);
        if (current === root) break;
        current = scopeElementFor(current.parentNode);
      }
      return chain;
    };
    const refsInScope = (name, scopeEl) => [...(HELIUM.refs.get(name) || [])]
      .filter(ref => (ref === root || root.contains(ref)) && scopeElementFor(ref) === scopeEl)
      .sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    const resolveRefs = (el, name) => {
      const key = name.startsWith("$") ? name : `$${name}`;
      for (const scopeEl of scopeChainFor(el)) {
        const refs = refsInScope(key, scopeEl);
        if (refs.length) return refs;
      }
      return [];
    };
    const refScopeFor = el => {
      const scopeEl = scopeElementFor(el);
      const cached = refsSnapshots.get(scopeEl);
      if (cached?.revision === refsRevision) return cached;
      const singular = {};
      for (const name of HELIUM.refs.keys()) {
        const refs = resolveRefs(el, name);
        if (!refs.length) continue;
        singular[name] = refs[0];
      }
      // Plural refs are resolved live so missing names consistently return []
      // and mutating a returned array cannot corrupt later lookups.
      const plural = new Proxy({}, {
        get: (_, name) => typeof name === "string" ? resolveRefs(scopeEl, name) : undefined
      });
      const snapshot = { revision: refsRevision, singular, plural };
      refsSnapshots.set(scopeEl, snapshot);
      return snapshot;
    };
    const queryHelpers = new WeakMap();
    const queryFor = el => {
      const scopeEl = scopeElementFor(el);
      if (queryHelpers.has(scopeEl)) return queryHelpers.get(scopeEl);
      const helpers = selector => document.querySelector(selector);
      helpers.all = selector => [...document.querySelectorAll(selector)];
      helpers.root = selector => root.querySelector(selector);
      helpers.root.all = selector => [...root.querySelectorAll(selector)];
      helpers.scope = selector => scopeEl.querySelector(selector);
      helpers.scope.all = selector => [...scopeEl.querySelectorAll(selector)];
      queryHelpers.set(scopeEl, helpers);
      return helpers;
    };

    const createScope = (el, event = {}, scopeState = state, extraScope, accessed) => {
      let scopedState = scopeState;
      // @standard-start
      const scopes = scopesFor(el, extraScope);
      if (scopes.length) scopedState = new Proxy(scopeState, {
          has: (target, prop) => !!ownerFor(scopes, prop) || Reflect.has(target, prop),
          get: (target, prop, receiver) => {
            const owner = ownerFor(scopes, prop);
            if (!owner) return Reflect.get(target, prop, receiver);
            const value = owner.values[prop];
            accessed?.set(scopeToken(owner, prop), value);
            return value;
          },
          set: (target, prop, value, receiver) => {
            const owner = ownerFor(scopes, prop);
            return owner ? Reflect.set(owner.values, prop, value) : Reflect.set(target, prop, value, receiver);
          }
        });
      // @standard-end
      const refScope = refScopeFor(el);
      return engine.createScope({
        $: queryFor(el),
        state: scopedState,
        event,
        el,
        rootElement: root,
        scopeElement: scopeElementFor(el),
        pluralRefs: refScope.plural,
        dispatch: (name, detail = {}, options = {}) => {
          const dispatched = new CustomEvent(name, {
            detail,
            bubbles: options.bubbles ?? true,
            cancelable: options.cancelable ?? true
          });
          (options.target || el).dispatchEvent(dispatched);
          return dispatched;
        },
        html,
        // @standard-start
        get: (url, options) => get(url, options, el),
        post: (url, params, options) => post(url, params, options, el),
        put: (url, params, options) => put(url, params, options, el),
        patch: (url, params, options) => patch(url, params, options, el),
        del: (url, params, options) => del(url, params, options, el),
        // @standard-end
        refs: refScope.singular
      });
    };

    // Compile expression with caching
    const compileContext = ctx => typeof ctx === "string" ? { label: ctx } : (ctx || {});
    const describeCompileContext = ctx => [ctx.build || engineName, ctx.label].filter(Boolean).join(" ");
    const warnCompileFailure = (expr, compiled, ctx) => {
      if (!compiled.error || !(ctx.strict || looksLikeExpression(expr))) return;
      const label = describeCompileContext(ctx);
      const key = `${label}:${expr}:${compiled.error.message}`;
      if (HELIUM.warnedCompiles.has(key)) return;
      HELIUM.warnedCompiles.add(key);
      console.warn(`Helium expression compile warning${label ? ` [${label}]` : ""}:`, expr, compiled.error.message);
    };

    const compile = (expr, withReturn = true, ctx) => {
      const key = `${withReturn}:${expr}`;
      const context = compileContext(ctx);
      let compiled = HELIUM.fnCache.get(key);
      if (!compiled) {
        compiled = engine.compile(expr, withReturn);
        HELIUM.fnCache.set(key, compiled);
      }
      warnCompileFailure(expr, compiled, context);
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
      HELIUM.bindings.set(key, b.calc || b.loop || b.cond ? [b, ...bindings] : [...bindings, b]);
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
        if (prop === RAW) return rawOf(target);
        const value = Reflect.get(target, prop, receiver);
        if (rootKey === null && typeof prop === "string" && !accessed.has(prop)) accessed.set(prop, value);
        return isReactiveObject(value) ? wrap(value, rootKey ?? prop) : value;
      }
    });

    try {
      const result = b.compiled.execute(createScope(elCtx, event, wrap(state), null, accessed));
      const tracked = [...accessed].filter(([key, value]) => {
        // @standard-start
        if (typeof key !== "string") return key.scope.values[key.prop] === value;
        // @standard-end
        return state[key] === value;
      }).map(([key]) => key);
      let explicitKeys = b.keys || [];
      // @standard-start
      explicitKeys = explicitKeys.map(key => {
        const owner = ownerFor(scopesFor(b.el), key);
        return owner ? scopeToken(owner, key) : key;
      });
      // @standard-end
      const keys = b.keys?.includes("*") ? [ALL] : tracked.concat(explicitKeys);
      updateBindingDependencies(b, keys);
      return { ok: true, result };
    } catch (err) {
      console.error("Helium expression error:", err.message);
      return { ok: false };
    }
  };

  // @standard-start
  // Structural directives hand freshly inserted element nodes straight to
  // processElements in one batch — one traversal for the whole render instead
  // of one MutationObserver round-trip per row. Bindings still apply on the
  // returned microtask, which resolves before the next paint.
  const processNewNodes = nodes => {
    if (!nodes.length) return;
    processElements(nodes).then(({ bindings, inits }) => {
      if (!isCurrent()) return;
      bindings.forEach(safeApplyBinding);
      runInits(inits);
    });
  };

  const renderFor = (b, value) => {
    const loop = b.loop, oldRows = loop[4], nextRows = new Map();
    // Iterate the raw array: per-item reads through the proxy layers are the
    // dominant cost of a large render pass. `source` (the reactive view) is
    // only consulted for the few rows that are created or actually changed.
    const rawItems = rawOf(value);
    const source = rawItems !== value ? value : null;
    const items = Array.from(rawItems || []);
    // One shared scope evaluates non-path :key expressions; building a full
    // local scope per item just to read the key is far too slow on big lists.
    const keyPath = loop[5];
    const keyScope = keyPath ? null : { values: null, tokens: new Map() };
    const keyEvalScope = keyPath ? null : createScope(b.el, {}, state, keyScope);
    // Previous DOM order of surviving rows, for minimal-move reordering below.
    const oldPositions = new Map();
    oldRows.forEach(row => oldPositions.set(row, oldPositions.size));
    const newNodes = [];

    items.forEach((item, index) => {
      // Unwrap elements too: userland arrays ([...items, more]) hold reactive
      // proxies, and row identity must compare raw-to-raw.
      const raw = rawOf(item);
      const values = { [loop[0]]: raw };
      if (loop[1]) values[loop[1]] = index;
      let key;
      if (keyPath) {
        key = values[keyPath[0]];
        for (let k = 1; k < keyPath.length; k++) key = key?.[keyPath[k]];
      } else {
        keyScope.values = values;
        key = loop[2].execute(keyEvalScope);
      }
      if (nextRows.has(key)) return void console.error("Duplicate key:", key);

      // Keep the item→array parent edge fresh (normally recorded by proxy
      // reads) so later in-place writes still reach bindings on the list key.
      if (source && raw && typeof raw === "object") {
        let edges = HELIUM.parentKeys.get(raw);
        if (!edges) HELIUM.parentKeys.set(raw, edges = []);
        const p = String(index);
        if (!edges.some(e => e.key === p && e.parent === rawItems)) edges.push({ key: p, parent: rawItems });
      }

      let row = oldRows.get(key);
      if (row) {
        // Re-run row bindings only when the row's data changed: a different
        // item, a different index, or an in-place mutation recorded in
        // dirtyObjects during this burst. Untouched rows are skipped entirely.
        if (row.item !== raw || dirtyObjects.has(raw)) {
          row.scope.values[loop[0]] = source ? source[index] : item;
        }
        if (loop[1] && row.index !== index) row.scope.values[loop[1]] = index;
      } else {
        // Store the reactive view of the item (not the raw object) so row
        // writes stay visible to bindings outside the row.
        values[loop[0]] = source ? source[index] : item;
        const clone = loop[3].cloneNode(true);
        row = { nodes: [...clone.childNodes], scope: createLocalScope(values) };
        row.nodes.forEach(node => {
          if (node.nodeType === 1) {
            addScope(node, row.scope);
            newNodes.push(node);
          }
        });
      }
      row.item = raw;
      row.index = index;
      nextRows.set(key, row);
    });

    const removedNodes = [];
    oldRows.forEach((row, key) => {
      if (!nextRows.has(key)) row.nodes.forEach(node => {
        if (node.nodeType === 1) removedNodes.push(node);
        node.remove();
      });
    });
    cleanup(removedNodes);
    loop[4] = nextRows;
    // Rows on the longest increasing subsequence of previous positions are
    // already mutually ordered; use them as anchors and move only the rest.
    const rows = [...nextRows.values()];
    const stable = stableRowIndices(rows.map(row => oldPositions.get(row) ?? -1));
    let cursor = b.el;
    rows.forEach((row, i) => row.nodes.forEach(node => {
      if (!stable.has(i) && cursor.nextSibling !== node) cursor.after(node);
      cursor = node;
    }));
    processNewNodes(newNodes);
  };

  const renderIf = (b, value) => {
    const shown = b.cond[1];
    if (value && !shown.length) {
      const nodes = b.cond[1] = [...b.cond[0].cloneNode(true).childNodes];
      // Content lands as siblings of the template, so any row scopes attached
      // to the template itself (a @for row child) must be copied across.
      const scopes = HELIUM.scopes.get(b.el);
      let cursor = b.el;
      nodes.forEach(node => {
        if (node.nodeType === 1 && scopes) HELIUM.scopes.set(node, [...scopes]);
        cursor.after(node);
        cursor = node;
      });
      processNewNodes(nodes.filter(node => node.nodeType === 1));
    } else if (!value && shown.length) {
      cleanup(shown.filter(node => node.nodeType === 1));
      shown.forEach(node => node.remove());
      b.cond[1] = [];
    }
  };
  // @standard-end

  function applyBinding(b,e={},elCtx=b.el){
    const {el,prop,calc,isHiddenAttr}=b;
    const execution = b.initialExecution || executeBinding(b, e, elCtx);
    delete b.initialExecution;
    if (!execution.ok) return;
    const r = execution.result;
    // @standard-start
    if (b.loop) return renderFor(b, r);
    if (b.cond) return renderIf(b, r);
    // @standard-end
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

  // Accepts one element or an array; a batch shares a single pass over the
  // refs and bindings registries, so removing N rows costs one prune, not N.
  const cleanup = els => {
      const removed = new Set();
      (Array.isArray(els) ? els : [els]).forEach(el => {
        removed.add(el);
        el.querySelectorAll('*').forEach(e => removed.add(e));
      });
      if (!removed.size) return;
      removed.forEach(e => {
        const initCleanups = HELIUM.cleanups.get(e);
        HELIUM.cleanups.delete(e);
        initCleanups?.forEach(record => {
          try { record.cleanup(); }
          catch (error) { console.error("Helium cleanup:", error); }
        });
        HELIUM.listeners.get(e)?.forEach(({receiver,event,handler,options}) => {
          handler.cancel?.();
          receiver.removeEventListener(event,handler,options);
        });
        HELIUM.listeners.delete(e);
        HELIUM.processed.delete(e);  // allow reprocessing if the same node is re-inserted
        // @standard-start
        HELIUM.dataDirectives.delete(e);
        HELIUM.dataBaselines.delete(e);
        HELIUM.scopes.delete(e);
        // @standard-end
      });
      for (const [name, ref] of HELIUM.refs) {
        let changed = false;
        for (const element of ref) if (removed.has(element)) changed = ref.delete(element) || changed;
        if (!ref.size) HELIUM.refs.delete(name);
        if (changed) refsRevision++;
      }
      // Prune bindings that reference removed elements, otherwise they leak and keep
      // running on detached nodes every time state changes.
      HELIUM.bindings.forEach((arr, key) => {
        const kept = arr.filter(b => !removed.has(b.el));
        kept.length ? HELIUM.bindings.set(key, kept) : HELIUM.bindings.delete(key);
      });
    };

  const runInits = inits => inits.forEach(({ compiled, el, attr }) => {
    let result;
    try { result = compiled.execute(createScope(el)); }
    catch (err) { return void console.error("Helium @init error:", err.message); }
    if (typeof result === "function") {
      HELIUM.cleanups.set(el, [...(HELIUM.cleanups.get(el) || []), { cleanup: result, attr }]);
    }
  });

  HELIUM.cleanup = cleanup;

  const bindingsFor = predicate => {
    const found = new Set();
    HELIUM.bindings.forEach(bindings => bindings.forEach(binding => {
      if (predicate(binding)) found.add(binding);
    }));
    return found;
  };

  const forgetBinding = binding => {
    if (binding.loop) {
      const nodes = [...binding.loop[4].values()].flatMap(row => row.nodes);
      cleanup(nodes.filter(node => node.nodeType === 1));
      nodes.forEach(node => node.remove());
      binding.loop[4].clear();
    }
    if (binding.cond?.[1].length) {
      const nodes = binding.cond[1];
      cleanup(nodes.filter(node => node.nodeType === 1));
      nodes.forEach(node => node.remove());
      binding.cond[1] = [];
    }
    HELIUM.bindings.forEach((bindings, key) => {
      const kept = bindings.filter(candidate => candidate !== binding);
      kept.length ? HELIUM.bindings.set(key, kept) : HELIUM.bindings.delete(key);
    });
  };

  const removeDirective = (el, attr, oldValue) => {
    bindingsFor(binding => binding.el === el && binding.attr === attr).forEach(forgetBinding);

    const listeners = HELIUM.listeners.get(el) || [];
    const keptListeners = [];
    listeners.forEach(record => {
      if (record.attr !== attr) return void keptListeners.push(record);
      record.handler.cancel?.();
      record.receiver.removeEventListener(record.event, record.handler, record.options);
    });
    keptListeners.length ? HELIUM.listeners.set(el, keptListeners) : HELIUM.listeners.delete(el);

    const initCleanups = HELIUM.cleanups.get(el) || [];
    const keptCleanups = [];
    initCleanups.forEach(record => {
      if (record.attr !== attr) return void keptCleanups.push(record);
      try { record.cleanup(); }
      catch (error) { console.error("Helium cleanup:", error); }
    });
    keptCleanups.length ? HELIUM.cleanups.set(el, keptCleanups) : HELIUM.cleanups.delete(el);

    if (match(attr, "ref") && oldValue != null) {
      const key = "$" + oldValue;
      const refs = HELIUM.refs.get(key);
      if (refs?.delete(el)) refsRevision++;
      if (refs && !refs.size) HELIUM.refs.delete(key);
    }

    // @standard-start
    if (match(attr, "data") || attr === "data-he") {
      const dataRecord = HELIUM.dataDirectives.get(el);
      if (el === root && dataRecord) {
        const baseline = HELIUM.dataBaselines.get(el);
        dataRecord.keys.forEach(key => {
          const original = baseline?.get(key);
          if (original?.present) state[key] = original.value;
          else delete state[key];
        });
      } else {
        const scopes = (HELIUM.scopes.get(el) || []).filter(scope => scope.owner !== el);
        scopes.length ? HELIUM.scopes.set(el, scopes) : HELIUM.scopes.delete(el);
      }
      HELIUM.dataDirectives.delete(el);
    }
    // @standard-end
  };

  const refreshSubtreeBindings = el => {
    bindingsFor(binding => binding.el !== el && el.contains(binding.el)).forEach(safeApplyBinding);
    refsRevision++;
  };

  const reconcileDirective = async (el, attr, oldValue) => {
    if (!isCurrent() || (el !== root && !root.contains(el))) return;
    if (HTTP_OPTION_ATTRS.has(attr) || HELIUM_CONFIG_ATTRS.has(attr)) return;

    let directive = attr;
    if (attr === ":key") {
      directive = el.hasAttribute("@for") ? "@for"
        : el.hasAttribute("data-he-for") ? "data-he-for" : null;
      if (!directive) return;
    }

    removeDirective(el, directive, attr === ":key" ? el.getAttribute(directive) : oldValue);
    if (el.hasAttribute(directive)) {
      const { bindings, inits } = await processElements(el, new Set([directive]));
      if (!isCurrent() || (el !== root && !root.contains(el))) return;
      bindings.forEach(safeApplyBinding);
      runInits(inits);
    }
    // @standard-start
    if (match(directive, "data") || directive === "data-he") refreshSubtreeBindings(el);
    // @standard-end
  };

  async function processElements(element, onlyAttributes = null) {
      const newBindings = [];
      const deferredBindings = [];
      const newInits = [];

      // Accepts one root element or an array of roots (structural directives
      // insert many sibling rows at once — one pass beats one call per row).
      const roots = Array.isArray(element) ? element : [element];
      const heElements = roots.flatMap(el => [el, ...el.querySelectorAll("*")]).filter(e => {
        if (onlyAttributes) return roots.includes(e);
        if (HELIUM.processed.has(e)) return false;
        for (let i = 0; i < e.attributes.length; i++) {
          const n = e.attributes[i].name;
          if (n[0] === '@' || n[0] === ':' || n.startsWith('data-he')) return true;
        }
        return false;
      });
      // Mark the roots themselves (even attribute-less ones) so the
      // MutationObserver skips nodes a structural render already handed to us.
      roots.forEach(el => HELIUM.processed.add(el));

      // @standard-start
      const importPromises = [];

      heElements.forEach((el) => {
        const importName = ["@import", "data-he-import"].find(name =>
          (!onlyAttributes || onlyAttributes.has(name)) && el.hasAttribute(name));
        const importAttr = importName ? el.getAttribute(importName) : null;
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
      // @standard-end
      if (!isCurrent()) return { bindings: [], inits: [] };

      heElements.forEach(el => {
        // @standard-start
        const dataName = ["@data", "data-he-data", "data-he"].find(name =>
          (!onlyAttributes || onlyAttributes.has(name)) && el.hasAttribute(name));
        const dataAttr = dataName ? el.getAttribute(dataName) : null;
        if (dataAttr != null) {
          try {
            const values = compile(dataAttr, true, { label: "@data", strict: true }).execute(createScope(el));
            if (!isReactiveObject(values) || Array.isArray(values)) {
              console.warn("Helium @data expects an object:", dataAttr);
            } else if (el === root) {
              let baseline = HELIUM.dataBaselines.get(el);
              if (!baseline) HELIUM.dataBaselines.set(el, baseline = new Map());
              Object.keys(values).forEach(key => {
                if (!baseline.has(key)) baseline.set(key, {
                  present: Object.prototype.hasOwnProperty.call(state, key),
                  value: rawOf(state[key])
                });
              });
              Object.assign(state, values);
            } else addScope(el, createLocalScope(values, el));
            HELIUM.dataDirectives.set(el, { attr: dataName, keys: new Set(Object.keys(values)) });
          } catch (error) {
            console.warn("Helium @data error:", error.message);
          }
        }
        // @standard-end
        HELIUM.processed.add(el);

        const attrs = el.attributes;
        // @standard-start
        const execExpr = v => {
          const compiled = compile(v, true, { label: "HTTP option", strict: true });
          const scope = createScope(el);
          return compiled.execute(scope);
        };
        // @standard-end
        const inputType = el.type?.toLowerCase();
        const isCheckbox = inputType == "checkbox", isRadio = inputType == "radio", isSelect = el.tagName == "SELECT";
        // @standard-start
        const forValue = el.getAttribute("@for") ?? el.getAttribute("data-he-for");
        // @standard-end

        // Single loop through attributes with early skipping
        for (let i = 0; i < attrs.length; i++) {
          const {name, value} = attrs[i];

          // Skip non-helium attributes early
          if (name[0] !== '@' && name[0] !== ':' && !name.startsWith('data-he')) continue;
          if (onlyAttributes && !onlyAttributes.has(name)) continue;
          // @standard-start
          if (name === ":key" && forValue != null) continue;
          // @standard-end

          // Initialize state first if needed (skip reserved words, only if not already set)
          let hasLocalValue = false;
          // @standard-start
          hasLocalValue = !!ownerFor(scopesFor(el), value);
          // @standard-end
          if (match(name, "text", "html", "bind") && isValidIdentifier(value) && !RESERVED.has(value) && !hasLocalValue && state[value] == null) {
            state[value] = match(name, "bind") ? (el.type == "checkbox" ? el.checked : tryNum(el.value)) : tryNum(el.textContent);
          }

          // Process the attribute
          // @data alias is data-he-data (matching every other directive); the
          // bare data-he form is kept for backwards compatibility.
          if (match(name, "data") || name === 'data-he') {
            // @standard-start
            continue;
            // @standard-end
            Object.assign(state, evalExpr(value));
          }
          else if (match(name, "import") || HELIUM_CONFIG_ATTRS.has(name)) continue;
          // @standard-start
          else if (match(name, "for")) {
            const spec = parseFor(value), keyExpr = el.getAttribute(":key");
            if (el.tagName !== "TEMPLATE" || !spec || !keyExpr) {
              console.error("Invalid @for/:key");
            } else {
              // A :key that is a plain path rooted at a loop alias ("item.id")
              // is read directly per row, skipping the expression engine.
              const keyPath = /^[\w$]+(\.[\w$]+)*$/.test(keyExpr.trim()) ? keyExpr.trim().split(".") : null;
              deferredBindings.push({
                el,
                attr: name,
                prop: null,
                compiled: compile(spec[2], true, { label: "@for", strict: true }),
                loop: [spec[0], spec[1], compile(keyExpr, true, { label: ":key", strict: true }), el.content.cloneNode(true), new Map(),
                  keyPath && (keyPath[0] === spec[0] || keyPath[0] === spec[1]) ? keyPath : null]
              });
            }
          }
          else if (match(name, "if")) {
            if (el.tagName !== "TEMPLATE" || forValue != null) {
              console.error("@if requires a <template> element without @for");
            } else {
              deferredBindings.push({el, attr: name, prop: null, compiled: compile(value, true, { label: "@if", strict: true }), cond: [el.content.cloneNode(true), []]});
            }
          }
          // @standard-end
          // Lite ignores the structural directives it doesn't implement rather
          // than registering them as event listeners.
          else if (match(name, "for", "if")) continue;
          else if (name.startsWith(":") || name.startsWith('data-he-attr:')) {
            const propName = name.startsWith(":") ? name.slice(1) : name.slice(13);
            deferredBindings.push({el, attr: name, prop: propName, compiled: compile(value, true, { label: name })});
          }
          else if (match(name, "ref")) {
            const key = "$" + value;
            if (!HELIUM.refs.has(key)) HELIUM.refs.set(key, new Set());
            if (!HELIUM.refs.get(key).has(el)) {
              HELIUM.refs.get(key).add(el);
              refsRevision++;
            }
          }
          else if (match(name, "text", "html")) {
            deferredBindings.push({el, attr: name, prop: match(name, "text") ? "textContent" : "innerHTML", compiled: compile(value, true, { label: name })});
          }
          else if (match(name, "bind")) {
            const event = (isCheckbox || isRadio || isSelect || name.includes(".lazy")) ? "change" : "input";
            const prop = isCheckbox ? "checked" : "value";
            const toBound = v => (v = name.includes(".trim") ? v.trim() : v,
              name.includes(".number") && v !== "" && !isNaN(+v) ? +v : v);
            const inputHandler = e => setStateValue(el, value, isCheckbox ? e.target.checked : toBound(e.target.value));
            el.addEventListener(event, inputHandler);
            if (!HELIUM.listeners.has(el)) HELIUM.listeners.set(el, []);
            HELIUM.listeners.get(el).push({receiver: el, event, handler: inputHandler, attr: name});
            deferredBindings.push({el, attr: name, prop, compiled: compile(value, true, { label: name })});
            if (isCheckbox) el.checked = !!state[value];
            else if (isRadio) el.checked = el.value == state[value];
            else el.value = state[value] ?? "";
          }
          else if (match(name, "hidden", "visible")) {
            const isHidden = match(name, "hidden");
            deferredBindings.push({el, attr: name, prop: "hidden", compiled: compile(value, true, { label: name, strict: true }), isHiddenAttr: isHidden});
          }
          else if (match(name, "calculate")) {
            const calcName = name.split(":")[1];
            let calcOwner = null;
            // @standard-start
            calcOwner = ownerFor(scopesFor(el), calcName);
            // @standard-end
            if (!calcOwner && !(calcName in state)) state[calcName] = undefined;  // Initialize so other bindings can reference it
            deferredBindings.push({el, attr: name, calc: calcName, prop: null, compiled: compile(value, true, { label: name, strict: true })});
          }
          else if (match(name, "effect")) {
            deferredBindings.push({el, attr: name, prop: null, compiled: compile(value, true, { label: name, strict: true }), keys: name.split(":").slice(1)});
          }
          else if (match(name, "init")) {
            newInits.push({ compiled: compile(value, true, { label: name, strict: true }), el, attr: name });
          }
          else if (HTTP_OPTION_ATTRS.has(name)) continue;
          else if (name.startsWith("@") || name.startsWith('data-he')) {
            const fullName = name.startsWith("@") ? name.slice(1) : name.slice(8);
            const [eventName, ...mods] = fullName.split(".");
            let event = eventName;
            // @standard-start
            const isHttpMethod = ["get", "post", "put", "patch", "delete"].includes(eventName);
            if (isHttpMethod) event = getEvent(el);
            // @standard-end
            if (mods.includes("passive") && mods.includes("prevent")) {
              const key = `event-options:${name}`;
              if (!HELIUM.warnedCompiles.has(key)) {
                HELIUM.warnedCompiles.add(key);
                console.warn(`Helium event modifier warning [${name}]: .passive and .prevent cannot be combined`);
              }
              continue;
            }
            const receiver = mods.includes("outside") || mods.includes("document") ? document : mods.includes("window") ? window : el;
            const debounceMod = mods.find(m => m.startsWith("debounce"));
            const debounceDelay = debounceMod ? (t => t && !isNaN(t) ? Number(t) : 300)(debounceMod.split(":")[1]) : 0;
            const throttleMod = mods.find(m => m.startsWith("throttle"));
            const throttleDelay = throttleMod ? (t => t && !isNaN(t) ? Number(t) : 300)(throttleMod.split(":")[1]) : 0;
            const eventOptions = mods.includes("passive") ? { passive: true, capture: mods.includes("capture") } : mods.includes("capture");
            const invoke = e => {
              // @standard-start
              if (isHttpMethod) {
                  const getAttr = a => el.getAttribute('data-he-' + a) || el.getAttribute('@' + a);
                  // Only build target/action when a @target is actually present —
                  // otherwise "".split(",") yields [""], which becomes querySelector("").
                  const targetAttr = getAttr('target');
                  const pairs = targetAttr ? targetAttr.split(",").map(p => p.split(":").map(s => s.trim())) : [];
                  const target = pairs.map(([target]) => target);
                  const action = pairs.map(([, action]) => action);
                  const options = {
                    ...(getAttr("options") && evalExpr(getAttr("options") || "{}")),
                    ...(targetAttr && { target }),
                    ...(targetAttr && { action }),
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
                  const paramsCompiled = compile(paramsAttr, true, { label: "@params", strict: true });
                  const params = paramsCompiled.execute(scope);
                  // Fire-and-forget from an attribute handler: log failures here.
                  ajax(value, eventName.toUpperCase(), options, params, el)
                    .catch(err => console.error("AJAX:", err.message));
              } else
              // @standard-end
              {
                const scope = createScope(el, e);
                const compiled = compile(value, true, { label: name, strict: true });
                // Inline expressions may return a promise (e.g. $get/$post);
                // swallow rejections so fire-and-forget calls don't warn.
                const result = compiled.execute(scope);
                if (result && typeof result.then === "function")
                  result.catch(err => console.error("AJAX:", err.message));
              }
              // Remove after the action actually runs, so .once combined with a
              // key/outside filter fires once *when matched* (not on the first
              // raw event). This is why we don't use the { once: true } option.
              if (mods.includes("once")) receiver.removeEventListener(event, handler, eventOptions);
            };
            const scheduled = debounceDelay > 0 ? debounce(invoke, debounceDelay)
              : throttleDelay > 0 ? throttle(invoke, throttleDelay) : invoke;
            const handler = e => {
              if (!isCurrent()) return;
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
              if (mods.includes("self") && e.target !== el) return;
              if (mods.includes("prevent")) e.preventDefault();
              if (mods.includes("stop")) e.stopPropagation();
              scheduled(e);
            };
            handler.cancel = scheduled.cancel;
            receiver.addEventListener(event, handler, eventOptions);
            if (!HELIUM.listeners.has(el)) HELIUM.listeners.set(el, []);
            HELIUM.listeners.get(el).push({receiver, event, handler, options: eventOptions, attr: name});
          }
        }
      });
      deferredBindings.forEach(b => {
        b.initialExecution = executeBinding(b);
        b.calc || b.loop || b.cond ? newBindings.unshift(b) : newBindings.push(b);
      })
      return { bindings: newBindings, inits: newInits };
    }

    // Disconnect old observer if exists, then create new one
    HELIUM.observer?.disconnect();
    HELIUM.observer = new MutationObserver(async (ms) => {
      if (!isCurrent()) return;
      // A retained ref may have moved within the DOM without being added or
      // removed from the registry, so invalidate cached DOM ordering for every
      // child-list batch when refs exist.
      if (HELIUM.refs.size) refsRevision++;
      // One batched cleanup for everything detached in this mutation batch.
      const detached = [];
      const addedRoots = [];
      for (const m of ms) {
        m.removedNodes.forEach((n) => n.nodeType === 1 && !root.contains(n) && detached.push(n));
        m.addedNodes.forEach((n) => n.nodeType === 1 && root.contains(n) && addedRoots.push(n));
      }
      cleanup(detached);
      for (const m of ms) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && root.contains(n) && !HELIUM.processed.has(n)) {
            const { bindings, inits } = await processElements(n);
            if (!root.contains(n)) continue;
            bindings.forEach(binding => applyBinding(binding));
            runInits(inits);
          }
        }
      }
      const attributeChanges = new Map();
      for (const m of ms) {
        if (m.type !== "attributes") continue;
        const el = m.target, attr = m.attributeName;
        if (addedRoots.some(added => added === el || added.contains(el))) continue;
        if (attr[0] !== "@" && attr[0] !== ":" && !attr.startsWith("data-he")) continue;
        let changes = attributeChanges.get(el);
        if (!changes) attributeChanges.set(el, changes = new Map());
        if (!changes.has(attr)) changes.set(attr, m.oldValue);
      }
      for (const [el, changes] of attributeChanges) {
        for (const [attr, oldValue] of changes) await reconcileDirective(el, attr, oldValue);
      }
    });
    HELIUM.observer.observe(root, { childList: true, subtree: true, attributes: true, attributeOldValue: true });

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
    const instance = createHelium({ ...options, root: target });
    return { state: await instance.helium(initialState), unmount: instance.heliumTeardown };
  }

  return { helium, heliumTeardown, mount };
}

// Create default instance for backwards compatibility
const { helium: runDefaultHelium, heliumTeardown: _defaultTeardown, mount: runDefaultMount } = createHelium();

// Flag to disable default auto-init (used by helium-csp.js and other variants)
// @standard-start
let defaultDisabled = false;
// @standard-end
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
// @standard-start
function disableDefault() {
  defaultDisabled = true;
  defaultInitialized = true;
  if (defaultAutoTimer !== null) clearTimeout(defaultAutoTimer);
  defaultAutoTimer = null;
  _defaultTeardown();
}
// @standard-end

// Setup browser globals and auto-initialization
if (typeof window !== 'undefined') {
  window.helium = defaultHelium;
  window.heliumTeardown = defaultTeardown;
}

// Initialize on load
if (typeof document !== 'undefined') {
  const autoInit = () => {
    defaultAutoTimer = null;
    if (!defaultDisabled && !defaultInitialized) defaultHelium();
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
  // @standard-start
  // Turbo integration
  // Use the non-disabling teardown so Helium can re-initialize on turbo:render.
  // disableDefault() is reserved for variants such as CSP that intentionally
  // take over the default instance.
  document.addEventListener("turbo:before-render",_ => {
    if (!defaultDisabled) {
      _defaultTeardown();
      defaultInitialized = false;
    }
  });
  document.addEventListener("turbo:render",_ => !defaultDisabled && defaultHelium());
  // @standard-end
}

export { defaultTeardown, disableDefault, registerSSE };
export default defaultHelium;

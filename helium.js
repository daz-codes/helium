// Coerce attribute/property values without eval: JSON handles numbers/booleans/null/JSON,
// anything else (bare strings) is returned untouched. CSP-safe (no new Function).
const parseEx=v=>{if(typeof v!=="string")return v;try{return JSON.parse(v)}catch{return v}}
const tryNum=v=>{const t=String(v).trim(),n=+t;return t&&!isNaN(n)?n:v}
const isValidIdentifier = v => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(v);
const RESERVED = new Set(['undefined', 'null', 'true', 'false', 'NaN', 'Infinity', 'this', 'arguments']);
// Property names that must never be written through a binding path: walking or
// assigning these reaches Object.prototype and pollutes every object globally.
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const INPUT_EVENTS = { form: "submit", input: "input", textarea:"input", select:"change" };
const KEY_MODS = { shift: "shiftKey", ctrl: "ctrlKey", alt: "altKey", meta: "metaKey" };
// Modifiers that are flags rather than key names; used to find the key mod regardless of order
const FLAG_MODS = new Set(["prevent", "once", "outside", "document", "window", "self", "capture", "passive", "stop"]);
const HTTP_OPTION_ATTRS = new Set([
  "@target", "@params", "@template", "@loading", "@options", "@success", "@error",
  "data-he-target", "data-he-params", "data-he-template", "data-he-loading", "data-he-options",
  "data-he-success", "data-he-error"
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
  return /=>|&&|\|\||\?\?|[()[\]{}]|(?:^|\s)[+\-*/%](?:\s|$)|(?:^|\s)(?:={1,3}|!==?|<=?|>=?)(?:\s|$)|\s\?\s|^\s*[`'"]|[`'"]\s*$|\b[$A-Za-z_][\w$]*\s*\.\s*(?:[$A-Za-z_][\w$]*|\s*$)|^[+-]{2}|[+-]{2}$/.test(v);
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
let TurboIntegration = null;
const registerTurbo = integration => TurboIntegration = integration;
// Structural output is marked so a cloned copy (Turbo's page cache) can be
// recognised and discarded; GENERATED holds the live nodes, which a clone
// never is. LIVE lets roots skip nested roots and lets the Turbo adapter reach
// every running instance.
const GENERATED = new WeakSet();
const LIVE = new Set();
const markGenerated = node => {
  if (node.nodeType !== 1) return;
  node.setAttribute("data-helium-generated", "");
  GENERATED.add(node);
};
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
      $signal: ctx.signal,
      $dispatch: ctx.dispatch,
      $html: ctx.html,
      // @standard-start
      $get: ctx.get,
      $post: ctx.post,
      $put: ctx.put,
      $patch: ctx.patch,
      $delete: ctx.del,
      // @standard-end
      ...ctx.refs,
      ...ctx.magic
    };
  }
};

// Factory function to create helium with custom engine
export function createHelium(options = {}) {
  // Creating an explicitly configured instance is an opt-out from the pending
  // default auto mount, just like calling helium() or helium.mount().
  if (Object.keys(options).length) suppressDefaultAutoInit();
  const engine = options.engine ?? defaultEngine;
  const configuredHandleError = options.handleError;
  const debug = !!options.debug;
  // @standard-start
  const configuredRequireCsrf = !!options.requireCsrf;
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
  const reportedErrors = new WeakSet();

  const reportError = (error, phase, context) => {
    if (error && (typeof error === "object" || typeof error === "function")) {
      if (reportedErrors.has(error)) return;
      reportedErrors.add(error);
    }
    try {
      const details = configuredHandleError || debug
        ? { phase, root: HELIUM?.root || null, ...context }
        : null;
      if (configuredHandleError) configuredHandleError(error, details);
      if (!configuredHandleError || debug) {
        console.error(
          `Helium ${phase} error:`,
          debug ? error : (error?.message || error),
          ...(debug ? [details] : []),
        );
      }
    } catch (handlerError) {
      console.error("Helium handleError error:", handlerError);
    }
  };

  async function helium(initialState = {}) {
    const root = (typeof configuredRoot === "string" ? document.querySelector(configuredRoot) : configuredRoot)
      || document.querySelector('[\\@helium]') || document.querySelector('[data-helium]') || document.body;
    if (!root) throw Error("No root");
    // @standard-start
    // One element has one owner. Checked before anything changes, so a
    // rejected mount leaves the running instance untouched.
    if ([...LIVE].some(other => other.owner !== helium && other.root === root)
      || GENERATED.has(root.closest("[data-helium-generated]"))) throw Error("Helium root already owned");
    // @standard-end
    const currentGeneration = ++generation;
    const isCurrent = () => currentGeneration === generation;
    const ALL = Symbol("all");
    const storageKey = root.getAttribute('@local-storage') || root.getAttribute('data-he-local-storage');

    // On re-init (manual re-call or Turbo navigation) tear down the previous
    // instance first, then start from fresh collections. Reusing the old
    // bindings Map would fire the proxy set-trap during the Object.assign below
    // — before this call's executeBinding const is initialized — throwing a TDZ
    // error, and would leak stale bindings that keep running on detached nodes.
    if (HELIUM) {
      if (HELIUM.teardown) HELIUM.teardown();
      else {
        HELIUM.observer?.disconnect();
        HELIUM.rootObserver?.disconnect();
        HELIUM.cleanup?.(HELIUM.root);
      }
    }
    HELIUM = {
      observer: null,
      rootObserver: null,
      bindings: new Map(),
      refs: new Map(),
      elements: new WeakMap(),
      processed: new WeakSet(),
      parentKeys: new WeakMap(),
      fnCache: new Map(),
      proxyCache: new WeakMap(),
      warnedCompiles: new Set()
      // @standard-start
      ,
      imports: new Map(),
      owner: helium
      // @standard-end
    };
    HELIUM.root = root;
    // @standard-start
    const instanceRecord = HELIUM;
    LIVE.add(instanceRecord);
    // A root mounted inside a running root takes its subtree over.
    LIVE.forEach(other => other !== instanceRecord && other.root.contains(root) && other.release(root));
    // Ownership is read live, never captured: another root can mount inside
    // this one while this instance is waiting on imports or a microtask.
    const owned = el => {
      for (const other of LIVE) {
        if (other !== instanceRecord && other.root !== root && root.contains(other.root) && other.root.contains(el)) return false;
      }
      return true;
    };
    // @standard-end

    const elementRecord = el => {
      let record = HELIUM.elements.get(el);
      return record || (HELIUM.elements.set(el, record = {}), record);
    };

    const html = s => Object.assign(document.createElement("template"),{innerHTML:String(s).trim()}).content.firstChild

    // @standard-start
    const resolveUpdateTarget = (target, elCtx = root) => {
      if (target instanceof Node) return target;
      const name = String(target || "").trim();
      if (!name) return null;
      const ref = resolveRefs(elCtx, name)[0];
      if (ref) return ref;
      try { return document.querySelector(name); }
      catch { return null; }
    };

    const update = (data,targets,actions,template,elCtx=root) => {
      if (!isCurrent()) return [];
      const newTargets = [];
      (targets || []).forEach((target,i) => {
        const element = resolveUpdateTarget(target, elCtx);
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

    // @loading is a transaction rather than an ordinary update: failures and
    // cancellation restore the exact nodes/state that existed before it began.
    const startLoading = (content, targets, actions, elCtx) => {
      let active = true;
      const responseTargets = [], responseActions = [], restores = [];
      (targets || []).forEach((target, i) => {
        const element = resolveUpdateTarget(target, elCtx);
        const action = actions?.[i];
        if (element) {
          if (action) {
            const loadingNode = html(content);
            if (!loadingNode) return;
            element[action === "replace" ? "replaceWith" : action](loadingNode);
            responseTargets.push(loadingNode);
            responseActions.push("replace");
            restores.push(() => {
              if (action === "replace" && loadingNode.isConnected) loadingNode.replaceWith(element);
              else loadingNode.remove();
            });
          } else {
            const previous = [...element.childNodes];
            element.innerHTML = content ?? "";
            responseTargets.push(element);
            responseActions.push(null);
            restores.push(() => {
              if (element.isConnected) element.replaceChildren(...previous);
            });
          }
        } else {
          const key = target;
          const present = Object.prototype.hasOwnProperty.call(state, key);
          const previous = state[key];
          state[key] = content;
          responseTargets.push(key);
          responseActions.push(action);
          restores.push(() => present ? state[key] = previous : delete state[key]);
        }
      });
      return {
        target: responseTargets,
        action: responseActions,
        commit: () => { active = false; },
        restore: () => {
          if (!active) return;
          active = false;
          restores.reverse().forEach(restore => restore());
        },
      };
    };

    const requestAbortError = reason => {
      if (reason instanceof Error && reason.name === "AbortError") return reason;
      const message = reason instanceof Error ? reason.message
        : typeof reason === "string" ? reason : "Request cancelled";
      const error = new Error(message);
      error.name = "AbortError";
      if (reason instanceof Error) error.cause = reason;
      return error;
    };
    const requestsFor = el => {
      const record = elementRecord(el);
      return record.requests ||= new Set();
    };
    const releaseRequest = (record, commit = false) => {
      if (!record.active) return;
      record.active = false;
      commit ? record.loading?.commit() : record.loading?.restore();
      record.externalSignal?.removeEventListener("abort", record.externalAbort);
      const requests = elementRecord(record.element).requests;
      requests?.delete(record);
      if (requests && !requests.size) delete elementRecord(record.element).requests;
    };
    const abortRequest = (record, reason) => {
      if (!record.active) return;
      releaseRequest(record);
      record.controller.abort(requestAbortError(reason));
    };
    const abortRequests = (el, predicate = () => true) => {
      [...(elementRecord(el).requests || [])].forEach(record => {
        if (predicate(record)) abortRequest(record);
      });
    };

    const ajax = (url,method,options={},params={},elCtx=root) => {
      options = { ...(options || {}) };
      method = method.toUpperCase();
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

      const controller = new AbortController();
      const record = {
        active: true,
        controller,
        element: elCtx,
        key: options.requestKey || `${method}:${requestUrl}`,
        loading: null,
        externalSignal: options.signal,
        externalAbort: null,
      };
      const requests = requestsFor(elCtx);
      if (options.latest) [...requests].forEach(previous => {
        if (previous.key === record.key) abortRequest(previous, "Superseded by a newer request");
      });
      requests.add(record);
      if (options.loading != null) {
        record.loading = startLoading(options.loading, options.target, options.action, elCtx);
        if (record.loading.target.length) {
          options.target = record.loading.target;
          options.action = record.loading.action;
        }
      }
      if (record.externalSignal) {
        record.externalAbort = () => abortRequest(record, record.externalSignal.reason);
        if (record.externalSignal.aborted) record.externalAbort();
        else record.externalSignal.addEventListener("abort", record.externalAbort, { once: true });
      }

      const request = {
        method, url: requestUrl, element: elCtx, signal: controller.signal,
        response: null, data: undefined,
      };
      const notifyFailure = async error => {
        request.error = error;
        if (typeof options.error === "function") {
          try { await options.error(error, request); }
          catch (hookError) {
            reportError(hookError, "request", { stage: "error-hook", element: elCtx, method, url: requestUrl, request });
          }
        }
        reportError(error, "request", {
          element: elCtx, method, url: requestUrl,
          status: error?.status, response: error?.response, request,
        });
      };
      const ensureActive = () => {
        if (!record.active || !isCurrent() || (elCtx !== root && !root.contains(elCtx))) {
          abortRequest(record);
          throw controller.signal.reason || requestAbortError();
        }
      };
      const requireCsrf = options.requireCsrf ?? configuredRequireCsrf;
      const {
        target: _target, action: _action, template: _template, loading: _loading,
        success: _success, error: _error, latest: _latest, requestKey: _requestKey,
        requireCsrf: _requireCsrf, signal: _signal, retry: _retry,
        retryMode: _retryMode, ...fetchOptions
      } = options;
      const customHeaders = fetchOptions.headers &&
        (Array.isArray(fetchOptions.headers) || typeof fetchOptions.headers.entries === "function")
        ? Object.fromEntries(new Headers(fetchOptions.headers).entries())
        : fetchOptions.headers;

      const doFetch = async lastEventId => {
        ensureActive();
        const res = await fetch(requestUrl, {
          ...fetchOptions,
          method,
          headers: {
            Accept:`text/event-stream,${TurboIntegration ? "text/vnd.turbo-stream.html," : ""}application/json,text/html`,
            ...(!fd && method !== "GET" && {"Content-Type":"application/json"}),
            ...(sameOrigin && token ? {"X-CSRF-Token": token} : {}),
            ...(lastEventId ? {"Last-Event-ID": lastEventId} : {}),
            ...(customHeaders || {}),
          },
          body: method === "GET" ? null : (fd ? params : JSON.stringify(params)),
          credentials: fetchOptions.credentials ?? (sameOrigin ? "same-origin" : "omit"),
          signal: controller.signal,
        });
        ensureActive();
        request.response = res;
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
          let updated = false;
          const reconnecting = await handler(res, options, async lastEventId => {
            const next = await doFetch(lastEventId);
            try { await completeResponse(next); }
            catch (error) {
              if (error !== successHookFailure) throw error;
            }
            return next;
          }, (...args) => {
            ensureActive();
            updated = true;
            record.loading?.commit();
            return update(...args, elCtx);
          }, () => record.active && isCurrent(), notifyFailure);
          ensureActive();
          return { sse: true, updated, reconnecting };
        }
        const data = TurboIntegration && type.includes("turbo-stream") ? { turbo: true, data: await res.text() } :
          type.includes("json") ? await res.json() : await res.text();
        ensureActive();
        return data;
      };

      let successHookFailure = null;
      const completeResponse = async data => {
        request.data = data?.sse ? undefined : (data?.turbo ? data.data : data);
        ensureActive();
        let result;
        if (data?.sse) {
          if (data.updated) record.loading?.commit();
          if (data.reconnecting) return;
        } else if (data && typeof data === "object" && data.turbo) {
          record.loading?.commit();
          result = TurboIntegration.renderStreamMessage(data.data);
        } else {
          record.loading?.commit();
          result = update(data, options.target, options.action, options.template, elCtx);
        }
        releaseRequest(record, true);
        if (typeof options.success === "function") {
          try { await options.success(request.data, request); }
          catch (error) {
            successHookFailure = error;
            reportError(error, "request", {
              stage: "success-hook", element: elCtx,
              method, url: requestUrl, request,
            });
            throw error;
          }
        }
        return result;
      };

      // Return the promise so callers can await, chain, and handle errors.
      // The terminal .catch lives at the call sites (fire-and-forget vs. awaited).
      return (async () => {
        try {
          if (sameOrigin && method !== "GET" && requireCsrf && !token) {
            const error = new Error(`Missing CSRF token for ${method} ${requestUrl}`);
            error.code = "HELIUM_CSRF_TOKEN_MISSING";
            throw error;
          }
          const data = await doFetch(null);
          return await completeResponse(data);
        } catch (error) {
          const cancelled = controller.signal.aborted || error?.name === "AbortError";
          if (record.active) releaseRequest(record);
          if (cancelled) throw controller.signal.reason || error;
          if (error === successHookFailure) throw error;
          await notifyFailure(error);
          throw error;
        }
      })();
    }

    const opts = o => {
      if (typeof o === "string" || o instanceof Node) return { target: [o], action: [null] };
      const normalized = { ...(o || {}) };
      if (normalized.target != null && !Array.isArray(normalized.target)) normalized.target = [normalized.target];
      if (normalized.action != null && !Array.isArray(normalized.action)) normalized.action = [normalized.action];
      return normalized;
    };
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

    const safeApplyBinding = (b) => {
      if (b.gone || (b.el !== root && !root.contains(b.el)) || applyingBindings.has(b)) return;
      applyingBindings.add(b);
      try {
        // @standard-start
        if (b.run) b.run(); else
        // @standard-end
        applyBinding(b);
      } catch (error) {
        reportError(error, b.errorContext ? "watch" : "binding",
          // @standard-start
          b.errorContext ||
          // @standard-end
          { element: b.el, directive: b.attr, expression: b.expression });
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
        if (isCurrent() && changed) notify(t, p);
        return res
      },
      deleteProperty: (t, p) => {
        if (!Object.prototype.hasOwnProperty.call(t, p)) return true;
        const res = Reflect.deleteProperty(t, p);
        if (res && isCurrent()) notify(t, p);
        return res;
      }
  };

    // Collect the changed property plus every ancestor key reachable through
    // the parent graph, so deeply-nested writes and deletions
    // (user.address.city) re-trigger ancestor bindings. BFS with a visited set
    // handles shared refs and cycles; the key set de-dups so each binding runs
    // at most once per mutation.
    const notify = (t, p) => {
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
        const elementScopes = elementRecord(el).scopes;
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
      // Nested objects remember the objects they were read from, so an edit
      // marks every ancestor dirty (as the root proxy's parent graph does) and
      // @for rows holding any of them re-render.
      const parents = new WeakMap();
      const touched = target => {
        const seen = new Set();
        for (const pending = [rawOf(target)]; pending.length;) {
          const raw = pending.pop();
          if (seen.has(raw)) continue;
          seen.add(raw);
          dirtyObjects.add(raw);
          pending.push(...(parents.get(raw) || []));
        }
        roots.get(target).forEach(key => trigger(scopeToken(scope, key)));
      };
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
            if (isReactiveObject(child)) {
              const raw = rawOf(child);
              if (!parents.has(raw)) parents.set(raw, new Set());
              parents.get(raw).add(rawOf(target));
            }
            roots.get(target).forEach(key => child = wrap(child, key));
            return child;
          },
          set(target, prop, value, receiver) {
            // Same-value writes don't notify, matching the root state proxy;
            // otherwise a local @calculate re-triggers itself indefinitely.
            const changed = !Object.is(Reflect.get(target, prop, receiver), value);
            const result = Reflect.set(target, prop, value, receiver);
            if (changed) touched(target);
            return result;
          },
          deleteProperty(target, prop) {
            if (!Object.prototype.hasOwnProperty.call(target, prop)) return true;
            const result = Reflect.deleteProperty(target, prop);
            touched(target);
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
          const changed = !Object.is(Reflect.get(target, prop, receiver), value);
          const result = Reflect.set(target, prop, value, receiver);
          if (changed) trigger(scopeToken(scope, prop));
          return result;
        },
        deleteProperty(target, prop) {
          if (!Object.prototype.hasOwnProperty.call(target, prop)) return true;
          const result = Reflect.deleteProperty(target, prop);
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
    const addScope = (el, scope) => (elementRecord(el).scopes ||= []).push(scope);
    // @standard-end
    const setStateValue = (el, prop, value, directive) => {
      // Dotted paths ("user.name") walk to the parent object through the
      // reactive proxies, so the leaf assignment triggers bindings as usual.
      const path = prop.split(".").map(s => s.trim());
      const last = path.pop();
      // Reject prototype-polluting segments before walking or assigning, so a
      // path like "__proto__.polluted" can't reach Object.prototype.
      if (UNSAFE_KEYS.has(last) || path.some(k => UNSAFE_KEYS.has(k))) {
        reportError(new Error(`Refusing to set unsafe property path "${prop}"`), "binding", {
          element: el, directive, expression: prop,
        });
        return false;
      }
      let target = state;
      // @standard-start
      const owner = ownerFor(scopesFor(el), path[0] ?? last);
      if (owner) target = owner.values;
      // @standard-end
      for (const key of path) target = target?.[key];
      if (!target || typeof target !== "object") {
        reportError(new Error(`Cannot set "${prop}" — "${path.join(".")}" is not an object`), "binding", {
          element: el, directive, expression: prop,
        });
        return false;
      }
      return Reflect.set(target, last, value);
    };

    // Standard overlays the nearest element scope on the mounted root; the
    // generated Lite build leaves this as the root-only state view.
    const scopeElementFor = el => {
      // @standard-start
      for (let current = el; current && current !== root.parentNode; current = current.parentNode) {
        const elementScopes = elementRecord(current).scopes || [];
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
      const element = elementRecord(scopeEl);
      const cached = element.refSnapshot;
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
      element.refSnapshot = snapshot;
      return snapshot;
    };
    const queryFor = el => {
      const scopeEl = scopeElementFor(el);
      const element = elementRecord(scopeEl);
      if (element.queryHelper) return element.queryHelper;
      const helpers = selector => document.querySelector(selector);
      helpers.all = selector => [...document.querySelectorAll(selector)];
      helpers.root = selector => root.querySelector(selector);
      helpers.root.all = selector => [...root.querySelectorAll(selector)];
      helpers.scope = selector => scopeEl.querySelector(selector);
      helpers.scope.all = selector => [...scopeEl.querySelectorAll(selector)];
      element.queryHelper = helpers;
      return helpers;
    };

    const createScope = (el, event = {}, scopeState = state, extraScope, accessed, signal, magic = {}) => {
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
          },
          deleteProperty: (target, prop) => {
            const owner = ownerFor(scopes, prop);
            return Reflect.deleteProperty(owner ? owner.values : target, prop);
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
        signal,
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
        refs: refScope.singular,
        magic
      });
    };

    // @standard-start
    const importNames = value => [...new Set(String(value || "").split(",").map(name => name.trim()).filter(Boolean))];
    // Bare names pinned by a page import map (importmap-rails, digested
    // Propshaft assets) go to import() unchanged so the browser resolves them.
    const importMapped = name => [...document.querySelectorAll("script[type=importmap]")].some(s => {
      try { return Object.keys(JSON.parse(s.textContent).imports || {}).some(k => k === name || k.endsWith("/") && name.startsWith(k)); }
      catch { return false; }
    });
    const importPath = moduleName => {
      const isUrl = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(moduleName);
      const hasExtension = /\.js(?:[?#].*)?$/.test(moduleName);
      const hasPathPrefix = moduleName.startsWith("/") || moduleName.startsWith("./") || moduleName.startsWith("../");
      if (!isUrl && !hasPathPrefix && importMapped(moduleName)) return moduleName;
      const relativePath = (isUrl || hasPathPrefix ? "" : "./") + moduleName + (isUrl || hasExtension ? "" : ".js");
      return isUrl ? moduleName : new URL(relativePath, location.href).href;
    };
    const behaviorKey = (attr, moduleName) => `${attr}\0${moduleName}`;
    const refTokensByName = new Map();
    const behaviorRefToken = (el, name) => {
      const record = elementRecord(el);
      const tokens = record.behaviorRefTokens ||= new Map();
      let token = tokens.get(name);
      if (!token) {
        token = { owner: el, name };
        tokens.set(name, token);
        const named = refTokensByName.get(name) || new Set();
        named.add(token);
        refTokensByName.set(name, named);
      }
      return token;
    };
    const triggerBehaviorRefs = (names = refTokensByName.keys()) => {
      const dependencies = [];
      for (const name of names) refTokensByName.get(name)?.forEach(token => dependencies.push(token));
      if (dependencies.length) enqueueBindings(dependencies);
    };
    const behaviorSet = el => elementRecord(el).behaviors || new Set();
    const hasBehavior = (el, key) => behaviorSet(el).has(key);
    const addBehavior = (el, key) => {
      (elementRecord(el).behaviors ||= new Set()).add(key);
      triggerBehaviorRefs();
    };
    const removeBehavior = (el, key) => {
      const behaviors = behaviorSet(el);
      behaviors.delete(key);
      if (!behaviors.size) delete elementRecord(el).behaviors;
      triggerBehaviorRefs();
    };
    const ownsBehaviorNode = (owner, node) => {
      for (let current = node; current && current !== owner; current = current.parentElement) {
        if (elementRecord(current).behaviors?.size) return false;
      }
      return node === owner || owner.contains(node);
    };
    const behaviorRefs = (el, name) => {
      const elements = [...(HELIUM.refs.get(`$${name}`) || [])]
        .filter(ref => ownsBehaviorNode(el, ref))
        .sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      const snapshots = elementRecord(el).behaviorRefSnapshots ||= new Map();
      const previous = snapshots.get(name);
      const same = previous?.elements.length === elements.length
        && elements.every((element, index) => previous.elements[index] === element);
      if (same && previous.value.length === elements.length
        && elements.every((element, index) => previous.value[index] === element)) return previous.value;
      const value = [...elements];
      snapshots.set(name, { elements, value });
      return value;
    };
    const behaviorContext = (el, signal, details) => {
      const scope = createScope(el, {}, state, null, null, signal);
      const query = selector => [...el.querySelectorAll(selector)].find(node => ownsBehaviorNode(el, node)) || null;
      query.all = selector => [...el.querySelectorAll(selector)].filter(node => ownsBehaviorNode(el, node));
      let collecting = null;
      const data = new Proxy(state, {
        has: (target, prop) => !!ownerFor(scopesFor(el), prop) || Reflect.has(target, prop),
        get: (target, prop) => {
          if (prop === RAW) return rawOf(target);
          const owner = ownerFor(scopesFor(el), prop);
          const value = owner ? owner.values[prop] : Reflect.get(target, prop, target);
          if (collecting && typeof prop === "string") {
            collecting.set(owner ? scopeToken(owner, prop) : prop, value);
          }
          return value;
        },
        set: (target, prop, value) => {
          const owner = ownerFor(scopesFor(el), prop);
          return owner ? Reflect.set(owner.values, prop, value) : Reflect.set(target, prop, value, target);
        },
        deleteProperty: (target, prop) => {
          const owner = ownerFor(scopesFor(el), prop);
          return Reflect.deleteProperty(owner ? owner.values : target, prop);
        },
      });
      const refs = new Proxy({}, {
        get: (_, name) => {
          if (typeof name !== "string") return undefined;
          const value = behaviorRefs(el, name);
          if (collecting) collecting.set(behaviorRefToken(el, name), value);
          return value;
        },
      });
      const watchError = error => reportError(error, "watch", {
        element: el,
        directive: details.directive,
        expression: details.behavior,
        behavior: details.behavior,
        path: details.path,
        signal,
      });
      const watch = (source, callback, options = {}) => {
        if (typeof source !== "function" || typeof callback !== "function") {
          throw new TypeError("Helium watch() expects selector and callback functions");
        }
        if (signal.aborted) return () => {};
        const equals = options.equals === false ? () => false : (options.equals || Object.is);
        if (typeof equals !== "function") throw new TypeError("Helium watch() equals option must be a function or false");
        let initialized = false, value;
        const watcher = {
          el,
          attr: details.directive,
          expression: details.behavior,
          active: true,
          errorContext: {
            element: el, directive: details.directive,
            expression: details.behavior, behavior: details.behavior, path: details.path, signal,
          },
          run: () => {
            if (!watcher.active || signal.aborted) return;
            const accessed = new Map(), parentCollector = collecting;
            collecting = accessed;
            let next;
            try { next = source(data); }
            finally { collecting = parentCollector; }
            updateBindingDependencies(watcher, accessed.keys());
            if (!initialized) {
              initialized = true;
              value = next;
              if (!options.immediate) return;
              const result = callback(next, undefined);
              if (result && typeof result.then === "function") Promise.resolve(result).catch(watchError);
              return;
            }
            if (equals(next, value)) return;
            const previous = value;
            value = next;
            const result = callback(next, previous);
            if (result && typeof result.then === "function") Promise.resolve(result).catch(watchError);
          },
        };
        const stop = () => {
          if (!watcher.active) return;
          watcher.active = false;
          signal.removeEventListener("abort", stop);
          forgetBinding(watcher);
        };
        signal.addEventListener("abort", stop, { once: true });
        watcher.run();
        return stop;
      };
      return {
        element: el,
        root,
        scope: el,
        data,
        refs,
        query,
        watch,
        signal,
        dispatch: scope.$dispatch,
      };
    };
    // @standard-end

    // Compile expression with caching
    const warnCompileFailure = (expr, compiled, ctx = {}) => {
      if (!compiled.error || !(ctx.strict || looksLikeExpression(expr))) return;
      if (HELIUM.warnedCompiles.has(compiled)) return;
      HELIUM.warnedCompiles.add(compiled);
      const label = [ctx.build || engine.diagnosticName, ctx.label].filter(Boolean).join(" ");
      console.warn(`Helium expression compile warning${label ? ` [${label}]` : ""}:`, expr, compiled.error.message);
    };

    const compile = (expr, withReturn = true, ctx) => {
      const key = `${withReturn}:${expr}`;
      let compiled = HELIUM.fnCache.get(key);
      if (!compiled) {
        compiled = engine.compile(expr, withReturn);
        HELIUM.fnCache.set(key, compiled);
      }
      warnCompileFailure(expr, compiled, ctx);
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

    // Dependencies are recorded even when evaluation throws: `user.name` with
    // no `user` yet has still read `user`, and assigning it must re-run the
    // binding rather than leave it permanently inactive.
    const track = () => {
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
    };

    try {
      const result = b.compiled.execute(createScope(elCtx, event, wrap(state), null, accessed));
      track();
      return { ok: true, result };
    } catch (err) {
      reportError(err, "binding", { element: b.el, directive: b.attr, expression: b.expression });
      try { track(); } catch {}
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
          // An in-place edit keeps the same object, so that assignment is a
          // same-value write and notifies nothing; notify the row directly.
          trigger(scopeToken(row.scope, loop[0]));
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
            markGenerated(node);
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
      const scopes = elementRecord(b.el).scopes;
      let cursor = b.el;
      nodes.forEach(node => {
        markGenerated(node);
        if (node.nodeType === 1 && scopes) elementRecord(node).scopes = [...scopes];
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
    if (calc) setStateValue(el, calc, r, b.attr)

    if (prop==="innerHTML") {
      const content = Array.isArray(r) ? r.join`` : (r ?? "");
      if (TurboIntegration?.morphChildren) {
        const incoming = el.cloneNode(false);
        incoming.innerHTML = content;
        if (TurboIntegration.morphChildren(el, incoming)) return;
      }
      return typeof globalThis.Idiomorph?.morph === "function"
        ? globalThis.Idiomorph.morph(el, content, { morphStyle: "innerHTML" })
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

  const lifecycleContext = record => ({
    root: record.root,
    element: record.el,
    directive: record.attr,
    expression: record.expression,
    signal: record.controller.signal,
    ...record.details,
  });

  const runInitCleanup = record => {
    if (record.cleaned || typeof record.cleanup !== "function") return;
    record.cleaned = true;
    try {
      const result = record.cleanup();
      if (result && typeof result.then === "function") {
        Promise.resolve(result).catch(error => reportError(error, "cleanup", lifecycleContext(record)));
      }
    } catch (error) {
      reportError(error, "cleanup", lifecycleContext(record));
    }
  };

  const stopInit = record => {
    if (!record.active) return;
    record.active = false;
    record.controller.abort();
    runInitCleanup(record);
  };

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
        const element = elementRecord(e);
        element.cleanups?.forEach(stopInit);
        // @standard-start
        abortRequests(e);
        // @standard-end
        element.listeners?.forEach(({receiver,event,handler,options}) => {
          handler.cancel?.();
          receiver.removeEventListener(event,handler,options);
        });
        // A caller may still hold these bindings (applied a microtask later);
        // mark them so that pending apply cannot resurrect them.
        element.bound?.forEach(binding => binding.gone = true);
        HELIUM.processed.delete(e);  // allow reprocessing if the same node is re-inserted
        HELIUM.elements.delete(e);
        // @standard-start
        const refTokens = element.behaviorRefTokens;
        refTokens?.forEach((token, name) => {
          const named = refTokensByName.get(name);
          named?.delete(token);
          if (named && !named.size) refTokensByName.delete(name);
        });
        // @standard-end
      });
      // @standard-start
      const changedRefs = [];
      // @standard-end
      for (const [name, ref] of HELIUM.refs) {
        let changed = false;
        for (const element of ref) if (removed.has(element)) changed = ref.delete(element) || changed;
        if (!ref.size) HELIUM.refs.delete(name);
        if (changed) {
          refsRevision++;
          // @standard-start
          changedRefs.push(name.slice(1));
          // @standard-end
        }
      }
      // @standard-start
      triggerBehaviorRefs(changedRefs);
      // @standard-end
      // Prune bindings that reference removed elements, otherwise they leak and keep
      // running on detached nodes every time state changes.
      HELIUM.bindings.forEach((arr, key) => {
        const kept = arr.filter(b => !removed.has(b.el));
        kept.length ? HELIUM.bindings.set(key, kept) : HELIUM.bindings.delete(key);
      });
    };

  const startLifecycle = ({ compiled, execute, el, attr, expression, details, lifecycleKey, onFailure }) => {
    const record = {
      root, el, attr, expression, details, lifecycleKey, controller: new AbortController(),
      active: true, cleaned: false, cleanup: null,
    };
    (elementRecord(el).cleanups ||= []).push(record);

    let result;
    try {
      result = execute
        ? execute(record.controller.signal)
        : compiled.execute(createScope(el, {}, state, null, null, record.controller.signal));
    } catch (error) {
      const element = elementRecord(el);
      element.cleanups = element.cleanups?.filter(candidate => candidate !== record);
      stopInit(record);
      onFailure?.();
      return void reportError(error, "setup", lifecycleContext(record));
    }

    const settle = cleanup => {
      if (typeof cleanup !== "function") return;
      record.cleanup = cleanup;
      if (!record.active) runInitCleanup(record);
    };
    if (result && typeof result.then === "function") {
      Promise.resolve(result).then(settle, error => {
        if (record.active) {
          const element = elementRecord(el);
          element.cleanups = element.cleanups?.filter(candidate => candidate !== record);
          stopInit(record);
          onFailure?.();
        }
        if (!(record.controller.signal.aborted && error?.name === "AbortError")) {
          reportError(error, "setup", lifecycleContext(record));
        }
      });
    } else settle(result);
    return record;
  };

  const runInits = inits => inits.forEach(init => owned(init.el) && startLifecycle(init));

  HELIUM.cleanup = cleanup;

  const bindingsFor = predicate => {
    const found = new Set();
    HELIUM.bindings.forEach(bindings => bindings.forEach(binding => {
      if (predicate(binding)) found.add(binding);
    }));
    return found;
  };

  // Every directive binding in a subtree, in document order. Unlike the
  // dependency registry this includes bindings that read no state.
  const boundIn = scope => [scope, ...scope.querySelectorAll("*")]
    .flatMap(el => HELIUM.elements.get(el)?.bound || []);

  const forgetBinding = binding => {
    binding.gone = true;
    const record = HELIUM.elements.get(binding.el);
    if (record?.bound) record.bound = record.bound.filter(candidate => candidate !== binding);
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

  // Structural output is owned by Helium rather than by the source document.
  // Remove it whenever this instance ends so re-initialization—and Turbo's
  // cached clone of the page—starts from the declarative templates, not from a
  // mixture of templates and stale rendered siblings.
  // Drop everything this instance holds in a subtree, rendered output included.
  const release = el => {
    boundIn(el).filter(binding => binding.loop || binding.cond).forEach(forgetBinding);
    cleanup(el);
  };
  const teardownInstance = reclaim => {
    if (HELIUM.rootDisconnectTimer !== null) clearTimeout(HELIUM.rootDisconnectTimer);
    HELIUM.rootDisconnectTimer = null;
    HELIUM.observer?.disconnect();
    HELIUM.rootObserver?.disconnect();
    // @standard-start
    LIVE.delete(instanceRecord);
    // @standard-end
    release(root);
    // @standard-start
    // Unmounting (not re-initializing) hands a still-connected subtree back.
    // Every enclosing root is asked; roots skip nested live roots, so only the
    // innermost one actually takes it.
    if (reclaim && root.isConnected) LIVE.forEach(other => other.root.contains(root) && other.adopt(root));
    // @standard-end
  };
  HELIUM.teardown = teardownInstance;
  // @standard-start
  HELIUM.release = release;
  HELIUM.adopt = el => processElements(el).then(({ bindings, inits }) => {
    if (!isCurrent()) return;
    bindings.forEach(safeApplyBinding);
    runInits(inits);
  });
  HELIUM.bound = boundIn;
  // Re-apply a subtree's bindings after something outside Helium (a morph)
  // rewrote its DOM. Effects are skipped: their side effects already ran.
  HELIUM.refresh = scope => boundIn(scope).filter(binding => !binding.keys).forEach(safeApplyBinding);
  // @standard-end

  const removeDirective = (el, attr, oldValue) => {
    // @standard-start
    if (match(attr, "get", "post", "put", "patch", "delete")) {
      abortRequests(el, request => request.key === attr);
    }
    // @standard-end
    const element = elementRecord(el);
    new Set([
      ...(element.bound || []).filter(binding => binding.attr === attr),
      ...bindingsFor(binding => binding.el === el && binding.attr === attr),
    ]).forEach(forgetBinding);

    const listeners = element.listeners || [];
    const keptListeners = [];
    listeners.forEach(record => {
      if (record.attr !== attr) return void keptListeners.push(record);
      record.handler.cancel?.();
      record.receiver.removeEventListener(record.event, record.handler, record.options);
    });
    element.listeners = keptListeners;

    const initCleanups = element.cleanups || [];
    const keptCleanups = [];
    initCleanups.forEach(record => {
      if (record.attr !== attr) return void keptCleanups.push(record);
      stopInit(record);
    });
    element.cleanups = keptCleanups;

    if (match(attr, "ref") && oldValue != null) {
      const key = "$" + oldValue;
      const refs = HELIUM.refs.get(key);
      if (refs?.delete(el)) {
        refsRevision++;
        // @standard-start
        triggerBehaviorRefs([oldValue]);
        // @standard-end
      }
      if (refs && !refs.size) HELIUM.refs.delete(key);
    }

    // @standard-start
    if (match(attr, "data")) {
      const dataRecord = element.dataDirective;
      if (el === root && dataRecord) {
        const baseline = element.dataBaseline;
        dataRecord.keys.forEach(key => {
          const original = baseline?.get(key);
          if (original?.present) state[key] = original.value;
          else delete state[key];
        });
      } else {
        element.scopes = (element.scopes || []).filter(scope => scope.owner !== el);
      }
      delete element.dataDirective;
    }
    // @standard-end
  };

  const refreshSubtreeBindings = el => {
    bindingsFor(binding => (binding.el !== el && el.contains(binding.el))
      // @standard-start
      || (binding.run && binding.el === el)
      // @standard-end
    )
      .forEach(safeApplyBinding);
    refsRevision++;
  };

  const reconcileDirective = async (el, attr, oldValue) => {
    if (!isCurrent() || (el !== root && !root.contains(el))) return;
    // @standard-start
    if (HTTP_OPTION_ATTRS.has(attr)) {
      abortRequests(el);
      return;
    }
    // @standard-end
    if (HELIUM_CONFIG_ATTRS.has(attr)) return;

    let directive = attr;
    if (attr === ":key") {
      directive = el.hasAttribute("@for") ? "@for"
        : el.hasAttribute("data-he-for") ? "data-he-for" : null;
      if (!directive) return;
    }

    // @standard-start
    if (match(directive, "import")) {
      const nextNames = new Set(importNames(el.getAttribute(directive)));
      const element = elementRecord(el);
      const records = element.cleanups || [];
      const removedKeys = new Set(importNames(oldValue)
        .filter(name => !nextNames.has(name))
        .map(name => behaviorKey(directive, name)));
      const kept = [];
      records.forEach(record => {
        if (!removedKeys.has(record.lifecycleKey)) return void kept.push(record);
        stopInit(record);
        removeBehavior(el, record.lifecycleKey);
      });
      element.cleanups = kept;
      removedKeys.forEach(key => removeBehavior(el, key));
      if (el.hasAttribute(directive)) {
        const { bindings, inits } = await processElements(el, new Set([directive]));
        if (!isCurrent() || (el !== root && !root.contains(el))) return;
        bindings.forEach(safeApplyBinding);
        runInits(inits);
      }
      return;
    }
    // @standard-end

    removeDirective(el, directive, attr === ":key" ? el.getAttribute(directive) : oldValue);
    if (el.hasAttribute(directive)) {
      const { bindings, inits } = await processElements(el, new Set([directive]));
      if (!isCurrent() || (el !== root && !root.contains(el))) return;
      bindings.forEach(safeApplyBinding);
      runInits(inits);
    }
    // @standard-start
    if (match(directive, "data")) refreshSubtreeBindings(el);
    // @standard-end
  };

  async function processElements(element, onlyAttributes = null) {
      const newBindings = [];
      const deferredBindings = [];
      const newInits = [];

      // Accepts one root element or an array of roots (structural directives
      // insert many sibling rows at once — one pass beats one call per row).
      const roots = Array.isArray(element) ? element : [element];
      let heElements = roots.flatMap(el => [el, ...el.querySelectorAll("*")]).filter(e => {
        // @standard-start
        // Another live root inside this one owns its own subtree.
        if (!owned(e)) return false;
        // @standard-end
        if (onlyAttributes) return roots.includes(e);
        if (HELIUM.processed.has(e)) return false;
        for (let i = 0; i < e.attributes.length; i++) {
          const n = e.attributes[i].name;
          if (n[0] === '@' || n[0] === ':' || n.startsWith('data-he-')) return true;
        }
        return false;
      });
      // Mark the roots themselves (even attribute-less ones) so the
      // MutationObserver skips nodes a structural render already handed to us.
      roots.forEach(el => owned(el) && HELIUM.processed.add(el));

      // @standard-start
      const imports = [];

      heElements.forEach((el) => {
        const importName = ["@import", "data-he-import"].find(name =>
          (!onlyAttributes || onlyAttributes.has(name)) && el.hasAttribute(name));
        const importAttr = importName ? el.getAttribute(importName) : null;
        if (importAttr) {
          importNames(importAttr).forEach(moduleName => {
            const path = importPath(moduleName);
            let promise = HELIUM.imports.get(path);
            if (!promise) {
              promise = import(path);
              HELIUM.imports.set(path, promise);
            }
            imports.push({ el, attr: importName, moduleName, path, promise, module: null });
          });
        }
      });

      await Promise.all(imports.map(async record => {
        try { record.module = await record.promise; }
        catch (error) {
          reportError(error, "import", { element: record.el, directive: record.attr, path: record.path });
        }
      }));
      if (!isCurrent()) return { bindings: [], inits: [] };
      // A root may have mounted inside this one while imports loaded; nothing
      // is installed below this point until ownership is checked again.
      heElements = heElements.filter(owned);
      imports.forEach(record => {
        if (!record.module || (record.el !== root && !root.contains(record.el)) || !owned(record.el)) return;
        Object.keys(record.module).forEach(key => key !== "default" && (state[key] = record.module[key]));
        if (typeof record.module.default !== "function") return;
        const key = behaviorKey(record.attr, record.moduleName);
        if (hasBehavior(record.el, key)) return;
        addBehavior(record.el, key);
        newInits.push({
          el: record.el,
          attr: record.attr,
          expression: record.moduleName,
          lifecycleKey: key,
          details: { behavior: record.moduleName, path: record.path },
          onFailure: () => removeBehavior(record.el, key),
          execute: signal => record.module.default(behaviorContext(record.el, signal, {
            directive: record.attr, behavior: record.moduleName, path: record.path,
          })),
        });
      });
      // @standard-end
      if (!isCurrent()) return { bindings: [], inits: [] };

      heElements.forEach(el => {
        // @standard-start
        const dataName = ["@data", "data-he-data"].find(name =>
          (!onlyAttributes || onlyAttributes.has(name)) && el.hasAttribute(name));
        const dataAttr = dataName ? el.getAttribute(dataName) : null;
        if (dataAttr != null) {
          try {
            const values = compile(dataAttr, true, { label: "@data", strict: true }).execute(createScope(el));
            if (!isReactiveObject(values) || Array.isArray(values)) {
              console.warn("Helium @data expects an object:", dataAttr);
            } else if (el === root) {
              const element = elementRecord(el);
              const baseline = element.dataBaseline ||= new Map();
              Object.keys(values).forEach(key => {
                if (!baseline.has(key)) baseline.set(key, {
                  present: Object.prototype.hasOwnProperty.call(state, key),
                  value: rawOf(state[key])
                });
              });
              Object.assign(state, values);
            } else addScope(el, createLocalScope(values, el));
            elementRecord(el).dataDirective = { attr: dataName, keys: new Set(Object.keys(values)) };
          } catch (error) {
            reportError(error, "binding", { element: el, directive: dataName, expression: dataAttr });
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
          if (name[0] !== '@' && name[0] !== ':' && !name.startsWith('data-he-')) continue;
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
          if (match(name, "data")) {
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
              // @standard-start
              triggerBehaviorRefs([value]);
              // @standard-end
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
            const inputHandler = e => setStateValue(el, value, isCheckbox ? e.target.checked : toBound(e.target.value), name);
            el.addEventListener(event, inputHandler);
            (elementRecord(el).listeners ||= []).push({receiver: el, event, handler: inputHandler, attr: name});
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
            newInits.push({ compiled: compile(value, true, { label: name, strict: true }), el, attr: name, expression: value });
          }
          else if (HTTP_OPTION_ATTRS.has(name)) continue;
          else if (name.startsWith("@") || name.startsWith('data-he-')) {
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
              try {
              // @standard-start
              if (isHttpMethod) {
                  const getAttr = a => el.getAttribute('data-he-' + a) || el.getAttribute('@' + a);
                  // Only build target/action when a @target is actually present —
                  // otherwise "".split(",") yields [""], which becomes querySelector("").
                  const targetAttr = getAttr('target');
                  const pairs = targetAttr ? targetAttr.split(",").map(p => p.split(":").map(s => s.trim())) : [];
                  const target = pairs.map(([target]) => target);
                  const action = pairs.map(([, action]) => action);
                  const requestOptions = getAttr("options") ? evalExpr(getAttr("options") || "{}") : {};
                  const requestHook = (attribute, magicName) => {
                    const expression = getAttr(attribute);
                    if (!expression) return undefined;
                    const compiled = compile(expression, true, { label: `@${attribute}`, strict: true });
                    return (value, request) => compiled.execute(createScope(
                      el, e, state, null, null, request.signal,
                      { [magicName]: value, $request: request },
                    ));
                  };
                  const options = {
                    ...requestOptions,
                    ...(targetAttr && { target }),
                    ...(targetAttr && { action }),
                    ...(getAttr("template") && { template: execExpr(getAttr("template")),}),
                    ...(getAttr("loading") && { loading: execExpr(getAttr("loading"))}),
                    ...(getAttr("success") && { success: requestHook("success", "$response") }),
                    ...(getAttr("error") && { error: requestHook("error", "$error") }),
                    latest: requestOptions.latest ?? true,
                    requestKey: requestOptions.requestKey ?? name,
                  };
                  let paramsAttr = getAttr("params");
                  if (!paramsAttr && el.hasAttribute("name")) {
                    const keys = (el.getAttribute("name").match(/\w+/g) || []).map(key => `${key}:`).join``;
                    paramsAttr = keys + (isCheckbox ? "checked" : "value");
                  } else paramsAttr ||= "{}";
                  // Shorthand "user:name:value" nests the element's own `value`
                  // under user.name. Build the object directly: interpolating the
                  // live value into an expression would execute user input.
                  const props = !paramsAttr.trim().startsWith("{") && paramsAttr.includes(":")
                    ? paramsAttr.split(":").map(s => s.trim()) : null;
                  const params = props
                    ? props.slice(0, -1).reduceRight((acc, key) => ({ [key]: acc }), el[props[props.length - 1]])
                    : compile(paramsAttr, true, { label: "@params", strict: true }).execute(createScope(el, e));
                  // Fire-and-forget from an attribute handler: log failures here.
                  ajax(value, eventName.toUpperCase(), options, params, el)
                    .catch(() => {});
              } else
              // @standard-end
              {
                const scope = createScope(el, e);
                const compiled = compile(value, true, { label: name, strict: true });
                // Inline expressions may return a promise (e.g. $get/$post);
                // swallow rejections so fire-and-forget calls don't warn.
                const result = compiled.execute(scope);
                if (result && typeof result.then === "function")
                  Promise.resolve(result).catch(error => {
                    if (error?.name !== "AbortError") reportError(error, "event", {
                      element: el, directive: name, expression: value, event: e,
                    });
                  });
              }
              } catch (error) {
                reportError(error, "event", { element: el, directive: name, expression: value, event: e });
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
            (elementRecord(el).listeners ||= []).push({receiver, event, handler, options: eventOptions, attr: name});
          }
        }
      });
      deferredBindings.forEach(b => {
        (elementRecord(b.el).bound ||= []).push(b);
        b.initialExecution = executeBinding(b);
        b.calc || b.loop || b.cond ? newBindings.unshift(b) : newBindings.push(b);
      })
      return { bindings: newBindings, inits: newInits };
    }

    // Disconnect old observer if exists, then create new one
    HELIUM.observer?.disconnect();
    HELIUM.mutate = async (ms) => {
      if (!isCurrent()) return;
      // A retained ref may have moved within the DOM without being added or
      // removed from the registry, so invalidate cached DOM ordering for every
      // child-list batch when refs exist.
      if (HELIUM.refs.size) {
        refsRevision++;
        // @standard-start
        triggerBehaviorRefs();
        // @standard-end
      }
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
            bindings.forEach(safeApplyBinding);
            runInits(inits);
          }
          // @standard-start
          // An element moved within the root may now sit in a different local
          // scope, so its bindings re-resolve their values and dependencies.
          // Rows Helium itself reorders keep their scope and are skipped.
          else if (n.nodeType === 1 && root.contains(n) && !GENERATED.has(n)) HELIUM.refresh(n);
          // @standard-end
        }
      }
      const attributeChanges = new Map();
      for (const m of ms) {
        if (m.type !== "attributes") continue;
        const el = m.target, attr = m.attributeName;
        if (addedRoots.some(added => added === el || added.contains(el))) continue;
        if (attr[0] !== "@" && attr[0] !== ":" && !attr.startsWith("data-he-")) continue;
        let changes = attributeChanges.get(el);
        if (!changes) attributeChanges.set(el, changes = new Map());
        if (!changes.has(attr)) changes.set(attr, m.oldValue);
      }
      for (const [el, changes] of attributeChanges) {
        for (const [attr, oldValue] of changes) await reconcileDirective(el, attr, oldValue);
      }
    };
    HELIUM.observer = new MutationObserver(HELIUM.mutate);
    HELIUM.observer.observe(root, { childList: true, subtree: true, attributes: true, attributeOldValue: true });

    // The subtree observer above cannot see its own root being removed from a
    // parent. Watch its current tree plus the owner document (for shadow-host
    // removal) so external DOM owners cannot bypass cancellation and cleanup.
    let rootWasConnected = root.isConnected;
    HELIUM.rootDisconnectTimer = null;
    HELIUM.rootObserver = new MutationObserver(() => {
      if (!isCurrent()) return;
      if (root.isConnected) {
        if (HELIUM.rootDisconnectTimer !== null) clearTimeout(HELIUM.rootDisconnectTimer);
        HELIUM.rootDisconnectTimer = null;
        return void (rootWasConnected = true);
      }
      if (!rootWasConnected) return;
      // Turbo temporarily parks permanent elements outside the document while
      // it renders the incoming body. Give that explicit contract one task to
      // reconnect before treating the mounted root as genuinely removed.
      if (root.closest?.("[data-turbo-permanent]")) {
        if (HELIUM.rootDisconnectTimer === null) {
          HELIUM.rootDisconnectTimer = setTimeout(() => {
            HELIUM.rootDisconnectTimer = null;
            if (!root.isConnected && isCurrent()) heliumTeardown();
          }, 0);
        }
      } else {
        heliumTeardown();
      }
    });
    const rootTree = root.getRootNode();
    HELIUM.rootObserver.observe(rootTree, { childList: true, subtree: true });
    if (rootTree !== root.ownerDocument) {
      HELIUM.rootObserver.observe(root.ownerDocument || document, { childList: true, subtree: true });
    }

    // Read localStorage before processElements (which sets @data defaults and triggers saves via proxy)
    const savedState = storageKey ? (() => { try { return JSON.parse(localStorage.getItem(storageKey)); } catch { return null; } })() : null;
    const { bindings: initialBindings, inits } = await processElements(root);
    if (!isCurrent()) return state;
    // Merge saved values after @data defaults, so localStorage takes priority
    if (savedState) Object.assign(state, savedState);
    initialBindings.forEach(safeApplyBinding);
    runInits(inits);

    return state;
  }

  // Teardown function
  function heliumTeardown() {
    generation++;
    HELIUM?.teardown?.(true);
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
let defaultActive = false;
let defaultAutoTimer = null;

function suppressDefaultAutoInit() {
  defaultInitialized = true;
  if (defaultAutoTimer !== null) {
    clearTimeout(defaultAutoTimer);
    defaultAutoTimer = null;
  }
  if (defaultActive) {
    defaultActive = false;
    _defaultTeardown();
  }
}

function defaultHelium(initialState) {
  defaultActive = true;
  defaultInitialized = true;
  if (defaultAutoTimer !== null) {
    clearTimeout(defaultAutoTimer);
    defaultAutoTimer = null;
  }
  return runDefaultHelium(initialState);
}

function mount(root, initialState) {
  suppressDefaultAutoInit();
  return runDefaultMount(root, initialState);
}

defaultHelium.mount = mount;

// Public teardown leaves the module usable for an explicit future mount, while
// suppressing any still-pending one-shot auto initialization.
function heliumTeardown() {
  suppressDefaultAutoInit();
}

// Variants such as the CSP build replace the default instance entirely.
// @standard-start
function disableDefault() {
  defaultDisabled = true;
  defaultInitialized = true;
  defaultActive = false;
  if (defaultAutoTimer !== null) clearTimeout(defaultAutoTimer);
  defaultAutoTimer = null;
  _defaultTeardown();
}
// @standard-end

// Setup browser globals and auto-initialization
if (typeof window !== 'undefined') {
  window.helium = defaultHelium;
  window.heliumTeardown = heliumTeardown;
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
}

export {
  defaultHelium as helium,
  heliumTeardown,
  disableDefault,
  registerSSE,
  registerTurbo,
  LIVE as liveInstances,
  GENERATED as generatedNodes,
};
export default defaultHelium;

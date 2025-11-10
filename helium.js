const parseEx=v=>{try{return Function(`return(${v})`)()}catch{return v}}
const getEvent = el => ({form:"submit",input:"input",textarea:"input",select:"change"}[el.tagName.toLowerCase()]||"click")
const debounce=(f,d)=>{let t;return(...a)=>(clearTimeout(t),t=setTimeout(f,d,...a))}

// Single global object to hold all settings
let HELIUM = null;

window.helium = function() {
  let initFn;
  const ALL = Symbol("all");
  const he = (n,...a) => a.map(b => `|@${b}|data-he-${b}|`).join``.includes(`|${n.split(/[.:]/)[0]}|`);
  const root = document.querySelector("[\\@helium]") || document.querySelector("[data-helium]") || document.body;
  
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

  const update = (data,target,action,template) => {
    const element = target instanceof Node ? target : (HELIUM.refs.get(target) || $(target));
    if(element){
      const content = html(template ? template(data) : data);
      action ? element[action=="replace"?"replaceWith":action](content) : element.innerHTML = content;
      return content
    } else state[target] = data
  }  
  
const ajax = (u,m,o={},p={}) => {
    if(o.loading) o.target = update(o.loading,o.target,o.action) || o.target;
    const fd = p instanceof FormData, t = document.querySelector('meta[name="csrf-token"]')?.content;
    const url = new URL(u, window.location.href);
    const sameOrigin = url.origin === window.location.origin;
fetch(u, {
  method: m,
  headers: {
    Accept:"text/vnd.turbo-stream.html,application/json,text/html",
    ...(!fd && m !== "GET" && {"Content-Type":"application/json"}),
    ...(sameOrigin && t ? {"X-CSRF-Token": t} : {})
  },
  body: m === "GET" ? null : (fd ? p : JSON.stringify(p)),
  credentials: sameOrigin ? "same-origin" : "omit"
})
      .then(r => {
        const type = r.headers.get("content-type") || "";
        return (type.includes("turbo-stream") ? r.text().then(d => ({ t: true, d })) :
                type.includes("json")         ? r.json() :
                                                r.text());
      }).then(d =>
        d.t && "Turbo"
          ? Turbo.renderStreamMessage(d.d)
          : update(d, o.target, o.loading ? "replace" : o.action, o.template)
      ).catch(e => console.error("AJAX:", e.message));
  }

  const get = (u,t) => ajax(u,"GET",t);
  const [post, put, patch, del] = ["POST","PUT","PATCH","DELETE"].map(m => (u, d, t) => ajax(u, m, t, d));
  
const handler = {
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
      if (Array.isArray(t) && !isNaN(p)) {
        const parentKey = HELIUM.parentKeys.get(t);
        if (parentKey) HELIUM.bindings.get(parentKey)?.forEach(applyBinding);
      }   
      HELIUM.bindings.get(p)?.concat(...(HELIUM.bindings.get(ALL) ?? []))?.forEach(applyBinding); 
      return res
    }
};

  // Initialize state if it doesn't exist
  const state = new Proxy({}, handler);
  
function applyBinding(b,e={},elCtx=b.el){
  const {el,prop,fn,calc}=b;
  const r=fn($,state,e,elCtx,html,...Object.values(state),...[...HELIUM.refs.values()]);
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
    return el.style = Object.entries(r).filter(([,v])=>v)
      .map(([k,v])=>`${k}:${v}`).join(";");

  if (prop in el) {
    if(el.type==="radio") el.checked = el.value===r;
    else el[prop] = prop==="textContent"?r:parseEx(r);
    return;
  }

  el.setAttribute(prop, parseEx(r));
}

const compile = (expr, withReturn = false) => {
  // Auto-detect if this should be a statement block
  const hasStatements = /[;\r\n]/.test(expr);
  const useReturn = withReturn && (!hasStatements || expr.trim().startsWith('{') && expr.trim().endsWith('}'));
  const key = `${useReturn}:${expr}`;
  if (HELIUM.fnCache.has(key)) return HELIUM.fnCache.get(key);
  try {
    const fn = new Function(
      "$","$data","$event","$el","$html","$get","$post","$put","$patch","$delete",
      ...Object.keys(state), ...[...HELIUM.refs.keys()],
      useReturn 
        ? `with($data){return(${expr.trim()})}` 
        : `with($data){${expr.trim()}}`
    );
    HELIUM.fnCache.set(key, fn);
    return fn;
  } catch {
    return () => expr;
  }
};

const trackDependencies = (fn, el, excludeChanged = false) => {
  const accessed = excludeChanged ? new Map() : new Set();
  const trackProxy = new Proxy(state, {
    get(target, prop) {
      if (typeof prop == 'string') {
        if (excludeChanged && !accessed.has(prop)) {
          accessed.set(prop, target[prop]); // Store initial value
        } else if (!excludeChanged) {
          accessed.add(prop);
        }
      }
      const val = target[prop];
      return typeof val == "object" && val != null ? new Proxy(val, this) : val;
    }
  });
  
  try { fn.call(null, $, trackProxy, HELIUM.refs); } catch {}
  
  if (excludeChanged) {
    return [...accessed.keys()].filter(prop => state[prop] === accessed.get(prop));
  }
  return [...accessed];
};

  const cleanup = el => {
    [el,...el.querySelectorAll('*')].forEach(e => {
      HELIUM.listeners.get(e)?.forEach(({receiver,event,handler}) => receiver.removeEventListener(event,handler));
      HELIUM.listeners.delete(e);
    });
  };

function processElements(element) {
    const newBindings = [];
    const deferredBindings = [];

    const heElements = [element, ...element.querySelectorAll("*")]
      .filter(e => !HELIUM.processed.has(e) && [...e.attributes].some(a => /^(@|:|data-he)/.test(a.name)));

    const addBinding = (val, b) => {
      HELIUM.bindings.set(val, b.calc ? [b,...(HELIUM.bindings.get(val) || [])] : [...(HELIUM.bindings.get(val) || []), b]);
      b.calc ? newBindings.unshift(b) : newBindings.push(b);
    };

    heElements.forEach(el => {
      HELIUM.processed.add(el);
      
      const attrs = el.attributes;
      const execFn = v => compile(v, true)($, state, {}, el, html, get, post, put, patch, del, ...Object.values(state), ...[...HELIUM.refs.values()]);
      const inputType = el.type?.toLowerCase();
      const isCheckbox = inputType == "checkbox", isRadio = inputType == "radio", isSelect = el.tagName == "SELECT";

      // Single loop through attributes with early skipping
      for (let i = 0; i < attrs.length; i++) {
        const {name, value} = attrs[i];
        
        // Skip non-helium attributes early
        if (!name.startsWith('@') && !name.startsWith(':') && !name.startsWith('data-he')) continue;

        // Initialize state first if needed
        if (he(name, "text", "html", "bind")) {
          try {
            new Function(`let ${value}=1`);
            state[value] ??= he(name, "bind") ? (el.type == "checkbox" ? el.checked : el.value) : el.textContent;
          } catch {}
        }

        // Process the attribute
        if (["@data", "data-he"].includes(name)) {
          Object.assign(state, parseEx(value));
        }
        else if (name.startsWith(":") || name.startsWith("data-he-attr:")) {
          const fn = compile(value, true);
          deferredBindings.push(() => trackDependencies(fn, el).forEach(dep => addBinding(dep, {el, prop: name.slice(name.startsWith(":") ? 1 : 13), fn})));
        }
        else if (he(name, "ref")) {
          HELIUM.refs.set("$" + value, el);
        }
        else if (he(name, "text", "html")) {
          const fn = compile(value, true);
          const b = {el, prop: he(name, "text") ? "textContent" : "innerHTML", fn};
          deferredBindings.push(() => trackDependencies(fn, el).forEach(dep => addBinding(dep, b)));
        }
        else if (he(name, "bind")) {
          const event = (isCheckbox || isRadio || isSelect) ? "change" : "input";
          const prop = isCheckbox ? "checked" : "value";
          const inputHandler = e => state[value] = isCheckbox ? e.target.checked : e.target.value;
          el.addEventListener(event, inputHandler);
          if (!HELIUM.listeners.has(el)) HELIUM.listeners.set(el, []);
          HELIUM.listeners.get(el).push({receiver: el, event, handler: inputHandler});
          addBinding(value, {el, prop, fn: compile(value, true)});
          if (isCheckbox) el.checked = !!state[value];
          else if (isRadio) el.checked = el.value == state[value];
          else el.value = state[value] ?? "";
        }
        else if (he(name, "hidden", "visible")) {
          const fn = compile(`${he(name, "hidden") ? "!" : ""}!(${value})`, true);
          deferredBindings.push(() => trackDependencies(fn, el).forEach(dep => addBinding(dep, {el, prop: "hidden", fn})));
        }
        else if (he(name, "calculate")) {
          const calc = name.split(":")[1];
          const fn = compile(value, true);
          deferredBindings.push(() => trackDependencies(fn, el, true).forEach(key => addBinding(key, {el, calc, prop: null, fn})));
        }
        else if (he(name, "effect")) {
          const keys = name.split(":").slice(1);
          const fn = compile(value, true);
          deferredBindings.push(() => {
            const tracked = keys.includes("*") ? [ALL] : trackDependencies(fn, el, true).concat(keys);
            tracked.forEach(key => addBinding(key, {el, prop: null, fn}));
          })
        }
        else if (he(name, "init")) {
          initFn = compile(value, true);
        }
        else if (name.startsWith("@") || name.startsWith("data-he")) {
          const fullName = name.startsWith("@") ? name.slice(1) : name.slice(8);
          const [eventName, ...mods] = fullName.split(".");
          const isHttpMethod = ["get", "post", "put", "patch", "delete"].includes(eventName);
          const event = isHttpMethod ? getEvent(el) : eventName;
          const receiver = mods.includes("outside") || mods.includes("document") ? document : el;
          const debounceMod = mods.find(m => m.startsWith("debounce"));
          const debounceDelay = debounceMod ? (t => t && !isNaN(t) ? Number(t) : 300)(debounceMod.split(":")[1]) : 0;
          const _handler = e => {
    const exFn = v => compile(v,true)($, state, e, el, html, get, post, put, patch, del, ...Object.values(state), ...[...HELIUM.refs.values()])
            if (mods.includes("prevent")) e.preventDefault();
            const keyMods = {shift: "shiftKey", ctrl: "ctrlKey", alt: "altKey", meta: "metaKey"};
            for (const [mod, prop] of Object.entries(keyMods)) if (mods.includes(mod) && !e[prop]) return;
            if (["keydown", "keyup", "keypress"].includes(event)) {
              const last = mods[mods.length - 1];
              if (last && !["prevent", "once", "outside", "document"].includes(last)) {
                const keyName = e.key == " " ? "Space" : e.key == "Escape" ? "Esc" : e.key;
                if (keyName.toLowerCase() !== last.toLowerCase()) return;
              }
            }
            if (!mods.includes("outside") || !el.contains(e.target)) {
              if (isHttpMethod) {
                const getAttr = name => el.getAttribute(`data-he-${name}`) || el.getAttribute(`@${name}`);
                const [target, action] = (getAttr('target') || "").split(":");
                const options = {
                  ...(getAttr("options") && parseEx(getAttr("options") || "{}")),
                  ...(target && { target }),
                  ...(action && { action }),
                  ...(getAttr("template") && { template: execFn(getAttr("template")),}),
                  ...(getAttr("loading") && { loading: execFn(getAttr("loading"))}),
                };
                let paramsAttr = getAttr('params') || '{}';
                if (!paramsAttr.trim().startsWith("{") && paramsAttr.includes(":")) {
                  const props = paramsAttr.split(":").map(s => s.trim());
                  paramsAttr = props.reduceRight((acc, key, i) => `{ ${key}: ${i == 1 ? `'${el[acc]}'` : acc} }`);
                }
                const params = exFn(paramsAttr);
                ajax(value, eventName.toUpperCase(), options, params);
              } else {
                exFn(value);
              }
            }
            if (mods.includes("once")) receiver.removeEventListener(event, handler);
          };
          const handler = debounceDelay > 0 ? debounce(_handler, debounceDelay) : _handler;
          receiver.addEventListener(event, handler);
          if (!HELIUM.listeners.has(el)) HELIUM.listeners.set(el, []);
          HELIUM.listeners.get(el).push({receiver, event, handler});
        }
      }
    });
    deferredBindings.forEach(fn => fn());
    return newBindings;
  }
  
  // Disconnect old observer if it exists
  if (HELIUM.observer) HELIUM.observer.disconnect();
  
  // Create new observer
  HELIUM.observer = new MutationObserver(ms => {
    for (const m of ms) {
      m.removedNodes.forEach(n => n.nodeType === 1 && cleanup(n));
      m.addedNodes.forEach(n => n.nodeType === 1 && !HELIUM.processed.has(n) && processElements(n).forEach(applyBinding));
    }
  });
  HELIUM.observer.observe(root, { childList: true, subtree: true });
  
  processElements(root);
  for (const [key, items] of HELIUM.bindings.entries()) items.forEach(applyBinding);
  if(initFn) initFn($, state, {}, {}, html, get, post, put, patch, del, ...Object.values(state), ...[...HELIUM.refs.values()])
}

window.heliumTeardown = function() {
  if (HELIUM?.observer) HELIUM.observer.disconnect();
  HELIUM?.bindings?.clear();
  HELIUM?.refs?.clear();
  HELIUM?.parentKeys?.clear();
  HELIUM?.fnCache?.clear(); 
  HELIUM = null;
}

// Initialize on load
document.addEventListener("DOMContentLoaded", () => helium());

// Turbo integration
document.addEventListener("turbo:before-render", () => {
  if (HELIUM?.observer) HELIUM.observer.disconnect();
  window.heliumTeardown();
});

document.addEventListener("turbo:render", () => {
  helium();
});

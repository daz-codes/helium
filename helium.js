const parseEx=v=>{try{return Function(`return(${v})`)()}catch{return v}}
const getEvent = el => ({form:"submit",input:"input",textarea:"input",select:"change"}[el.tagName.toLowerCase()]||"click")
const debounce=(f,d)=>{let t;return(...a)=>(clearTimeout(t),t=setTimeout(f,d,...a))}

// Single global object to hold all settings
let HELIUM = null;

window.helium = function() {
  let initFn;
  const ALL = Symbol("all");
  const he = (n,...a) => {
  const prefix = n.split(/[.:]/)[0];
  if (prefix === ":" || prefix === "") return false;
  return a.map(b => `|@${b}|data-he-${b}|`).join``.includes(`|${prefix}|`);
};
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

  const update = (data,targets,actions,template) => {
    const newTargets = [];
    targets.forEach((target,i) => {
    const element = target instanceof Node ? target : (HELIUM.refs.get(target.trim()) || $(target.trim()));
      if(element){
        const content = template ? template(data) : data;
        actions[i] ? element[actions[i]=="replace"?"replaceWith":actions[i]](html(content)) : element.innerHTML = content;
        newTargets.push(actions[i] ? content : element)
      } else state[target] = data
    })
    return newTargets
  }  
  
const ajax = (url,method,options={},params={}) => {
    if(options.loading) options.target = update(options.loading,options.target,options.action) || options.target;
    const fd = params instanceof FormData, token = document.querySelector('meta[name="csrf-token"]')?.content;
    const path = new URL(url, window.location.href);
    const sameOrigin = path.origin === window.location.origin;
fetch(url, {
  method,
  headers: {
    Accept:"text/vnd.turbo-stream.html,application/json,text/html",
    ...(!fd && method !== "GET" && {"Content-Type":"application/json"}),
    ...(sameOrigin && token ? {"X-CSRF-Token": token} : {})
  },
  body: method === "GET" ? null : (fd ? params : JSON.stringify(params)),
  credentials: sameOrigin ? "same-origin" : "omit"
})
      .then(res => {
        const type = res.headers.get("content-type") || "";
        return (type.includes("turbo-stream") ? res.text().then(data => ({ turbo: true, data })) :
                type.includes("json")         ? res.json() :
                                                res.text());
      }).then(data =>
        data.turbo && "Turbo"
          ? Turbo.renderStreamMessage(data.data)
          : update(data, options.target, options.loading ? options.action.map(a => a && "replace") : options.action, options.template)
      ).catch(e => console.error("AJAX:", e.message));
  }

  const get = (url,target) => ajax(url,"GET",target);
  const [post, put, patch, del] = ["POST","PUT","PATCH","DELETE"].map(method => (url, params, options) => ajax(url, method, options, params));
  
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
  return el.style.cssText = Object.entries(r).map(([k,v])=>v?`${k}:${v}`:'').join(";");

  if (prop in el) {
    if (el.type === "radio" && prop != "checked") el.checked = el.value===r;
    else el[prop] = prop==="textContent"?r:parseEx(r);
    return;
  }

  el.setAttribute(prop, parseEx(r));
}
  
const compile = (expr, withReturn = false) => {
  const key = `${withReturn}:${expr}`;
  if (HELIUM.fnCache.has(key)) return HELIUM.fnCache.get(key);
  try {
    const fn = new Function(
      "$","$data","$event","$el","$html","$get","$post","$put","$patch","$delete",
      ...Object.keys(state), ...[...HELIUM.refs.keys()],
      withReturn 
        ? `with($data){return(${expr.trim()})}` 
        : `with($data){${expr.trim()}}`
    );
    HELIUM.fnCache.set(key, fn);
    return fn;
  } catch {
    try {
      const fn = new Function(
        "$","$data","$event","$el","$html","$get","$post","$put","$patch","$delete",
        ...Object.keys(state), ...[...HELIUM.refs.keys()],
        `with($data){${expr.trim()}}`
      );
      HELIUM.fnCache.set(key, fn);
      return fn;
    } catch {
      return () => expr;
    }
  }
};

const trackDependencies = (fn, el, excludeChanged = false) => {
  const accessed = excludeChanged ? new Map() : new Set();
  const trackProxy = new Proxy(state, {
    get(target, prop) {
      if (typeof prop == 'string') {
        excludeChanged ? !accessed.has(prop) && accessed.set(prop, target[prop]) : accessed.add(prop);
      }
      const val = target[prop];
      return typeof val == "object" && val != null ? new Proxy(val, this) : val;
    }
  });
  
  try { fn.call(null, $, trackProxy, HELIUM.refs); } catch {}
  
  return excludeChanged ? [...accessed.keys()].filter(prop => state[prop] === accessed.get(prop)) : [...accessed];
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
          deferredBindings.push({el, prop: name.slice(name.startsWith(":") ? 1 : 13), fn: compile(value, true)});
        }
        else if (he(name, "ref")) {
          HELIUM.refs.set("$" + value, el);
        }
        else if (he(name, "text", "html")) {
          deferredBindings.push({el, prop: he(name, "text") ? "textContent" : "innerHTML", fn: compile(value, true)});
        }
        else if (he(name, "bind")) {
          const event = (isCheckbox || isRadio || isSelect) ? "change" : "input";
          const prop = isCheckbox ? "checked" : "value";
          const inputHandler = e => state[value] = isCheckbox ? e.target.checked : e.target.value;
          el.addEventListener(event, inputHandler);
          if (!HELIUM.listeners.has(el)) HELIUM.listeners.set(el, []);
          HELIUM.listeners.get(el).push({receiver: el, event, handler: inputHandler});
          deferredBindings.push({el, prop, fn: compile(value, true)});
          if (isCheckbox) el.checked = !!state[value];
          else if (isRadio) el.checked = el.value == state[value];
          else el.value = state[value] ?? "";
        }
        else if (he(name, "hidden", "visible")) {
          deferredBindings.push({el, prop: "hidden", fn: compile(`${he(name, "hidden") ? "!" : ""}!(${value})`, true)});
        }
        else if (he(name, "calculate")) {
          deferredBindings.push({el, calc: name.split(":")[1], prop: null, fn: compile(value, true)});
        }
        else if (he(name, "effect")) {
          deferredBindings.push({el, prop: null, fn: compile(value, true), keys: name.split(":").slice(1)});
        }
        else if (he(name, "import")) {
          value.split(",").map(s => s.trim()).forEach(v => state[v] = window[v]);
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
                const pairs = (getAttr('target') || "").split(",").map(p => p.split(":").map(s => s.trim()));
const target = pairs.map(([target]) => target);
const action = pairs.map(([, action]) => action);
                const options = {
                  ...(getAttr("options") && parseEx(getAttr("options") || "{}")),
                  ...(target && { target }),
                  ...(action && { action }),
                  ...(getAttr("template") && { template: execFn(getAttr("template")),}),
                  ...(getAttr("loading") && { loading: execFn(getAttr("loading"))}),
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
                const params = exFn(paramsAttr);
                ajax(value, eventName.toUpperCase(), options, params);
              } else exFn(value);
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
    deferredBindings.forEach(b => {
      const tracked = b.keys?.includes("*") ? [ALL] : trackDependencies(b.fn, b.el, true).concat(b.keys);
      tracked.forEach(key => addBinding(key, b));
    })
    return newBindings;
  }
  
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
  HELIUM = null;
}

// Initialize on load
document.addEventListener("DOMContentLoaded",_ => helium());
// Turbo integration
document.addEventListener("turbo:before-render",_ => window.heliumTeardown());
document.addEventListener("turbo:render",_ => helium());

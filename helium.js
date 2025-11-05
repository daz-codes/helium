const parseEx=v=>{try{return Function(`return(${v})`)()}catch{return v}}
const getEvent = el => ({form:"submit",input:"input",textarea:"input",select:"change"}[el.tagName.toLowerCase()]||"click")
const debounce=(f,d)=>{let t;return(...a)=>(clearTimeout(t),t=setTimeout(f,d,...a))}

(function () {
  let initFn;
  const he = (n,...a) => a.map(b => `|@${b}|data-he-${b}|`).join``.includes(`|${n.split(/[.:]/)[0]}|`);
  const root = document.querySelector("[\\@helium]") || document.querySelector("[data-helium]") || document.body;
  const [bindings, refs, listeners, processed, parentKeys, fnCache, proxyCache] = [new Map(), new Map(), new WeakMap(), new WeakSet(), new WeakMap(), new Map(), new WeakMap()];
  const $ = s => document.querySelector(s);
  const html = s => Object.assign(document.createElement("template"),{innerHTML:s.trim()}).content.firstChild

  const update = (data,target,action,template) => {
    const element = target instanceof Node ? target : (refs.get(target) || $(target));
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
      if (proxyCache.has(v)) return proxyCache.get(v);
      const proxy = new Proxy(v, handler);
      proxyCache.set(v, proxy);
      parentKeys.set(v, p);
      return proxy;
    }
    return v;
  },
    set: (t,p,v) => {
      const res = Reflect.set(t,p,v);    
      if (Array.isArray(t) && !isNaN(p)) {
        const parentKey = parentKeys.get(t);
        if (parentKey) bindings.get(parentKey)?.forEach(applyBinding);
      }   
      bindings.get(p)?.forEach(applyBinding); 
      return res
    }
};

  const state = new Proxy({}, handler);
  
function applyBinding(b,e={},elCtx=b.el){
  const {el,prop,fn,calc}=b;
  const r=fn($,state,e,elCtx,html,...Object.values(state),...[...refs.values()]);
  if (calc) state[calc] = r
  if (prop==="innerHTML" && Array.isArray(r) && el.children.length > 0)
    return updateList(el, r);
  
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


function updateList(el,r){
  const temp = html(`<${el.tagName.toLowerCase()}>${r.join``}</${el.tagName.toLowerCase()}>`);
  const newChildren = [...temp.children];
  
  const newItems = newChildren.map((child, idx) => ({
    key: child.getAttribute("key") || child.dataset.key,
    element: child,
    index: idx
  }));
  
  const existingItems = [...el.children].map((child, idx) => ({
    key: child.getAttribute("key") || child.dataset.key,
    element: child,
    index: idx
  }));
  
  for (let i = 0; i < Math.max(newItems.length, existingItems.length); i++) {
    const existing = existingItems[i];
    const newItem = newItems[i];
    
    if (!newItem && existing) {
      cleanup(existing.element);
      existing.element.remove();
    } else if (newItem && !existing) {
      el.appendChild(newItem.element);
    } else if (newItem && existing) {
      if (existing.element.outerHTML !== newItem.element.outerHTML) {
        if(typeof Idiomorph === "object") {
          Idiomorph.morph(existing.element, newItem.element.outerHTML);
        } else {
          cleanup(existing.element);
          existing.element.replaceWith(newItem.element);
        }
      }
    }
  }    
    } 

const compile = (expr, withReturn = false) => {
  // Auto-detect if this should be a statement block
  const hasStatements = /[;\r\n]/.test(expr);
  const useReturn = withReturn && !hasStatements;
  
  const key = `${useReturn}:${expr}`;
  if (fnCache.has(key)) return fnCache.get(key);
  try {
    const fn = new Function(
      "$","$data","$event","$el","$html","$get","$post","$put","$patch","$delete",
      ...Object.keys(state), ...[...refs.keys()],
      useReturn 
        ? `with($data){return(${expr.trim()})}` 
        : `with($data){${expr.trim()}}`
    );
    fnCache.set(key, fn);
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
  
  try { fn.call(null, $, trackProxy, refs); } catch {}
  
  if (excludeChanged) {
    return [...accessed.keys()].filter(prop => data[prop] === accessed.get(prop));
  }
  return [...accessed];
};

  const cleanup = el => {
    [el,...el.querySelectorAll('*')].forEach(e => {
      listeners.get(e)?.forEach(({receiver,event,handler}) => receiver.removeEventListener(event,handler));
      listeners.delete(e);
    });
  };

function processElements(element) {
    const newBindings = [];

    const heElements = [element, ...element.querySelectorAll("*")]
      .filter(e => !processed.has(e) && [...e.attributes].some(a => /^(@|:|data-he)/.test(a.name)));

    const addBinding = (val, b) => {
      bindings.set(val, [...(bindings.get(val) || []), b]);
      b.calc ? newBindings.unshift(b) : newBindings.push(b);
    };

    heElements.forEach(el => {
      processed.add(el);
      
      const attrs = el.attributes;
      const execFn = v => compile(v, true)($, state, {}, el, html, get, post, put, patch, del, ...Object.values(state), ...[...refs.values()]);
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
          Object.assign(state, execFn(value));
        }
        else if (he(name, "ref")) {
          refs.set("$" + value, el);
        }
        else if (he(name, "text", "html")) {
          const fn = compile(value, true);
          const b = {el, prop: he(name, "text") ? "textContent" : "innerHTML", fn};
          trackDependencies(fn, el).forEach(dep => addBinding(dep, b));
        }
        else if (he(name, "bind")) {
          const event = (isCheckbox || isRadio || isSelect) ? "change" : "input";
          const prop = isCheckbox ? "checked" : "value";
          const inputHandler = e => state[value] = isCheckbox ? e.target.checked : e.target.value;
          el.addEventListener(event, inputHandler);
          if (!listeners.has(el)) listeners.set(el, []);
          listeners.get(el).push({receiver: el, event, handler: inputHandler});
          addBinding(value, {el, prop, fn: compile(value, true)});
          if (isCheckbox) el.checked = !!state[value];
          else if (isRadio) el.checked = el.value == state[value];
          else el.value = state[value] ?? "";
        }
        else if (he(name, "hidden", "visible")) {
          const fn = compile(`${he(name, "hidden") ? "!" : ""}!(${value})`, true);
          trackDependencies(fn, el).forEach(dep => addBinding(dep, {el, prop: "hidden", fn}));
        }
        else if (he(name, "calculate")) {
          const calc = name.split(":")[1];
          const fn = compile(value, true);
          trackDependencies(fn, el, true).forEach(key => addBinding(key, {el, calc, prop: null, fn}));
        }
        else if (he(name, "effect")) {
          const keys = name.split(":").slice(1);
          const fn = compile(value, true);
const tracked = keys.includes("*") ? Object.keys(state) : trackDependencies(fn, el, true).concat(keys);
          tracked.forEach(key => addBinding(key, {el, prop: null, fn}));
        }
        else if (he(name, "class")) {
          const fn = compile(value, true);
          trackDependencies(fn, el).forEach(dep => addBinding(dep, {el, prop: "class", fn}));
        }
        else if (name.startsWith(":") || name.startsWith("data-he-attr:")) {
          const fn = compile(value, true);
          trackDependencies(fn, el).forEach(dep => addBinding(dep, {el, prop: name.slice(name.startsWith(":") ? 1 : 13), fn}));
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
    const exFn = v => compile(v)($, state, e, el, html, get, post, put, patch, del, ...Object.values(state), ...[...refs.values()])
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
                  ...exFn(getAttr('options') || '{}'),
                  ...(target && {target}),
                  ...(action && {action}),
                  ...execFn(getAttr('template')) && {template: execFn(getAttr('template'))},
                  ...getAttr('loading') && {loading: getAttr('loading')}
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
          if (!listeners.has(el)) listeners.set(el, []);
          listeners.get(el).push({receiver, event, handler});
        }
      }
    });
    return newBindings;
  }
  new MutationObserver(ms=>{
    for(const m of ms){
      m.removedNodes.forEach(n=>n.nodeType===1&&cleanup(n));
      m.addedNodes.forEach(n=>n.nodeType===1&&!processed.has(n)&&processElements(n).forEach(applyBinding));
    }
  }).observe(root,{childList:1,subtree:1});
  processElements(root);
  for (const [key, items] of bindings.entries()) items.forEach(applyBinding);
  if(initFn) initFn($, state, {}, {}, html,get,post, put,patch,del, ...Object.values(state), ...[...refs.values()])
})()

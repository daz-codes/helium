const parseEx=v=>{try{return Function(`return(${v})`)()}catch{return v}}
const getEvent = el => ({form:"submit",input:"input",textarea:"input",select:"change"}[el.tagName.toLowerCase()]||"click")
const debounce=(f,d)=>{let t;return(...a)=>(clearTimeout(t),t=setTimeout(f,d,...a))}

export default function helium(data = {}) {
  const he = (n,...a) => a.map(b => `|@${b}|data-he-${b}|`).join``.includes(`|${n.split('.')[0]}|`);
  const root = document.querySelector("[\\@helium]") || document.querySelector("[data-helium]") || document.body;
  const [bindings, refs, listeners] = [new Map(), new Map(), new WeakMap()];
  const $ = s => document.querySelector(s);
  const html = s => {const t = document.createElement("template"); t.innerHTML = s.trim(); return t.content.firstChild};

const ajax=(u,m,o={},p={})=>{
  const fd=p instanceof FormData,t=document.querySelector('meta[name="csrf-token"]')?.content;
  fetch(u,{method:m,headers:{
    Accept:"text/vnd.turbo-stream.html,application/json,text/html",
    ...(!fd&&m!=="GET"&&{"Content-Type":"application/json"}),
    ...(t&&{"X-CSRF-Token":t})
  },body:m==="GET"?null:(fd?p:JSON.stringify(p)),credentials:"same-origin"})
  .then(r=>r.headers.get("content-type")?.includes("json")?r.json():r.text())
  .then(d=>{
    if(o.data)state[o.data]=d;
    if(o.target){
      const c=o.template?o.template(d):d;
      o.action?o.target[o.action=="replace"?"replaceWith":o.action](html(c)):o.target.innerHTML=c;
    }
  }).catch(e=>console.error("AJAX:",e.message))
}
  
  const handler = {
    get: (t, p, r) => {const v = Reflect.get(t, p, r); return typeof v == "object" && v != null ? new Proxy(v, handler) : v},
    set: (t, p, v) => {const res = Reflect.set(t, p, v); bindings.get(p)?.forEach(applyBinding); return res}
  };

  const state = new Proxy(data, handler);
  let isUpdatingDOM = false;

function applyBinding(b,e={},elCtx=b.el){
  const {el,prop,fn}=b;
  const r=fn($,state,e,elCtx,html,...Object.values(data),...[...refs.values()]);
  if(prop=="innerHTML"){isUpdatingDOM=1;el.innerHTML=Array.isArray(r)?r.join``:r;isUpdatingDOM=0}
  else if(prop=="class"&&r&&typeof r=="object")for(const[k,v]of Object.entries(r))k.split(/\s+/).forEach(c=>el.classList.toggle(c,v));
  else if(prop=="style"&&r&&typeof r=="object")el.style=Object.entries(r).filter(([,v])=>v).map(([k,v])=>`${k}:${v}`).join(";")
  else if(prop in el){if(el.type=="radio")el.checked=el.value==r;else el[prop]=prop=="textContent"?r:parseEx(r)}
  else el.setAttribute(prop,parseEx(r))
}

  const compile = (expr, withReturn = false) => {
    try {
      return new Function("$", "$data", "$event", "$el", "$html", ...Object.keys(data), ...[...refs.keys()],
        `with($data){${withReturn ? "return" : ""}(${expr.trim()})}`);
    } catch {return () => expr}
  };

const trackDependencies=fn=>{
  const s=new Set(),p=new Proxy(data,{get:(t,k)=>{if(typeof k=="string")s.add(k);const v=t[k];return v&&typeof v=="object"?new Proxy(v,this):v}});
  try{fn($,p,refs)}catch{};return[...s]
}

  const cleanup = el => {
    [el, ...el.querySelectorAll('*')].forEach(e => {
      listeners.get(e)?.forEach(({receiver, event, handler}) => receiver.removeEventListener(event, handler));
      listeners.delete(e);
    });
  };

  function processElements(element) {
    const newBindings = [];
    if (element.nodeType == 1) {
      if (element.hasAttribute?.("data-he-p")) return newBindings;
      element.setAttribute("data-he-p", "");
    }

    const heElements=[element,...element.querySelectorAll("*")].filter(e=>[...e.attributes].some(a=>/^(@|:|data-he)/.test(a.name)))

    heElements.forEach(el => {
      for (const {name, value} of el.attributes || []) {
        if (he(name,"text","html","bind")) {
          try {
            new Function(`let ${value}=1`);
            state[value] ||= he(name,"bind") ? el.type == "checkbox" ? el.checked : el.value : el.textContent;
          } catch {}
        }
      }
    });

    const addBinding = (val, b) => {
      bindings.set(val, [...(bindings.get(val) || []), b]);
      newBindings.push(b);
    };

    heElements.forEach(el => {
      const execFn = v => compile(v, true)($, state, {}, el, html, ...Object.values(data), ...[...refs.values()]);
      const inputType = el.type?.toLowerCase();
      const isCheckbox = inputType == "checkbox", isRadio = inputType == "radio", isSelect = el.tagName == "SELECT";

      for (const {name, value} of el.attributes || []) {
        if (["@data","data-he"].includes(name)) Object.assign(state, execFn(value));
        if (he(name,"ref")) refs.set("$" + value, el);
        
        if (he(name,"text","html")) {
          const fn = compile(value, true);
          const b = {el, prop: he(name,"text") ? "textContent" : "innerHTML", fn};
          trackDependencies(fn, el).forEach(dep => addBinding(dep, b));
        }

        if (he(name,"bind")) {
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

        if (he(name,"hidden","visible")) {
          const fn = compile(`${he(name,"hidden") ? "!" : ""}!(${value})`, true);
          trackDependencies(fn, el).forEach(dep => addBinding(dep, {el, prop: "hidden", fn}));
        }

        if (name.startsWith(":")) {
          const fn = compile(value, true);
          trackDependencies(fn, el).forEach(dep => addBinding(dep, {el, prop: name.slice(1), fn}));
        }

        if (he(name,"init")) {
          compile(value, false)($, state, undefined, el, html, ...Object.values(data), ...[...refs.values()]);
        } else if (name.startsWith("@") || name.startsWith("data-he")) {
          const fullName = name.startsWith("@") ? name.slice(1) : name.slice(8);
          const [eventName, ...mods] = fullName.split(".");
          const isHttpMethod = ["get","post","put","patch","delete"].includes(eventName);
          const event = isHttpMethod ? getEvent(el) : eventName;
          const receiver = mods.includes("outside") || mods.includes("document") ? document : el; 
          const debounceMod = mods.find(m => m.startsWith("debounce"));
          const debounceDelay = debounceMod ? (t => t && !isNaN(t) ? Number(t) : 300)(debounceMod.split(":")[1]) : 0;

          const _handler = e => {
            if (mods.includes("prevent")) e.preventDefault();
            
            const keyMods = {shift: "shiftKey", ctrl: "ctrlKey", alt: "altKey", meta: "metaKey"};
            for (const [mod, prop] of Object.entries(keyMods)) if (mods.includes(mod) && !e[prop]) return;
            
            if (["keydown","keyup","keypress"].includes(event)) {
              const last = mods[mods.length - 1];
              if (last && !["prevent","once","outside","document"].includes(last)) {
                const keyName = e.key == " " ? "Space" : e.key == "Escape" ? "Esc" : e.key;
                if (keyName.toLowerCase() !== last.toLowerCase()) return;
              }
            }
            
            if (!mods.includes("outside") || !el.contains(e.target)) {
              if (isHttpMethod) {
                const options = compile(el.getAttribute('data-he-options') || el.getAttribute('options') || '{}', true)($, state, e, el, html, ...Object.values(data), ...[...refs.values()]);
                let paramsAttr = el.getAttribute('data-he-params') || el.getAttribute('params') || '{}';
                
                if (!paramsAttr.trim().startsWith("{") && paramsAttr.includes(":")) {
                  const props = paramsAttr.split(":").map(s => s.trim());
                  paramsAttr = props.reduceRight((acc, key, i) => `{ ${key}: ${i == 1 ? `'${el[acc]}'` : acc} }`);
                }
                const params = compile(paramsAttr, true)($, state, e, el, html, ...Object.values(data), ...[...refs.values()]);
                ajax(value, eventName.toUpperCase(), options, params);
              } else {
                compile(value, false)($, state, e, el, html, ...Object.values(data), ...[...refs.values()]);
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
  if(isUpdatingDOM)return;
  for(const m of ms){
    m.removedNodes.forEach(n=>n.nodeType==1&&cleanup(n));
    m.addedNodes.forEach(n=>n.nodeType==1&&!n.hasAttribute("data-he-p")&&processElements(n).forEach(applyBinding));
  }
}).observe(root,{childList:1,subtree:1});

  processElements(root);
  for (const [key, items] of bindings.entries()) items.forEach(applyBinding);
}

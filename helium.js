export default function helium(data = {}) {
  const he = (name,...args) => args.map(b => `|@${b}|data-he-${b}|`).join``.includes(`|${name}|`)
  const root = document.querySelector("[\\@helium]") || document.querySelector("[data-helium]") || document.body;
  const [bindings, refs, listeners] = [new Map(), new Map(), new WeakMap()];
  const $ = (s) => document.querySelector(s);
  const html = (s) => {
    const t = document.createElement("template");
    t.innerHTML = s;
    return t.content.firstChild;
  };

  const ajax = (url, method, target, opts = {}) => {  
    const headers = {
      "Content-Type": "application/json",
      "Accept": "text/vnd.turbo-stream.html,application/json,text/html"
    };
    const token = document.querySelector('meta[name="csrf-token"]')?.content;
    if (token) headers["X-CSRF-Token"] = token;
    
    fetch(url, {
      method,
      headers,
      body: method == "GET" ? null : JSON.stringify(opts),
      credentials: "same-origin"
    })
      .then(r => r.headers.get("content-type")?.includes("application/json") ? r.json() : r.text())
      .then(d => {if(target) state[target] = d})
      .catch(e => console.error("AJAX error:", e.message));
  };

  const get = (u,t) => ajax(u,"GET",t);
  const [post, put, patch, del] = ["POST","PUT","PATCH","DELETE"].map(m => (u, d, t) => ajax(u, m, t, d));
  
  const handler = {
      get(target, prop, receiver) {
        const val = Reflect.get(target, prop, receiver);
        return typeof val == "object" && val != null ? new Proxy(val, handler) : val;
      },
      set(target, prop, val) {
        const result = Reflect.set(target, prop, val);
        bindings.get(prop)?.forEach(applyBinding);
        return result;
      }
    };

  const state = new Proxy(data, handler);
  let isUpdatingDOM = false;

  function applyBinding(binding, event = {}, elCtx = binding.el) {
    const { el, prop, fn } = binding;
    const result = fn($, state, event, elCtx, html, get, post, put, patch, del, ...Object.values(data), ...[...refs.values()]);
    if (prop == "innerHTML") {
      isUpdatingDOM = true;
      el.innerHTML = Array.isArray(result) ? result.join`` : result;
      isUpdatingDOM = false;
    } else if(prop == "class" && typeof result == "object"){ 
      Object.entries(result).forEach(([k, v]) => el.classList.toggle(k, v));
    } else if(prop == "style" && typeof result == "object"){
      el.style = Object.entries(result).filter(([k, v]) => v).map(([k, v]) => `${k}:${v}`).join(";");
    } else if (prop in el) {
      if(el.type == "radio") el.checked = el.value == result;
      else el[prop] = result;
    } else {
      el.setAttribute(prop, result);
    }
  }

  const compile = (expr, withReturn = false) => {
    try {
      return new Function("$", "$data", "$event", "$el", "$html", "$get", "$post", "$put", "$patch", "$delete", 
        ...Object.keys(data), ...[...refs.keys()],
        `with($data){${withReturn ? "return" : ""}(${expr.trim()})}`);
    } catch (err) {
      return () => expr;
    }
  };

const trackDependencies = (fn, el) => {
    const accessed = new Set();
    const trackProxy = new Proxy(data, {
      get(target, prop) {
        if (typeof prop == 'string') accessed.add(prop);
        const val = target[prop];
        return typeof val == "object" && val != null ? new Proxy(val, this) : val;
      }
    });
    
    try { fn.call(null, $, trackProxy, refs); } catch {}
    return [...accessed];
  };

  const cleanup = el => {
    [el, ...el.querySelectorAll('*')].forEach(e => {
      listeners.get(e)?.forEach(({receiver, eventName, handler}) => 
        receiver.removeEventListener(eventName, handler));
      listeners.delete(e);
    });
  };

  function processElements(element) {
    const newBindings = [];
    if (element.nodeType == 1) {
      if (element.hasAttribute?.("data-he-p")) return newBindings;
      element.setAttribute("data-he-p", "");
    }

    const heElements = [element, ...element.querySelectorAll("*")].filter(el =>
      Array.from(el.attributes).some(attr => /^(@|:|data-he-)/.test(attr.name)
      )
    );

    // Seed default state values
    heElements.forEach(el => {
      for (const { name, value } of el.attributes || []) {
        if (he(name,"text","html","bind")) {
          try {
            new Function(`let ${value}=1`);
            const val = he(name,"bind") ? el.type == "checkbox" ? el.checked : el.value : el.textContent;
            state[value] ||= Number.isNaN(Number(val)) ? val : Number(val);
          } catch (e) {}
        }
      }
    });

    const addBinding = (val, b) => {
      bindings.set(val, [...(bindings.get(val) || []), b]);
      newBindings.push(b);
    };

    // Register bindings
    heElements.forEach(el => {
      const execFn = v => compile(v, true)($, state, {}, el, html, get, post, put, patch, del, ...Object.values(data), ...[...refs.values()]);
      for (const { name, value } of el.attributes || []) {
        if (["@data","data-he"].includes(name)) Object.assign(state, execFn(value));
        if (he(name,"ref")) refs.set("$" + value, el);
        if (he(name,"text","html")) {
          const fn = compile(value, true);
          const b = { el, prop: he(name,"text") ? "textContent" : "innerHTML", fn };
          trackDependencies(fn, el).forEach(dep => addBinding(dep, b));
        }

        if (he(name,"bind")) {
          const inputType = el.type?.toLowerCase();
          const isCheckbox = inputType == "checkbox";
          const isRadio = inputType == "radio";
          const event = (isCheckbox || isRadio || el.tagName == "SELECT") ? "change" : "input";
          const prop = isCheckbox ? "checked" : "value";
          
          const inputHandler = e => state[value] = isCheckbox ? e.target.checked : e.target.value;
          el.addEventListener(event, inputHandler);
          if (!listeners.has(el)) listeners.set(el, []);
          listeners.get(el).push({receiver: el, eventName: event, handler: inputHandler});
          
          addBinding(value, { el, prop, fn: compile(value, true) });
          
          if (isCheckbox) el.checked = !!state[value];
          else if (isRadio) el.checked = el.value == state[value];
          else el.value = state[value] ?? "";
        }

        if (he(name,"hidden","visible")) {
          const fn = compile(`${he(name,"hidden") ? "!" : ""}!(${value})`, true);
          const b = { el, prop: "hidden", fn };
          
          trackDependencies(fn, el).forEach(dep => addBinding(dep, b));
        }

        if (name.startsWith(":")) {
          const fn = compile(value, true);
          const b = { el, prop: name.slice(1), fn };
          trackDependencies(fn, el).forEach(dep => addBinding(dep, b));
        }

        if (he(name,"init")) {
          compile(value, false)($, state, undefined, el, html, get, post, put, patch, del, ...Object.values(data), ...[...refs.values()]);
        } else if (name.startsWith("@") || name.startsWith("data-he-on")) {
          const [eventName, ...mods] = name.slice(name.startsWith("@") ? 1 : 10).split(".");
          const receiver = mods.includes("outside") || mods.includes("document") ? document : el;
          let debounceDelay = 0;
          const debounceMod = mods.find(m => m.startsWith("debounce"));
          if (debounceMod) {
            const time = debounceMod.split(":")[1];
            debounceDelay = time && !isNaN(time) ? Number(time) : 300;
          }

          const _handler = e => {
            if (mods.includes("prevent")) e.preventDefault();
            const keyMods = { shift: "shiftKey", ctrl: "ctrlKey", alt: "altKey", meta: "metaKey" };
            for (const [mod, prop] of Object.entries(keyMods)) {
              if (mods.includes(mod) && !e[prop]) return;
            }
            if (["keydown","keyup","keypress"].includes(eventName)) {
              const last = mods[mods.length - 1];
              if (last) {
                let keyName = e.key == " " ? "Space" : e.key == "Escape" ? "Esc" : e.key;
                if (keyName.toLowerCase() !== last.toLowerCase()) return;
              }
            }
            if (!mods.includes("outside") || !el.contains(e.target)) {
              compile(value, false)($, state, e, el, html, get, post, put, patch, del, ...Object.values(data), ...[...refs.values()]);
            }
            if (mods.includes("once")) el.removeEventListener(eventName, debouncedHandler);
          };

          const debounce = (fn, delay) => {
            let timeout;
            return (...args) => {
              clearTimeout(timeout);
              timeout = setTimeout(() => fn(...args), delay);
            };
          };

          const debouncedHandler = debounceDelay > 0 ? debounce(_handler, debounceDelay) : _handler;
          receiver.addEventListener(eventName, debouncedHandler);
          if (!listeners.has(el)) listeners.set(el, []);
          listeners.get(el).push({receiver, eventName, handler: debouncedHandler});
        }
      }
    });

    return newBindings;
  }

  const observer = new MutationObserver(mutations => {
    if (isUpdatingDOM) return;
    for (const m of mutations) {
      for (const node of m.removedNodes) {
        if (node.nodeType == 1) cleanup(node);
      }
      for (const node of m.addedNodes) {
        if (node.nodeType == 1 && !node.hasAttribute("data-he-p")) {
          processElements(node).forEach(applyBinding);
        }
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  processElements(root);
  for (const [key, items] of bindings.entries()) items.forEach(applyBinding);
}

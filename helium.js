export default function helium(data = {}) {
  const root = document.querySelector("[\\@helium]") || document.querySelector("[data-helium]") || document.body;
  const [bindings, refs] = [new Map(), new Map()];
  const $ = (s) => document.querySelector(s);
  const html = (s) => {
    const t = document.createElement("template");
    t.innerHTML = s;
    return t.content.firstChild;
  };

  const ajax = (url, method, target, opts = {}) => {  
    const headers = {
      "Content-Type": "application/json",
      "Accept": "text/vnd.turbo-stream.html, application/json, application/vnd.api+json, text/html, */*"
    };
    
    // Only add CSRF token if it exists
    if (document.querySelector('meta[name="csrf-token"]')?.content) headers["X-CSRF-Token"] = csrfToken;
    
    fetch(url, {
      method,
      headers,
      body: method === "GET" ? null : JSON.stringify(opts),
      credentials: "same-origin"
    })
      .then(r =>
        r.headers.get("content-type")?.includes("application/json") ? r.json() : r.text()
      )
      .then(d => state[target] = d)
      .catch(e => console.error("AJAX error:", e.message));
  };

  const get = (u,t) => ajax(u,"GET",t);
  const [post, put, patch, del] = ["POST","PUT","PATCH","DELETE"].map((m) => (u, d, t) => ajax(u, m, t, d));
  
  const handler = {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      return typeof val === "object" && val !== null ? new Proxy(val, handler) : val;
    },
    set(target, prop, val, receiver) {
      const result = Reflect.set(target, prop, val, receiver);
      if (target === data && bindings.has(prop)) {
        bindings.get(prop).forEach(applyBinding);
      } else {
        for (const [key, bound] of bindings.entries()) {
          if (key === Object.keys(data).find(k => data[k] === target)) {
            bound.forEach(applyBinding);
          }
        }
      }
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
      el.innerHTML = result;
      isUpdatingDOM = false;
    } else if(prop == "class" && typeof(result) == "object"){ 
      const add = [];
      const remove = [];

      for (const [key, value] of Object.entries(result)) {
        (value ? add : remove).push(key);
      }

      el.classList.add(...add);
      el.classList.remove(...remove);
    } else if(prop == "style" && typeof(result) == "object"){
el.style = Object.entries(result).map(([key, value]) => value ? `${key}: ${value};` : "").join``
      } else if (prop in el) {
        if(el.type == "radio") el.checked = el.value == result
        else el[prop] = result
    } else {
      el.setAttribute(prop, result);
    }
  }

  function compileExpression(expr, withReturn = false) {
    try {
      return new Function("$", "$data", "$event", "$el", "$html", "$get", "$post", "$put", "$patch", "$delete", 
        ...Object.keys(data), ...[...refs.keys()],
        `with($data) { ${withReturn ? "return" : ""} (${expr.trim()}) }`);
    } catch (err) {
      return () => expr;
    }
  }

  function processElements(element) {
    const newBindings = [];
    if (element.nodeType === 1 && element.hasAttribute?.("data-helium-processed")) return newBindings;
    if (element.nodeType === 1 && element.setAttribute) element.setAttribute("data-helium-processed", "");

    const heElements = [element, ...Array.from(element.querySelectorAll("*")).filter((el) =>
      Array.from(el.attributes).some((attr) => attr.name.startsWith("data-he-")))];

    const xpath = document.evaluate(".//*[@*[starts-with(name(), '@') or starts-with(name(), ':')]]",
      element, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0; i < xpath.snapshotLength; i++) heElements.push(xpath.snapshotItem(i));

    // Seed default state values
    heElements.forEach((el) => {
      for (const { name, value } of el.attributes || []) {
        if (["@html","data-he-html","@text","data-he-text","@bind","data-he-bind"].includes(name)) {
          try {
            new Function(`let ${value} = 1`);
            state[value] ||= ["@bind","data-he-bind"].includes(name) ? el.value : el.textContent;
          } catch (e) {}
        }
      }
    });


    // Register bindings
    heElements.forEach((el) => {
       const execFn = (v) => compileExpression(v, true)($, state, {}, el, html, get, post, put, patch, del, ...Object.values(data), ...[...refs.values()]);
      for (const { name, value } of el.attributes || []) {
        if (["@data","data-he"].includes(name)) Object.assign(state, execFn(value));
        if (["@ref","data-he-ref"].includes(name)) refs.set("$" + value, el);

        if (["@text","data-he-text","@html","data-he-html"].includes(name)) {
          Object.keys(state).filter((k) => value.includes(k)).forEach((val) => {
            const b = { el, prop: ["@text","data-he-text"].includes(name) ? "textContent" : "innerHTML", expr: value, fn: compileExpression(value, true) };
            bindings.set(val, [...(bindings.get(val) || []), b]);
            newBindings.push(b);
          });
        }

        if (["@bind", "data-he-bind"].includes(name)) {
  const inputType = el.type?.toLowerCase();
  const isCheckbox = inputType === "checkbox";
  const event = (isCheckbox || el.tagName === "SELECT") ? "change" : "input";
  const prop = isCheckbox ? "checked" : "value";
  el.addEventListener(event, (e) => {
    state[value] = isCheckbox ? e.target.checked : e.target.value;
  });
  
  const b = { el, prop, expr: value, fn: compileExpression(value, true) };

  bindings.set(value, [...(bindings.get(value) || []), b]);

  newBindings.push(b);
  
  if (isCheckbox) {
    el.checked = !!state[value];
  } else if (inputType != "radio") {
    el.value = state[value] ?? "";
  }
}

        if (["@hidden","@visible","data-he-hidden","data-he-visible"].includes(name)) {
          Object.keys(state).filter((k) => value.includes(k)).forEach((val) => {
            const b = { el, prop: "hidden", expr: value, fn: compileExpression(`${["@hidden","data-he-hidden"].includes(name) ? "!" : ""}!(${value})`, true) };
            bindings.set(val, [...(bindings.get(val) || []), b]);
            newBindings.push(b);
          });
        }

        if (name.startsWith(":")) {
          Object.keys(state).filter((k) => value.includes(k)).forEach((val) => {
            const b = { el, prop: name.split(":")[1], expr: value, fn: compileExpression(value, true) };
            bindings.set(val, [...(bindings.get(val) || []), b]);
            newBindings.push(b);
          });
        }

        if (["@init","data-he-init"].includes(name)) {
          compileExpression(value, false)($, state, undefined, el, html, get, post, put, patch, del, ...Object.values(data), ...[...refs.values()]);
        } else if (name.startsWith("@") || name.startsWith("data-he-on")) {
          const [eventName, ...mods] = name.slice(name.startsWith("@") ? 1 : 10).split(".");
          const receiver = mods.includes("outside") || mods.includes("document") ? document : el;
          const debounce = (fn, delay) => {
            let timeout;
            return (...args) => {
              clearTimeout(timeout);
              timeout = setTimeout(() => fn(...args), delay);
            };
          };

          let debounceDelay = 0;
          const debounceMod = mods.find((m) => m.startsWith("debounce"));
          if (debounceMod) {
            const time = debounceMod.split(":")[1];
            debounceDelay = time && !isNaN(time) ? Number(time) : 300;
          }

          function _handler(e) {
            if (mods.includes("prevent")) e.preventDefault();
            const keyMods = { shift: "shiftKey", ctrl: "ctrlKey", alt: "altKey", meta: "metaKey" };
            for (const [mod, prop] of Object.entries(keyMods)) {
              if (mods.includes(mod) && !e[prop]) return;
            }
            if (["keydown","keyup","keypress"].includes(eventName)) {
              const last = mods[mods.length - 1];
              if (last) {
                let keyName = e.key === " " ? "Space" : e.key === "Escape" ? "Esc" : e.key;
                if (keyName.toLowerCase() !== last.toLowerCase()) return;
              }
            }
            if (!mods.includes("outside") || !el.contains(e.target)) {
              compileExpression(value, false)($, state, e, el, html, get, post, put, patch, del, ...Object.values(data), ...[...refs.values()]);
            }
            if (mods.includes("once")) el.removeEventListener(eventName, debouncedHandler);
          }

          const debouncedHandler = debounceDelay > 0 ? debounce(_handler, debounceDelay) : _handler;
          receiver.addEventListener(eventName, debouncedHandler);
        }
      }
    });

    return newBindings;
  }

  const observer = new MutationObserver((mutations) => {
    if (isUpdatingDOM) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1 && !node.hasAttribute("data-helium-processed")) {
          const newly = processElements(node);
          newly.forEach(applyBinding);
        }
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  processElements(root);
  for (const [key, items] of bindings.entries()) items.forEach(applyBinding);
}

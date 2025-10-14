export default function helium(data = {}) {

  const root =
    document.querySelector("[\\@helium]") ||
    document.querySelector("[data-helium]") ||
    document.body;
  const [bindings, refs] = [new Map(), new Map()];
  const $ = (selector) => document.querySelector(selector);
  const html = (string) => {
    const temp = document.createElement("template");
    temp.innerHTML = string;
    return temp.content.firstChild;
  };

const ajax = (url, method, target, options) => {
    fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "GET" ? null : JSON.stringify(options),
    })
      .then((res) => res.headers.get("content-type")?.includes("application/json")
          ? res.json()
          : res.text())
      .then((data) => state[target] = data)
      .catch((err) => console.error("AJAX error:", err.message))
}
  const get = (u,t) => ajax(u,"GET",t)
  const [post, put, patch, del] = [
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
  ].map((m) => (u, d, t) => ajax(u, m, t, d));

  const state = new Proxy(data, {
    get(target, prop) {
      return target[prop];
    },
    set(target, prop, value) {
      // skip if identical (prevents redundant re-renders)
      if (target[prop] === value) return true;
      target[prop] = value;
      if (bindings.has(prop)) {
        // only call the bindings for this prop
        bindings.get(prop).forEach((binding) => applyBinding(binding));
      }
      return true;
    },
  });

  let isUpdatingDOM = false;

  function applyBinding(binding, event = {}, elCtx = binding.el) {
    const { el, prop, fn } = binding;
    const result = fn(
      $,
      state,
      event,
      elCtx,
      html,
      get,
      post,
      put,
      patch,
      del,
      ...Object.values(data),
      ...[...refs.values()],
    );
    // guard to reduce observer recursion (optional but helpful)
    if (prop === "innerHTML") {
      isUpdatingDOM = true;
      el.innerHTML = result;
      isUpdatingDOM = false;
    } else if (prop in el) {
      el[prop] = result;
    } else {
      el.setAttribute(prop, result);
    }
  }

  function compileExpression(expr, withReturn = false) {
    try {
      return new Function(
        "$",
        "$data",
        "$event",
        "$el",
        "$html",
        "$get",
        "$post",
        "$put",
        "$patch",
        "$delete",
        ...Object.keys(data),
        ...[...refs.keys()],
        `with($data) { ${withReturn ? "return" : ""} (${expr.trim()}) }`,
      );
    } catch (err) {
      return () => expr;
    }
  }

  // processElements now returns an array of newly-created binding objects
  function processElements(element) {
    const newlyAddedBindings = [];

    // quick guard: avoid re-processing same node
    if (
      element.nodeType === 1 &&
      element.hasAttribute &&
      element.hasAttribute("data-helium-processed")
    )
      return newlyAddedBindings;
    if (element.nodeType === 1 && element.setAttribute)
      element.setAttribute("data-helium-processed", "");

    const heliumElements = [
      element,
      ...Array.from(element.querySelectorAll("*")).filter((el) =>
        Array.from(el.attributes).some((attr) =>
          attr.name.startsWith("data-he-"),
        ),
      ),
    ];

    const xpath = document.evaluate(
      ".//*[@*[starts-with(name(), '@') or starts-with(name(), ':')]]",
      element,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );
    for (let i = 0; i < xpath.snapshotLength; i++)
      heliumElements.push(xpath.snapshotItem(i));

    // seed default state values (no binding creation here)
    heliumElements.forEach((el) => {
      for (const { name, value } of el.attributes || []) {
        if (
          name == "@html" ||
          name == "data-he-html" ||
          name == "@text" ||
          name == "data-he-text" ||
          name == "@bind" ||
          name == "data-he-bind"
        ) {
          try {
            new Function(`let ${value} = 1`);
            state[value] ||=
              name == "@bind" || name == "data-he-bind"
                ? el.value
                : el.textContent;
          } catch (e) {}
        }
      }
    });

    // Register bindings for these elements and collect the newly added binding objects
    heliumElements.forEach((el) => {
      for (const { name, value } of el.attributes || []) {
        if (name == "@data" || name == "data-he") {
          Object.assign(
            state,
            compileExpression(value, true)(
              $,
              state,
              {},
              el,
              html,
              get,
              post,
              put,
              patch,
              del,
              ...Object.values(data),
              ...[...refs.values()],
            ),
          );
        }
        if (name == "@ref" || name == "data-he-ref") refs.set("$" + value, el);

        if (
          name == "@text" ||
          name == "data-he-text" ||
          name == "@html" ||
          name == "data-he-html"
        ) {
          Object.keys(state)
            .filter((key) => value.includes(key))
            .forEach((val) => {
              const b = {
                el,
                prop:
                  name == "@text" || name == "data-he-text"
                    ? "textContent"
                    : "innerHTML",
                expr: value,
                fn: compileExpression(value, true),
              };
              bindings.set(val, [...(bindings.get(val) || []), b]);
              newlyAddedBindings.push(b);
            });
        }

        if (name == "@bind" || name == "data-he-bind") {
          el.addEventListener("input", (e) => (state[value] = e.target.value));
          const b = {
            el,
            prop: "value",
            expr: value,
            fn: compileExpression(value, true),
          };
          bindings.set(value, [...(bindings.get(value) || []), b]);
          newlyAddedBindings.push(b);
          el.value = state[value];
        }

        if (
          name == "@hidden" ||
          name == "@visible" ||
          name == "data-he-hidden" ||
          name == "data-he-visible"
        ) {
          Object.keys(state)
            .filter((key) => value.includes(key))
            .forEach((val) => {
              const b = {
                el,
                prop: "hidden",
                expr: value,
                fn: compileExpression(
                  `${name == "@hidden" || name == "data-he-hidden" ? "!" : ""}!(${value})`,
                  true,
                ),
              };
              bindings.set(val, [...(bindings.get(val) || []), b]);
              newlyAddedBindings.push(b);
            });
        }

        if (name.startsWith(":")) {
          Object.keys(state)
            .filter((key) => value.includes(key))
            .forEach((val) => {
              const b = {
                el,
                prop: name.split(":")[1],
                expr: value,
                fn: compileExpression(value, true),
              };
              bindings.set(val, [...(bindings.get(val) || []), b]);
              newlyAddedBindings.push(b);
            });
        }

        if (name == "@init" || name == "data-he-init") {
          compileExpression(value, false)(
            $,
            state,
            undefined,
            el,
            html,
            get,
            post,
            put,
            patch,
            del,
            ...Object.values(data),
            ...[...refs.values()],
          );
        } else if (name.startsWith("@") || name.startsWith("data-he-on")) {
          // event handling — keep this as before (register listeners)
          const [eventName, ...modifiers] = name
            .slice(name.startsWith("@") ? 1 : 10)
            .split(".");
          const receiver =
            modifiers.includes("outside") || modifiers.includes("document")
              ? document
              : el;
          const debounce = (fn, delay) => {
            let timeout;
            return function (...args) {
              clearTimeout(timeout);
              timeout = setTimeout(() => fn.apply(this, args), delay);
            };
          };

          let debounceDelay = 0;
          const debounceModifier = modifiers.find((m) =>
            m.startsWith("debounce"),
          );
          if (debounceModifier) {
            const time = debounceModifier.split(":")[1];
            if (time && !isNaN(time)) debounceDelay = Number(time);
            else debounceDelay = 300;
          }

          function _handler(e) {
            if (modifiers.includes("prevent")) e.preventDefault();
            const keyModifiers = {
              shift: "shiftKey",
              ctrl: "ctrlKey",
              alt: "altKey",
              meta: "metaKey",
            };
            for (const [mod, prop] of Object.entries(keyModifiers)) {
              if (modifiers.includes(mod) && !e[prop]) return;
            }
            if (["keydown", "keyup", "keypress"].includes(eventName)) {
              const last = modifiers[modifiers.length - 1];
              if (last) {
                let keyName = e.key;
                if (keyName === " ") keyName = "Space";
                else if (keyName === "Escape") keyName = "Esc";
                if (keyName.toLowerCase() !== last.toLowerCase()) return;
              }
            }

            if (!modifiers.includes("outside") || !el.contains(e.target)) {
              compileExpression(value, false)(
                $,
                state,
                e,
                el,
                html,
                get,
                post,
                put,
                patch,
                del,
                ...Object.values(data),
                ...[...refs.values()],
              );
            }
            if (modifiers.includes("once"))
              el.removeEventListener(eventName, debouncedHandler);
          }

          const debouncedHandler =
            debounceDelay > 0 ? debounce(_handler, debounceDelay) : _handler;
          receiver.addEventListener(eventName, debouncedHandler);
        }
      } // end attributes loop
    }); // end heliumElements.forEach

    return newlyAddedBindings;
  } // end processElements

  // set up mutation observer that only processes and applies bindings for newly added nodes
  const observer = new MutationObserver((mutations) => {
    if (isUpdatingDOM) return; // ignore mutations we caused directly
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (
          node.nodeType === 1 &&
          !node.hasAttribute("data-helium-processed")
        ) {
          const newly = processElements(node);
          // apply only the bindings we just created for this node
          newly.forEach(applyBinding);
        }
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  const initialBindings = processElements(root);
  for (const [key, items] of bindings.entries()) items.forEach(applyBinding);
}

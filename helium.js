export default function helium(data = {}) {
  const root =
    document.querySelector("[\\@helium]") ||
    document.querySelector("[data-helium]") ||
    document.body;
  const [bindings, refs] = [new Map(), new Map()];
  const $ = (selector) => document.querySelector(selector);
  const state = new Proxy(data, {
    get(target, prop) {
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      if (bindings.has(prop))
        bindings.get(prop).forEach((binding) => applyBinding(binding));
      return true;
    },
  });
  function applyBinding(binding, event = {}, elCtx = binding.el) {
    const { el, prop, fn } = binding;
    const result = fn(
      $,
      state,
      event,
      elCtx,
      ...Object.values(data),
      ...[...refs.values()],
    );
    if (prop in el) el[prop] = result;
    else el.setAttribute(prop, result);
  }
  function compileExpression(expr, withReturn = false) {
    try {
      return new Function(
        "$",
        "$state",
        "$event",
        "$el",
        ...Object.keys(data),
        ...[...refs.keys()],
        `with($state) { ${withReturn ? "return" : ""} (${expr.trim()}) }`,
      );
    } catch (err) {
      return () => expr;
    }
  }
  function processElements(element) {
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
    heliumElements.forEach((el) => {
      for (const { name, value } of el.attributes) {
        if (
          name == "@react" ||
          name == "data-he-react" ||
          name == "@text" ||
          name == "data-he-text" ||
          name == "@bind" ||
          name == "data-he-bind"
        ) {
          try {
            new Function(`let ${value} = 1`);
            state[value] ||=
              name == "@react" ||
              name == "data-he-react" ||
              name == "@text" ||
              name == "data-he-text"
                ? el.textContent
                : el.value;
          } catch (e) {}
        }
      }
    });
    heliumElements.forEach((el) => {
      for (const { name, value } of el.attributes) {
        if (name == "@data" || name == "data-he")
          Object.assign(
            state,
            compileExpression(value, true)(
              $,
              state,
              {},
              el,
              ...Object.values(data),
              ...[...refs.values()],
            ),
          );
        if (name == "@ref" || name == "data-he-ref") refs.set("$" + value, el);
        if (
          name == "@react" ||
          name == "data-he-react" ||
          name == "@text" ||
          name == "data-he-text"
        )
          Object.keys(state)
            .filter((key) => value.includes(key))
            .forEach((val) =>
              bindings.set(val, [
                ...(bindings.get(val) || []),
                {
                  el,
                  prop: "textContent",
                  expr: value,
                  fn: compileExpression(value, true),
                },
              ]),
            );
        if (name == "@bind" || name == "data-he-bind") {
          el.addEventListener("input", (e) => (state[value] = e.target.value));
          bindings.set(value, [
            ...(bindings.get(value) || []),
            {
              el,
              prop: "value",
              expr: value,
              fn: compileExpression(value, true),
            },
          ]);
          el.value = state[value];
        }
        if (
          name == "@hidden" ||
          name == "@visible" ||
          name == "data-he-hidden" ||
          name == "data-he-visible"
        )
          Object.keys(state)
            .filter((key) => value.includes(key))
            .forEach((val) =>
              bindings.set(val, [
                ...(bindings.get(val) || []),
                {
                  el,
                  prop: "hidden",
                  expr: value,
                  fn: compileExpression(
                    `${name == "@hidden" || name == "data-he-hidden" ? "!" : ""}!(${value})`,
                    true,
                  ),
                },
              ]),
            );
        if (name.startsWith(":"))
          Object.keys(state)
            .filter((key) => value.includes(key))
            .forEach((val) =>
              bindings.set(val, [
                ...(bindings.get(val) || []),
                {
                  el,
                  prop: name.split(":")[1],
                  expr: value,
                  fn: compileExpression(value, true),
                },
              ]),
            );
        if (name == "@init" || name == "data-he-init")
          compileExpression(value, false)(
            $,
            state,
            undefined,
            el,
            ...Object.values(data),
            ...[...refs.values()],
          );
        else if (name.startsWith("@") || name.startsWith("data-he-on")) {
          const [eventName, ...modifiers] = name
            .slice(name.startsWith("@") ? 1 : 10)
            .split(".");
          const receiver = modifiers.includes("outside") ? document : el;
          receiver.addEventListener(eventName, function _handler(e) {
            if (modifiers.includes("prevent")) e.preventDefault();
            if (!modifiers.includes("outside") || !el.contains(e.target))
              compileExpression(value, false)(
                $,
                state,
                e,
                el,
                ...Object.values(data),
                ...[...refs.values()],
              );
            if (modifiers.includes("once"))
              el.removeEventListener(eventName, _handler);
          });
        }
      }
    });
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) processElements(node);
        }
      }
    });
    observer.observe(element, { childList: true, subtree: true });
    for (const [key, items] of bindings.entries())
      items.forEach((binding) => applyBinding(binding));
  }
  processElements(root);
}

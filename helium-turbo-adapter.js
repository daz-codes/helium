import { generatedNodes, liveInstances, registerTurbo } from "./helium.js";

const PAGE_ROOT = () => document.querySelector("[\\@helium]") || document.querySelector("[data-helium]") || document.body;
// Structural output restored from a cached copy of the page has no bindings
// behind it, and its templates are about to render it again.
const removeStale = root => root?.querySelectorAll("[data-helium-generated]").forEach(node => {
  if (generatedNodes.has(node)) return;
  for (const side of ["previousSibling", "nextSibling"]) {
    while (node[side]?.nodeType === 3 && !node[side].data.trim()) node[side].remove();
  }
  node.remove();
});
const resolve = root => typeof root === "string" ? document.querySelector(root) : root;
const renderedNodes = binding => binding.loop
  ? [...binding.loop[4].values()].flatMap(row => row.nodes)
  : binding.cond[1];

// Turbo's morph (Idiomorph) matches old nodes to incoming server HTML, which
// only contains the templates. Left in place, Helium's rendered rows would be
// removed or soft-matched onto unrelated server elements. So rows are lifted
// out before the morph and put back straight afterwards, then the region's
// bindings are re-applied over whatever server markup the morph wrote. Helium
// state, listeners, and rendered rows survive; changed server @data still
// flows in through the ordinary attribute reconciliation.
function detachRendered(scopes) {
  const held = [];
  for (const instance of liveInstances) {
    const regions = scopes.map(scope => instance.root.contains(scope) ? scope
      : scope.contains(instance.root) ? instance.root : null).filter(Boolean);
    if (!regions.length) continue;
    const pending = instance.observer.takeRecords();
    const structural = regions.flatMap(instance.bound).filter(binding => binding.loop || binding.cond);
    structural.forEach(binding => renderedNodes(binding).forEach(node => node.remove()));
    // Detaching is bookkeeping, not removal: drop those records, but replay
    // anything that was already queued before we started.
    instance.observer.takeRecords();
    if (pending.length) instance.mutate(pending);
    held.push({ instance, regions, structural });
  }
  return () => held.forEach(({ instance, regions, structural }) => {
    structural.forEach(binding => {
      const nodes = renderedNodes(binding);
      if (instance.root.contains(binding.el)) {
        let cursor = binding.el;
        nodes.forEach(node => { cursor.after(node); cursor = node; });
      } else {
        // The morph removed the template itself; its rows go with it.
        instance.cleanup(nodes.filter(node => node.nodeType === 1));
        binding.loop ? binding.loop[4].clear() : binding.cond[1] = [];
      }
    });
    regions.forEach(region => region.isConnected && instance.refresh(region));
  });
}

const guardRender = (render, scopesFor, after) => function (...args) {
  const restore = detachRendered(scopesFor(...args));
  const finish = () => { restore(); after?.(); };
  let result;
  try { result = render.apply(this, args); }
  catch (error) { finish(); throw error; }
  if (result && typeof result.then === "function") return result.finally(finish);
  finish();
  return result;
};

// Turbo adapters own the one automatic page-wide instance so they can restart
// it against each newly rendered page, and keep it alive across morphs. Keep
// that ownership policy here so Standard and CSP cannot drift apart.
export function createTurboAdapter(createBase) {
  registerTurbo({
    morphChildren(element, incoming) {
      if (typeof globalThis.Turbo?.morphChildren !== "function") return false;
      globalThis.Turbo.morphChildren(element, incoming);
      return true;
    },
    renderStreamMessage(message) {
      return globalThis.Turbo?.renderStreamMessage(message);
    },
  });

  const instance = createBase();
  let managed = false;
  let initialized = false;
  let autoTimer = null;
  let initialState;
  const permanent = new Map();

  const clearAuto = () => {
    if (autoTimer !== null) clearTimeout(autoTimer);
    autoTimer = null;
  };

  const unmountPermanent = () => {
    permanent.forEach(mounted => mounted.then(app => app?.unmount()));
    permanent.clear();
  };

  const suppress = () => {
    initialized = true;
    initialState = undefined;
    clearAuto();
    if (managed) {
      instance.heliumTeardown();
      unmountPermanent();
    }
    managed = false;
  };

  // data-turbo-permanent elements outlive the page around them, so each one
  // becomes its own root with its own state. They are mounted before the page
  // root, which then leaves their subtrees alone.
  const mountPermanent = root => {
    permanent.forEach((_, el) => { if (!el.isConnected) permanent.delete(el); });
    root.querySelectorAll("[data-turbo-permanent]").forEach(el => {
      if (permanent.has(el) || el.parentElement?.closest("[data-turbo-permanent]")) return;
      permanent.set(el, instance.mount(el, initialState).catch(() => null));
    });
  };

  const start = () => {
    const root = PAGE_ROOT();
    removeStale(root);
    if (root && !root.closest("[data-turbo-permanent]")) mountPermanent(root);
    return instance.helium(initialState);
  };

  // State passed to helium() is remembered and applied again on every page
  // Turbo renders, so functions and shared values stay available.
  function helium(state) {
    managed = true;
    initialized = true;
    clearAuto();
    if (arguments.length) initialState = state;
    return start();
  }

  const heliumTeardown = () => suppress();
  const mount = (root, state) => {
    suppress();
    removeStale(resolve(root));
    return instance.mount(root, state);
  };
  const create = options => {
    suppress();
    return createBase(options);
  };

  helium.mount = mount;

  if (typeof window !== "undefined") {
    window.helium = helium;
    window.heliumTeardown = heliumTeardown;
  }

  if (typeof document !== "undefined") {
    const autoInit = () => {
      autoTimer = null;
      if (!initialized) helium();
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", autoInit, { once: true });
    } else {
      autoTimer = setTimeout(autoInit, 0);
    }

    const pageInstance = () => [...liveInstances].find(live => live.owner === instance.helium);

    // Replacing renders need no teardown hook: the old body is detached and
    // its instance tears itself down, while the page stays fully interactive
    // (and its cached snapshot keeps its rendered rows) until the swap.
    document.addEventListener("turbo:before-render", event => {
      const { detail } = event;
      if (detail?.renderMethod !== "morph" || typeof detail.render !== "function") return;
      detail.render = guardRender(detail.render, current => [current], () => {
        if (!managed) return;
        const live = pageInstance();
        if (!live || !live.root.isConnected) start();
        else mountPermanent(live.root);
      });
    });
    document.addEventListener("turbo:before-frame-morph", event => {
      queueMicrotask(detachRendered([event.target]));
    });
    document.addEventListener("turbo:before-stream-render", event => {
      const stream = event.target;
      if (stream.getAttribute?.("method") !== "morph" || typeof event.detail?.render !== "function") return;
      event.detail.render = guardRender(event.detail.render, element => element.targetElements || []);
    });
    document.addEventListener("turbo:render", event => {
      if (!managed || event.detail?.renderMethod === "morph") return;
      // A cached preview is shown only until the real response renders.
      if (document.documentElement.hasAttribute("data-turbo-preview")) return;
      start();
    });
  }

  return { create, helium, heliumTeardown };
}

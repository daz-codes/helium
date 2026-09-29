import * as Turbo from "/node_modules/@hotwired/turbo/dist/turbo.es2017-esm.js";
import helium from "/dist/helium-csp-turbo.min.js";

window.Turbo = Turbo;
window.__turboLifecycle ||= { inits: 0 };
if (document.readyState === "loading") {
  await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}
await helium({
  turboGreeting: () => "remembered",
  countInit: () => window.__turboLifecycle.inits++,
});
window.__turboReady = true;

export { Turbo, helium };

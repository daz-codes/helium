import * as Turbo from "/node_modules/@hotwired/turbo/dist/turbo.es2017-esm.js";
import helium from "/dist/helium-turbo.min.js";

window.Turbo = Turbo;
// Initial state passed once must still be available after Turbo renders.
const turboState = () => ({
  turboGreeting: () => "remembered",
  countInit: () => window.__turboLifecycle.inits++,
});
window.__turboLifecycle ||= { setups: 0, cleanups: 0, renders: [], inits: 0, rowsBeforeRender: [] };
window.trackTurboLifecycle = signal => {
  window.__turboLifecycle.setups++;
  signal.addEventListener("abort", () => window.__turboLifecycle.cleanups++, { once: true });
};
document.addEventListener("turbo:before-render", () => {
  window.__turboLifecycle.rowsBeforeRender.push(document.querySelectorAll(".cache-row").length);
});
document.addEventListener("turbo:render", event => {
  window.__turboLifecycle.renders.push(event.detail.renderMethod);
});
if (document.readyState === "loading") {
  await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}
window.__turboState = await helium(turboState());
window.__turboReady = true;

export { Turbo, helium };

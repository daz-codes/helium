import * as Turbo from "/node_modules/@hotwired/turbo/dist/turbo.es2017-esm.js";
import { createHelium } from "/dist/helium.min.js";

window.Turbo = Turbo;
const element = document.querySelector("#permanent-counter");
const instance = createHelium({ root: element });
window.__permanentElement = element;
window.__permanentApp = await instance.helium({ count: 0 });
window.__turboReady = true;

export { Turbo };

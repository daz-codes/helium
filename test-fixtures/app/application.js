// Entry point, loaded once per session the way importmap-rails loads it.
import * as Turbo from "@hotwired/turbo";
import helium from "@daz4126/helium/turbo";

window.Turbo = Turbo;
window.appLog = { setups: 0, cleanups: 0 };
// Shared helpers passed once; the adapter re-applies them on every page.
helium({
  formatCount: count => `${count} remaining`,
});
window.appReady = true;
